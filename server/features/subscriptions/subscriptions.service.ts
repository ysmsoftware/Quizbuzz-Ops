import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType, BillingCycle, OverrideMode } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { generateUlid } from '../../utils/ulid';
import { ISubscriptionsRepository, SubscriptionsRepository } from './subscriptions.repository';
import { IEntitlementsService, EntitlementsService } from '../entitlements/entitlements.service';
import { periodMonthsForCycle } from '../../../lib/pricing/subscriptionPricing';
import { computeEffectiveLimits } from './effective-limits';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';

/** Human-readable labels for override/limit-change emails — display only. */
const FIELD_LABELS: Record<string, string> = {
  maxContestsPerCycle: 'Contests per Month',
  maxParticipantsPerContest: 'Participants per Contest',
  maxQuestionsPerContest: 'Questions per Contest',
  maxOrgMembers: 'Organization Members',
  featureProctoring: 'Advanced Proctoring',
  featureCertBranding: 'Custom Certificate Branding',
  featureAnalyticsExport: 'Analytics Export',
  featurePrioritySupport: 'Priority Support',
  featureCustomDomain: 'Custom Domain',
};
function fieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

export interface ISubscriptionsService {
  getSubscription(orgId: string): Promise<any | null>;
  assignPlan(
    orgId: string,
    planId: string,
    actor: AuditActor,
    billingCycle?: BillingCycle,
    periodStart?: Date,
    linkedPaymentId?: string
  ): Promise<any>;
  changePlan(orgId: string, toPlanId: string, actor: AuditActor, billingCycle?: BillingCycle, reason?: string): Promise<any>;
  addOverride(
    orgId: string,
    field: string,
    value: any,
    reason: string,
    actor: AuditActor,
    expiresAt?: Date,
    mode?: OverrideMode,
  ): Promise<any>;
  removeOverride(orgId: string, overrideId: string, reason: string, actor: AuditActor): Promise<any>;
  resendRenewalReminder(orgId: string, actor: AuditActor): Promise<{ sent: boolean }>;
  resendReceipt(orgId: string, paymentId: string, actor: AuditActor): Promise<{ sent: boolean }>;
}

/**
 * Backward-compatible helper for legacy imports during rollout.
 */
export async function syncOrgPlanLimitsCache(orgId: string): Promise<void> {
  const service = new EntitlementsService();
  return service.syncOrgPlanLimitsCache(orgId);
}

export class SubscriptionsService implements ISubscriptionsService {
  constructor(
    private repo: ISubscriptionsRepository = new SubscriptionsRepository(),
    private entitlementsService: IEntitlementsService = new EntitlementsService()
  ) {}

  async getSubscription(orgId: string) {
    const sub = await this.repo.getSubscriptionDetail(orgId);

    if (!sub) return null;

    const effectiveLimits = computeEffectiveLimits(
      {
        maxContestsPerCycle: sub.plan.maxContestsPerCycle,
        maxParticipantsPerContest: sub.plan.maxParticipantsPerContest,
        maxQuestionsPerContest: sub.plan.maxQuestionsPerContest,
        maxOrgMembers: sub.plan.maxOrgMembers,
      },
      sub.overrides,
    );

    return {
      subscription: {
        id: sub.id,
        organizationId: sub.organizationId,
        status: sub.status,
        billingCycle: sub.billingCycle,
        periodMonths: sub.periodMonths,
        currentPeriodStart: sub.currentPeriodStart.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      },
      plan: {
        id: sub.plan.id,
        slug: sub.plan.slug,
        name: sub.plan.name,
      },
      effectiveLimits,
      overrides: sub.overrides.map((o: any) => ({
        id: o.id,
        field: o.field,
        value: o.value,
        mode: o.mode,
        reason: o.reason,
        expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
      })),
      changeHistory: sub.changes.map((c: any) => ({
        id: c.id,
        fromPlanId: c.fromPlanId,
        toPlanId: c.toPlanId,
        reason: c.changedVia,
        changedAt: c.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Resolves which billing cycle to use: the caller's explicit choice if the
   * plan actually offers it, otherwise whichever single cycle the plan does
   * offer. A plan offering both cycles requires an explicit choice.
   */
  private resolveBillingCycle(
    plan: { allowsMonthly: boolean; allowsAnnual: boolean; slug: string },
    requested?: BillingCycle
  ): BillingCycle {
    if (requested) {
      if (requested === 'MONTHLY' && !plan.allowsMonthly) {
        throw new Error(`Plan "${plan.slug}" does not offer monthly billing`);
      }
      if (requested === 'ANNUAL' && !plan.allowsAnnual) {
        throw new Error(`Plan "${plan.slug}" does not offer annual billing`);
      }
      return requested;
    }
    if (plan.allowsMonthly) return 'MONTHLY';
    if (plan.allowsAnnual) return 'ANNUAL';
    throw new Error(`Plan "${plan.slug}" does not offer any billing cycle`);
  }

  /**
   * @param linkedPaymentId When set (the paid-webhook path only), the
   *   subscription upsert and the OpsPayment.subscriptionId backfill run in
   *   one Postgres transaction. Without this, a transient failure in just the
   *   backfill step used to leave `subscriptionId` null on an already-PAID
   *   payment — which the webhook's own idempotency check reads as "not yet
   *   processed", causing a Razorpay retry to call assignPlan() a second time
   *   and silently reset currentPeriodStart/End to a fresh "now" for free.
   *   Wrapping both writes together means a failure here rolls back the
   *   subscription upsert too, so a retry cleanly redoes the whole thing
   *   exactly once instead of racing a half-applied prior attempt.
   */
  async assignPlan(
    orgId: string,
    planId: string,
    actor: AuditActor,
    billingCycle?: BillingCycle,
    periodStart?: Date,
    linkedPaymentId?: string
  ) {
    const plan = await this.repo.findPlanById(planId);
    if (!plan) throw new Error('Subscription plan not found');
    if (!plan.isActive) throw new Error('Cannot assign an inactive plan');

    const resolvedCycle = this.resolveBillingCycle(plan, billingCycle);
    const periodMonths = periodMonthsForCycle(resolvedCycle);

    const start = periodStart || new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + periodMonths);

    const subscriptionParams = {
      id: generateUlid(),
      organizationId: orgId,
      planId,
      status: 'ACTIVE' as const,
      billingCycle: resolvedCycle,
      periodMonths,
      currentPeriodStart: start,
      currentPeriodEnd: end,
    };

    const sub = linkedPaymentId
      ? await prisma.$transaction(async (tx) => {
          const s = await this.repo.upsertSubscription(subscriptionParams, tx);
          await this.repo.linkPayment(linkedPaymentId, s.id, tx);
          return s;
        })
      : await this.repo.upsertSubscription(subscriptionParams);

    // Cross-database write (main app's Postgres) — cannot join the
    // transaction above. If this throws, the subscription itself is already
    // safely committed; log it distinctly rather than let the failure look
    // like a generic 500, and let the nightly reconciliation job's
    // unconditional re-sync of every ACTIVE subscription self-heal it.
    try {
      await this.entitlementsService.syncOrgPlanLimitsCache(orgId);
    } catch (syncErr: any) {
      await writeAuditLogEntry(
        actor,
        'subscription.cache_sync_failed',
        AuditTargetType.SUBSCRIPTION,
        sub.id,
        plan.name,
        { organizationId: orgId, planId, error: syncErr?.message || String(syncErr) }
      );
    }

    await writeAuditLogEntry(
      actor,
      'subscription.created',
      AuditTargetType.SUBSCRIPTION,
      sub.id,
      plan.name,
      { organizationId: orgId, planId, planSlug: plan.slug, billingCycle: resolvedCycle, periodMonths, linkedPaymentId: linkedPaymentId || null }
    );

    return sub;
  }

  async changePlan(orgId: string, toPlanId: string, actor: AuditActor, billingCycle?: BillingCycle, reason?: string) {
    const currentSub = await this.repo.findSubscriptionByOrgId(orgId);
    if (!currentSub) {
      return this.assignPlan(orgId, toPlanId, actor, billingCycle);
    }

    const fromPlanId = currentSub.planId;
    const toPlan = await this.repo.findPlanById(toPlanId);
    if (!toPlan) throw new Error('Target plan not found');
    if (!toPlan.isActive) throw new Error('Cannot switch to an inactive plan');

    const resolvedCycle = this.resolveBillingCycle(toPlan, billingCycle);
    const periodMonths = periodMonthsForCycle(resolvedCycle);

    // Update subscription in ops DB
    const updatedSub = await this.repo.updateSubscriptionPlan(orgId, toPlanId, resolvedCycle, periodMonths);

    // Record change log
    await this.repo.createChangeLog({
      id: generateUlid(),
      subscriptionId: updatedSub.id,
      fromPlanId,
      toPlanId,
      changedById: actor.id!,
      changedVia: reason || 'Plan updated by operator',
    });

    // Sync main DB cache
    await this.entitlementsService.syncOrgPlanLimitsCache(orgId);

    await writeAuditLogEntry(
      actor,
      'subscription.plan_changed',
      AuditTargetType.SUBSCRIPTION,
      updatedSub.id,
      toPlan.name,
      { organizationId: orgId, fromPlanId, toPlanId }
    );

    const fromPlan = await this.repo.findPlanById(fromPlanId);
    await orgOwnerNotifier.notify(orgId, 'SUBSCRIPTION_PLAN_CHANGED', {
      fromPlan: fromPlan?.name || 'your previous plan',
      toPlan: toPlan.name,
    });

    return updatedSub;
  }

  async addOverride(
    orgId: string,
    field: string,
    value: any,
    reason: string,
    actor: AuditActor,
    expiresAt?: Date,
    // API-level default. Note this differs from the DB column's own default
    // (ABSOLUTE) — that one exists purely to keep pre-existing override rows
    // behaving exactly as they did before this field was added. Every
    // *new* override created through this method defaults to the "add to
    // what's already there" behavior instead, unless the caller opts into
    // ABSOLUTE (the AddOverrideModal "Set exact limit to" toggle).
    mode: OverrideMode = OverrideMode.ADDITIVE,
  ) {
    const sub = await this.repo.findSubscriptionByOrgId(orgId);
    if (!sub) throw new Error('Organization does not have an active subscription');

    const override = await this.repo.createOverride({
      id: generateUlid(),
      subscriptionId: sub.id,
      field,
      value: value === null ? null : (typeof value === 'number' ? value : parseInt(value, 10)),
      mode,
      reason,
      createdById: actor.id!,
      expiresAt,
    });

    await this.entitlementsService.syncOrgPlanLimitsCache(orgId);

    await writeAuditLogEntry(
      actor,
      'override.added',
      AuditTargetType.SUBSCRIPTION,
      sub.id,
      field,
      { organizationId: orgId, overrideId: override.id, field, value, reason }
    );

    const planForOverride = await this.repo.findPlanById(sub.planId);
    await orgOwnerNotifier.notify(orgId, 'SUBSCRIPTION_LIMIT_INCREASED', {
      planName: planForOverride?.name || 'your plan',
      fieldLabel: fieldLabel(field),
      newValue: override.value,
      reason,
      expiresAt: override.expiresAt ? override.expiresAt.toISOString().slice(0, 10) : null,
    });

    return override;
  }

  async removeOverride(orgId: string, overrideId: string, reason: string, actor: AuditActor) {
    const sub = await this.repo.findSubscriptionByOrgId(orgId);
    if (!sub) throw new Error('Subscription not found');

    const override = await this.repo.removeOverride(overrideId, actor.id!, reason);

    await this.entitlementsService.syncOrgPlanLimitsCache(orgId);

    await writeAuditLogEntry(
      actor,
      'override.removed',
      AuditTargetType.SUBSCRIPTION,
      sub.id,
      override.field,
      { organizationId: orgId, overrideId, reason }
    );

    const planForRemoval = await this.repo.findPlanById(sub.planId);
    await orgOwnerNotifier.notify(orgId, 'SUBSCRIPTION_LIMIT_DECREASED', {
      planName: planForRemoval?.name || 'your plan',
      fieldLabel: fieldLabel(override.field),
      wasExpiry: false,
    });

    return override;
  }

  /**
   * Ops-admin-triggered "remind them again" — bypasses the nightly job's
   * once-per-period guard entirely (renewalReminderSentAt is still updated
   * afterward so tonight's automatic run doesn't also fire one). Requires an
   * ACTIVE subscription with a still-future currentPeriodEnd — resending a
   * "your plan is about to expire" notice makes no sense once it already has.
   */
  async resendRenewalReminder(orgId: string, actor: AuditActor): Promise<{ sent: boolean }> {
    const sub = await this.repo.findSubscriptionByOrgId(orgId);
    if (!sub) throw new Error('Organization does not have a subscription');
    if (sub.status !== 'ACTIVE') throw new Error(`Cannot send a renewal reminder — subscription status is ${sub.status}`);

    const now = new Date();
    if (sub.currentPeriodEnd <= now) throw new Error('Subscription period has already ended — resend the expired notice instead');

    const plan = await this.repo.findPlanById(sub.planId);
    const daysRemaining = Math.max(1, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    const sent = await orgOwnerNotifier.notify(orgId, 'SUBSCRIPTION_RENEWAL_REMINDER', {
      planName: plan?.name || 'your plan',
      currentPeriodEnd: sub.currentPeriodEnd.toISOString().slice(0, 10),
      daysRemaining,
    });

    if (sent) {
      await this.repo.setRenewalReminderSent(orgId, now);
    }

    await writeAuditLogEntry(
      actor,
      'subscription.renewal_reminder_resent',
      AuditTargetType.SUBSCRIPTION,
      sub.id,
      plan?.name || 'Subscription',
      { organizationId: orgId, sent }
    );

    return { sent };
  }

  /**
   * Ops-admin-triggered resend of a past payment's itemized receipt — the
   * "sometimes we have to resend the billing receipt to the admin" case.
   * Only meaningful for a payment that actually completed.
   */
  async resendReceipt(orgId: string, paymentId: string, actor: AuditActor): Promise<{ sent: boolean }> {
    const payment = await prisma.opsPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment not found');
    if (payment.organizationId !== orgId) throw new Error('Payment does not belong to this organization');
    if (payment.status !== 'PAID') throw new Error(`Cannot resend a receipt — payment status is ${payment.status}`);

    const plan = payment.planId ? await this.repo.findPlanById(payment.planId) : null;

    const sent = await orgOwnerNotifier.notify(payment.organizationId, 'BILLING_RECEIPT', {
      planName: plan?.name || 'your plan',
      billingCycle: payment.billingCycle || 'MONTHLY',
      baseAmount: payment.baseAmount ? Number(payment.baseAmount) : 0,
      creditApplied: payment.creditApplied ? Number(payment.creditApplied) : 0,
      gatewayFeeAmount: payment.gatewayFeeAmount ? Number(payment.gatewayFeeAmount) : 0,
      gstAmount: payment.gstAmount ? Number(payment.gstAmount) : 0,
      amount: Number(payment.amount),
      paidAt: payment.paidAt ? payment.paidAt.toISOString().slice(0, 10) : null,
      razorpayPaymentId: payment.razorpayPaymentId,
      paymentId: payment.id,
    });

    await writeAuditLogEntry(
      actor,
      'billing_portal.receipt_resent',
      AuditTargetType.PAYMENT,
      payment.id,
      plan?.name || 'Payment',
      { organizationId: payment.organizationId, sent }
    );

    return { sent };
  }
}
export default SubscriptionsService;
