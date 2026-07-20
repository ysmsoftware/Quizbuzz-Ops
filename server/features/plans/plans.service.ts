import { PlansRepository } from './plans.repository';
import { prisma } from '../../db/ops-prisma';
import { syncOrgPlanLimitsCache } from '../subscriptions/subscriptions.service';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';
import { SubscriptionPlanDetail } from './plans.types';

export class PlansService {
  private repo = new PlansRepository();

  async getPlans(includeInactive = false): Promise<SubscriptionPlanDetail[]> {
    const rawPlans = await this.repo.getPlans(includeInactive);
    return rawPlans.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description || '',
      price: Number(p.price),
      currency: p.currency,
      billingCycle: p.billingCycle,
      isActive: p.isActive,
      maxContestsPerCycle: p.maxContestsPerCycle,
      maxParticipantsPerContest: p.maxParticipantsPerContest,
      maxQuestionsPerContest: p.maxQuestionsPerContest,
      maxOrgMembers: p.maxOrgMembers,
      featureProctoring: p.featureProctoring,
      featureCertBranding: p.featureCertBranding,
      featurePrioritySupport: p.featurePrioritySupport,
      featureAnalyticsExport: p.featureAnalyticsExport,
      featureCustomDomain: p.featureCustomDomain,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      organizationCount: p.subscriptions.length,
    }));
  }

  async getPlanById(id: string): Promise<SubscriptionPlanDetail | null> {
    const p = await this.repo.getPlanById(id);
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description || '',
      price: Number(p.price),
      currency: p.currency,
      billingCycle: p.billingCycle,
      isActive: p.isActive,
      maxContestsPerCycle: p.maxContestsPerCycle,
      maxParticipantsPerContest: p.maxParticipantsPerContest,
      maxQuestionsPerContest: p.maxQuestionsPerContest,
      maxOrgMembers: p.maxOrgMembers,
      featureProctoring: p.featureProctoring,
      featureCertBranding: p.featureCertBranding,
      featurePrioritySupport: p.featurePrioritySupport,
      featureAnalyticsExport: p.featureAnalyticsExport,
      featureCustomDomain: p.featureCustomDomain,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      organizationCount: p.subscriptions.length,
    };
  }

  async createPlan(input: any, actor: AuditActor) {
    const planId = `plan_${input.slug.toLowerCase().replace(/\s+/g, '_')}_${generateUlid().slice(-6)}`;
    const plan = await this.repo.createPlan({
      id: planId,
      ...input,
    });

    await writeAuditLogEntry(
      actor,
      'plan.created',
      AuditTargetType.PLAN,
      plan.id,
      plan.name,
      { slug: plan.slug, price: plan.price }
    );

    return plan;
  }

  async updatePlan(id: string, updates: any, actor: AuditActor) {
    const oldPlan = await this.repo.getPlanById(id);
    if (!oldPlan) throw new Error('Subscription plan not found');

    const updatedPlan = await this.repo.updatePlan(id, updates);

    // Sync effective limits for all active subscribers on this plan
    const activeSubs = await prisma.organizationSubscription.findMany({
      where: { planId: id, status: 'ACTIVE' },
    });

    // Recompute and push to main DB for each affected org
    await Promise.all(activeSubs.map((sub) => syncOrgPlanLimitsCache(sub.organizationId)));

    await writeAuditLogEntry(
      actor,
      'plan.updated',
      AuditTargetType.PLAN,
      id,
      updatedPlan.name,
      { updates }
    );

    return updatedPlan;
  }

  async getImpact(id: string) {
    const activeSubs = await prisma.organizationSubscription.findMany({
      where: { planId: id, status: 'ACTIVE' },
    });
    return {
      organizationCount: activeSubs.length,
      organizations: activeSubs.map((s) => ({ id: s.organizationId })),
    };
  }

  async deactivatePlan(id: string, actor: AuditActor) {
    const plan = await this.repo.deactivatePlan(id);

    await writeAuditLogEntry(
      actor,
      'plan.deactivated',
      AuditTargetType.PLAN,
      id,
      plan.name,
      {}
    );

    return plan;
  }
}
export default PlansService;
