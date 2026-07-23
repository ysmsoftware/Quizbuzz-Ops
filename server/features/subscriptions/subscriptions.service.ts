import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';
import { ISubscriptionsRepository, SubscriptionsRepository } from './subscriptions.repository';
import { IEntitlementsService, EntitlementsService } from '../entitlements/entitlements.service';

export interface ISubscriptionsService {
  getSubscription(orgId: string): Promise<any | null>;
  assignPlan(orgId: string, planId: string, actor: AuditActor, periodStart?: Date, periodEnd?: Date): Promise<any>;
  changePlan(orgId: string, toPlanId: string, actor: AuditActor, reason?: string): Promise<any>;
  addOverride(orgId: string, field: string, value: any, reason: string, actor: AuditActor, expiresAt?: Date): Promise<any>;
  removeOverride(orgId: string, overrideId: string, reason: string, actor: AuditActor): Promise<any>;
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

    // Calculate effective limits breakdown
    const overrideMap = new Map<string, any>();
    for (const ov of sub.overrides) {
      if (!ov.expiresAt || ov.expiresAt > new Date()) {
        overrideMap.set(ov.field, ov.value);
      }
    }

    const effectiveLimits = {
      maxContestsPerCycle: {
        value: overrideMap.has('maxContestsPerCycle') ? overrideMap.get('maxContestsPerCycle') : sub.plan.maxContestsPerCycle,
        planValue: sub.plan.maxContestsPerCycle,
        overridden: overrideMap.has('maxContestsPerCycle'),
      },
      maxParticipantsPerContest: {
        value: overrideMap.has('maxParticipantsPerContest') ? overrideMap.get('maxParticipantsPerContest') : sub.plan.maxParticipantsPerContest,
        planValue: sub.plan.maxParticipantsPerContest,
        overridden: overrideMap.has('maxParticipantsPerContest'),
      },
      maxQuestionsPerContest: {
        value: overrideMap.has('maxQuestionsPerContest') ? overrideMap.get('maxQuestionsPerContest') : sub.plan.maxQuestionsPerContest,
        planValue: sub.plan.maxQuestionsPerContest,
        overridden: overrideMap.has('maxQuestionsPerContest'),
      },
      maxOrgMembers: {
        value: overrideMap.has('maxOrgMembers') ? overrideMap.get('maxOrgMembers') : sub.plan.maxOrgMembers,
        planValue: sub.plan.maxOrgMembers,
        overridden: overrideMap.has('maxOrgMembers'),
      },
    };

    return {
      subscription: {
        id: sub.id,
        organizationId: sub.organizationId,
        status: sub.status,
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

  async assignPlan(orgId: string, planId: string, actor: AuditActor, periodStart?: Date, periodEnd?: Date) {
    const plan = await this.repo.findPlanById(planId);
    if (!plan) throw new Error('Subscription plan not found');
    if (!plan.isActive) throw new Error('Cannot assign an inactive plan');

    const now = new Date();
    const start = periodStart || now;
    const end = periodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const sub = await this.repo.upsertSubscription({
      id: generateUlid(),
      organizationId: orgId,
      planId,
      status: 'ACTIVE',
      currentPeriodStart: start,
      currentPeriodEnd: end,
    });

    await this.entitlementsService.syncOrgPlanLimitsCache(orgId);

    await writeAuditLogEntry(
      actor,
      'subscription.created',
      AuditTargetType.SUBSCRIPTION,
      sub.id,
      plan.name,
      { organizationId: orgId, planId, planSlug: plan.slug }
    );

    return sub;
  }

  async changePlan(orgId: string, toPlanId: string, actor: AuditActor, reason?: string) {
    const currentSub = await this.repo.findSubscriptionByOrgId(orgId);
    if (!currentSub) {
      return this.assignPlan(orgId, toPlanId, actor);
    }

    const fromPlanId = currentSub.planId;
    const toPlan = await this.repo.findPlanById(toPlanId);
    if (!toPlan) throw new Error('Target plan not found');
    if (!toPlan.isActive) throw new Error('Cannot switch to an inactive plan');

    // Update subscription in ops DB
    const updatedSub = await this.repo.updateSubscriptionPlan(orgId, toPlanId);

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

    return updatedSub;
  }

  async addOverride(
    orgId: string,
    field: string,
    value: any,
    reason: string,
    actor: AuditActor,
    expiresAt?: Date
  ) {
    const sub = await this.repo.findSubscriptionByOrgId(orgId);
    if (!sub) throw new Error('Organization does not have an active subscription');

    const override = await this.repo.createOverride({
      id: generateUlid(),
      subscriptionId: sub.id,
      field,
      value: typeof value === 'number' ? value : parseInt(value, 10),
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

    return override;
  }
}
export default SubscriptionsService;
