import { IEntitlementsRepository, EntitlementsRepository } from './entitlements.repository';

export interface IEntitlementsService {
  syncOrgPlanLimitsCache(orgId: string): Promise<void>;
}

export class EntitlementsService implements IEntitlementsService {
  constructor(private repo: IEntitlementsRepository = new EntitlementsRepository()) {}

  async syncOrgPlanLimitsCache(orgId: string): Promise<void> {
    const sub = await this.repo.getSubscriptionWithPlanAndActiveOverrides(orgId);

    if (!sub || !sub.plan) return;

    const overrideMap = new Map<string, any>();
    for (const ov of sub.overrides) {
      overrideMap.set(ov.field, ov.value);
    }

    const cachePayload = {
      // Basic plan-choice + renewal info — read-only display data for the
      // main app's Settings "Plan & Billing" tab. Not used for entitlement
      // enforcement (the limits below are), so staleness between syncs is
      // harmless: it only changes when a plan is assigned/changed/renewed,
      // which is exactly when this function runs.
      billingCycle: sub.billingCycle,
      periodMonths: sub.periodMonths,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      maxContestsPerCycle: overrideMap.has('maxContestsPerCycle')
        ? overrideMap.get('maxContestsPerCycle')
        : sub.plan.maxContestsPerCycle,
      maxParticipantsPerContest: overrideMap.has('maxParticipantsPerContest')
        ? overrideMap.get('maxParticipantsPerContest')
        : sub.plan.maxParticipantsPerContest,
      maxQuestionsPerContest: overrideMap.has('maxQuestionsPerContest')
        ? overrideMap.get('maxQuestionsPerContest')
        : sub.plan.maxQuestionsPerContest,
      maxOrgMembers: overrideMap.has('maxOrgMembers')
        ? overrideMap.get('maxOrgMembers')
        : sub.plan.maxOrgMembers,
      features: {
        proctoring: overrideMap.has('featureProctoring')
          ? Boolean(overrideMap.get('featureProctoring'))
          : sub.plan.featureProctoring,
        certBranding: overrideMap.has('featureCertBranding')
          ? Boolean(overrideMap.get('featureCertBranding'))
          : sub.plan.featureCertBranding,
        prioritySupport: overrideMap.has('featurePrioritySupport')
          ? Boolean(overrideMap.get('featurePrioritySupport'))
          : sub.plan.featurePrioritySupport,
        analyticsExport: overrideMap.has('featureAnalyticsExport')
          ? Boolean(overrideMap.get('featureAnalyticsExport'))
          : sub.plan.featureAnalyticsExport,
        customDomain: overrideMap.has('featureCustomDomain')
          ? Boolean(overrideMap.get('featureCustomDomain'))
          : sub.plan.featureCustomDomain,
      },
      computedAt: new Date().toISOString(),
    };

    await this.repo.updateMainDbPlanLimitsCache(
      orgId,
      sub.plan.slug,
      sub.status,
      JSON.stringify(cachePayload)
    );
  }
}
export default EntitlementsService;
