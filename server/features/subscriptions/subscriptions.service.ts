import { prisma } from '../../db/ops-prisma';
import { queryMainDb } from '../../db/main-db-pool';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';

/**
 * Computes effective limits (overrides > plan limits) and writes the JSON cache 
 * to the main application's `organizations` table.
 */
export async function syncOrgPlanLimitsCache(orgId: string): Promise<void> {
  const sub = await prisma.organizationSubscription.findUnique({
    where: { organizationId: orgId },
    include: {
      plan: true,
      overrides: {
        where: {
          removedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
    },
  });

  if (!sub || !sub.plan) return;

  const overrideMap = new Map<string, any>();
  for (const ov of sub.overrides) {
    overrideMap.set(ov.field, ov.value);
  }

  const cachePayload = {
    maxContestsPerCycle: overrideMap.has('maxContestsPerCycle') ? overrideMap.get('maxContestsPerCycle') : sub.plan.maxContestsPerCycle,
    maxParticipantsPerContest: overrideMap.has('maxParticipantsPerContest') ? overrideMap.get('maxParticipantsPerContest') : sub.plan.maxParticipantsPerContest,
    maxQuestionsPerContest: overrideMap.has('maxQuestionsPerContest') ? overrideMap.get('maxQuestionsPerContest') : sub.plan.maxQuestionsPerContest,
    maxOrgMembers: overrideMap.has('maxOrgMembers') ? overrideMap.get('maxOrgMembers') : sub.plan.maxOrgMembers,
    features: {
      proctoring: overrideMap.has('featureProctoring') ? Boolean(overrideMap.get('featureProctoring')) : sub.plan.featureProctoring,
      certBranding: overrideMap.has('featureCertBranding') ? Boolean(overrideMap.get('featureCertBranding')) : sub.plan.featureCertBranding,
      prioritySupport: overrideMap.has('featurePrioritySupport') ? Boolean(overrideMap.get('featurePrioritySupport')) : sub.plan.featurePrioritySupport,
      analyticsExport: overrideMap.has('featureAnalyticsExport') ? Boolean(overrideMap.get('featureAnalyticsExport')) : sub.plan.featureAnalyticsExport,
      customDomain: overrideMap.has('featureCustomDomain') ? Boolean(overrideMap.get('featureCustomDomain')) : sub.plan.featureCustomDomain,
    },
    computedAt: new Date().toISOString(),
  };

  // Write to main DB
  await queryMainDb(`
    UPDATE organizations
    SET "planSlug" = $1, "planStatus" = $2, "planLimitsCache" = $3, "updatedAt" = NOW()
    WHERE id = $4
  `, [sub.plan.slug, sub.status, JSON.stringify(cachePayload), orgId]);
}

export class SubscriptionsService {
  async getSubscription(orgId: string) {
    const sub = await prisma.organizationSubscription.findUnique({
      where: { organizationId: orgId },
      include: {
        plan: true,
        overrides: {
          where: { removedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        changes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

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
      overrides: sub.overrides.map((o) => ({
        id: o.id,
        field: o.field,
        value: o.value,
        reason: o.reason,
        expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
      })),
      changeHistory: sub.changes.map((c) => ({
        id: c.id,
        fromPlanId: c.fromPlanId,
        toPlanId: c.toPlanId,
        reason: c.changedVia,
        changedAt: c.createdAt.toISOString(),
      })),
    };
  }

  async assignPlan(orgId: string, planId: string, actor: AuditActor, periodStart?: Date, periodEnd?: Date) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Subscription plan not found');
    if (!plan.isActive) throw new Error('Cannot assign an inactive plan');

    const now = new Date();
    const start = periodStart || now;
    const end = periodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const sub = await prisma.organizationSubscription.upsert({
      where: { organizationId: orgId },
      update: {
        planId,
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
      create: {
        id: generateUlid(),
        organizationId: orgId,
        planId,
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });

    await syncOrgPlanLimitsCache(orgId);

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
    const currentSub = await prisma.organizationSubscription.findUnique({ where: { organizationId: orgId } });
    if (!currentSub) {
      return this.assignPlan(orgId, toPlanId, actor);
    }

    const fromPlanId = currentSub.planId;
    const toPlan = await prisma.subscriptionPlan.findUnique({ where: { id: toPlanId } });
    if (!toPlan) throw new Error('Target plan not found');
    if (!toPlan.isActive) throw new Error('Cannot switch to an inactive plan');

    // Update subscription in ops DB
    const updatedSub = await prisma.organizationSubscription.update({
      where: { organizationId: orgId },
      data: {
        planId: toPlanId,
        updatedAt: new Date(),
      },
    });

    // Record change log
    await prisma.subscriptionChangeLog.create({
      data: {
        id: generateUlid(),
        subscriptionId: updatedSub.id,
        fromPlanId,
        toPlanId,
        changedById: actor.id!,
        changedVia: reason || 'Plan updated by operator',
      },
    });

    // Sync main DB cache
    await syncOrgPlanLimitsCache(orgId);

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
    const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId: orgId } });
    if (!sub) throw new Error('Organization does not have an active subscription');

    const override = await prisma.subscriptionOverride.create({
      data: {
        id: generateUlid(),
        subscriptionId: sub.id,
        field,
        value: typeof value === 'number' ? value : parseInt(value, 10),
        reason,
        createdById: actor.id!,
        expiresAt,
      },
    });

    await syncOrgPlanLimitsCache(orgId);

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
    const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId: orgId } });
    if (!sub) throw new Error('Subscription not found');

    const override = await prisma.subscriptionOverride.update({
      where: { id: overrideId },
      data: {
        removedAt: new Date(),
        removedById: actor.id!,
        removedReason: reason,
      },
    });

    await syncOrgPlanLimitsCache(orgId);

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
