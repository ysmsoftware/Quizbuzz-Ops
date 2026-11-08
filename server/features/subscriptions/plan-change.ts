import { AuditTargetType, type BillingCycle, type SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { generateUlid } from '../../utils/ulid';
import { writeAuditLogEntry, SYSTEM_ACTOR, type AuditActor } from '../../audit/audit-writer';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';
import { ConflictError, NotFoundError } from '../../http/errors';
import { cycleTerm, periodMonthsForCycle } from '@/lib/pricing/subscriptionPricing';
import { syncOrgPlanLimitsCache } from './subscriptions.service';

/**
 * Upgrades start now (paid, after a credit for unused time). Downgrades and shorter cycles wait for the
 * period end, so nobody loses days they paid for. Ops can schedule any change for the period end too.
 */

export { changeTiming, monthlyRate } from './plan-timing';
import { changeTiming } from './plan-timing';

export async function scheduleChange(organizationId: string, planId: string, cycle: BillingCycle, actor: AuditActor, reason: string) {
  const [sub, plan] = await Promise.all([
    prisma.organizationSubscription.findUnique({ where: { organizationId }, include: { plan: true } }),
    prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
  ]);
  if (!sub) throw new NotFoundError('Organization does not have a subscription');
  if (!plan || !plan.isActive) throw new NotFoundError('Plan not found or inactive');
  if (plan.id === sub.planId && cycle === sub.billingCycle) throw new ConflictError(`Already on ${plan.name}, ${cycleTerm(cycle)}.`);
  if (sub.plan.kind === 'FREE') throw new ConflictError('The Free plan has no period end. Change it now instead.');

  await prisma.organizationSubscription.update({
    where: { id: sub.id },
    data: { scheduledPlanId: plan.id, scheduledBillingCycle: cycle, scheduledReason: reason, scheduledById: actor.id },
  });
  await writeAuditLogEntry(actor, 'subscription.change_scheduled', AuditTargetType.SUBSCRIPTION, sub.id, plan.name, {
    organizationId, fromPlanId: sub.planId, toPlanId: plan.id, billingCycle: cycle, on: sub.currentPeriodEnd.toISOString(), reason,
  });
  await orgOwnerNotifier.notify(organizationId, 'SUBSCRIPTION_CHANGE_SCHEDULED', {
    fromPlan: sub.plan.name,
    toPlan: plan.name,
    cycle: cycleTerm(cycle),
    on: sub.currentPeriodEnd.toISOString().slice(0, 10),
    // Razorpay can't change what a mandate charges: a new price needs the owner's approval again.
    needsNewMandate: sub.collectionMethod === 'AUTO_DEBIT',
  });
}

export async function cancelScheduledChange(organizationId: string, actor: AuditActor) {
  const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId } });
  if (!sub?.scheduledPlanId) throw new ConflictError('No change is scheduled.');
  await prisma.organizationSubscription.update({
    where: { id: sub.id },
    data: { scheduledPlanId: null, scheduledBillingCycle: null, scheduledReason: null, scheduledById: null },
  });
  await writeAuditLogEntry(actor, 'subscription.change_unscheduled', AuditTargetType.SUBSCRIPTION, sub.id, sub.scheduledPlanId, { organizationId });
}

/** Switches the plan, keeping the dates: the next payment is for the new plan. */
export async function applyScheduledChange(organizationId: string, actor: AuditActor = SYSTEM_ACTOR): Promise<boolean> {
  const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId }, include: { plan: true } });
  if (!sub?.scheduledPlanId) return false;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: sub.scheduledPlanId } });
  if (!plan) return false;
  const cycle = sub.scheduledBillingCycle ?? sub.billingCycle;
  await prisma.$transaction([
    prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        planId: plan.id, billingCycle: cycle, periodMonths: periodMonthsForCycle(cycle),
        scheduledPlanId: null, scheduledBillingCycle: null, scheduledReason: null, scheduledById: null,
      },
    }),
    prisma.subscriptionChangeLog.create({
      data: { id: generateUlid(), subscriptionId: sub.id, fromPlanId: sub.planId, toPlanId: plan.id, changedById: sub.scheduledById, changedVia: sub.scheduledReason ?? 'Scheduled change' },
    }),
  ]);
  await syncOrgPlanLimitsCache(organizationId).catch((err) => console.error(`[plan-change] cache sync for ${organizationId}:`, err));
  await writeAuditLogEntry(actor, 'subscription.plan_changed', AuditTargetType.SUBSCRIPTION, sub.id, plan.name, {
    organizationId, fromPlanId: sub.planId, toPlanId: plan.id, scheduled: true,
  });
  await orgOwnerNotifier.notify(organizationId, 'SUBSCRIPTION_PLAN_CHANGED', { fromPlan: sub.plan.name, toPlan: plan.name });
  return true;
}

/**
 * Hourly. Auto-debit orgs wait for Razorpay's charge (applyCharge takes the new plan if the price matches),
 * and fall back to this a day later so a failed charge can't leave the change hanging.
 */
export async function applyDueScheduledChanges(now = new Date()): Promise<number> {
  const due = await prisma.organizationSubscription.findMany({
    where: { scheduledPlanId: { not: null }, currentPeriodEnd: { lte: now } },
    select: { organizationId: true, collectionMethod: true, currentPeriodEnd: true },
  });
  let applied = 0;
  for (const s of due) {
    if (s.collectionMethod === 'AUTO_DEBIT' && now.getTime() < s.currentPeriodEnd.getTime() + 24 * 60 * 60_000) continue;
    try {
      if (await applyScheduledChange(s.organizationId)) applied++;
    } catch (err) {
      console.error(`[plan-change] Scheduled change for ${s.organizationId} failed:`, err);
    }
  }
  return applied;
}

/**
 * Ops moves everyone on one plan to another, usually a new version. "renewal" schedules it for each
 * org's period end, so prepaid time keeps its price; "now" switches at once, keeping dates.
 */
export async function migratePlanSubscribers(
  fromPlanId: string,
  input: { toPlanId: string; when: 'now' | 'renewal'; dryRun: boolean; reason: string },
  actor: AuditActor,
) {
  if (fromPlanId === input.toPlanId) throw new ConflictError('Pick a different plan to move them to.');
  const [from, to] = await Promise.all([
    prisma.subscriptionPlan.findUnique({ where: { id: fromPlanId } }),
    prisma.subscriptionPlan.findUnique({ where: { id: input.toPlanId } }),
  ]);
  if (!from || !to) throw new NotFoundError('Plan not found');
  if (!to.isActive) throw new ConflictError(`${to.name} is inactive.`);
  if (to.organizationId) throw new ConflictError(`${to.name} is private to one organization.`);

  const subs = await prisma.organizationSubscription.findMany({ where: { planId: fromPlanId }, select: { organizationId: true, collectionMethod: true, billingCycle: true } });
  const offersCycle = (c: BillingCycle) => (c === 'MONTHLY' ? to.allowsMonthly : c === 'HALF_YEARLY' ? to.allowsHalfYearly : c === 'ANNUAL' ? to.allowsAnnual : true);
  const movable = subs.filter((s) => offersCycle(s.billingCycle));
  const byMethod = movable.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.collectionMethod]: (acc[s.collectionMethod] ?? 0) + 1 }), {});
  const preview = {
    total: subs.length,
    movable: movable.length,
    // Their cycle isn't on the new plan: ops moves them one by one.
    skipped: subs.length - movable.length,
    byMethod,
    autoDebitNeedingApproval: input.when === 'renewal' ? (byMethod.AUTO_DEBIT ?? 0) : 0,
  };
  if (input.dryRun) return { ...preview, moved: 0 };

  let moved = 0;
  for (const s of movable) {
    try {
      if (input.when === 'renewal') {
        await scheduleChange(s.organizationId, to.id, s.billingCycle, actor, input.reason);
      } else {
        await prisma.organizationSubscription.update({ where: { organizationId: s.organizationId }, data: { scheduledPlanId: to.id, scheduledBillingCycle: s.billingCycle, scheduledReason: input.reason, scheduledById: actor.id } });
        await applyScheduledChange(s.organizationId, actor);
      }
      moved++;
    } catch (err) {
      console.error(`[plan-change] Moving ${s.organizationId} failed:`, err);
    }
  }
  await writeAuditLogEntry(actor, 'plan.subscribers_moved', AuditTargetType.SUBSCRIPTION, fromPlanId, from.name, { ...preview, toPlanId: to.id, when: input.when, moved, reason: input.reason });
  return { ...preview, moved };
}
