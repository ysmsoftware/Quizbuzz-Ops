import { IPlansRepository, PlansRepository } from './plans.repository';
import { IEntitlementsService, EntitlementsService } from '../entitlements/entitlements.service';
import { ISubscriptionsRepository, SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';
import { SubscriptionPlanDetail } from './plans.types';

export interface IPlansService {
  getPlans(includeInactive?: boolean): Promise<SubscriptionPlanDetail[]>;
  getPlanById(id: string): Promise<SubscriptionPlanDetail | null>;
  createPlan(input: any, actor: AuditActor): Promise<any>;
  updatePlan(id: string, updates: any, actor: AuditActor): Promise<any>;
  getImpact(id: string): Promise<{ organizationCount: number; organizations: { id: string }[] }>;
  deactivatePlan(id: string, actor: AuditActor): Promise<any>;
}

export class PlansService implements IPlansService {
  constructor(
    private repo: IPlansRepository = new PlansRepository(),
    private entitlementsService: IEntitlementsService = new EntitlementsService(),
    private subscriptionsRepo: ISubscriptionsRepository = new SubscriptionsRepository()
  ) {}

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
    const activeSubs = await this.subscriptionsRepo.findActiveSubscriptionsByPlanId(id);

    // Recompute and push to main DB for each affected org
    await Promise.all(
      activeSubs.map((sub) => this.entitlementsService.syncOrgPlanLimitsCache(sub.organizationId))
    );

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
    const activeSubs = await this.subscriptionsRepo.findActiveSubscriptionsByPlanId(id);
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
