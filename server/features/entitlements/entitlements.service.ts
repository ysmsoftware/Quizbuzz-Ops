import { IEntitlementsRepository, EntitlementsRepository } from './entitlements.repository';
import { computeEffectiveLimits, LIMIT_FIELDS } from '../subscriptions/effective-limits';

export interface IEntitlementsService {
  syncOrgPlanLimitsCache(orgId: string): Promise<void>;
}

export class EntitlementsService implements IEntitlementsService {
  constructor(private repo: IEntitlementsRepository = new EntitlementsRepository()) {}

  async syncOrgPlanLimitsCache(orgId: string): Promise<void> {
    const sub = await this.repo.getSubscriptionWithPlanAndActiveOverrides(orgId);

    if (!sub || !sub.plan) return;

    // Numeric plan limits (contests/cycle, participants/contest,
    // questions/contest, org members): base value + stacked overrides,
    // computed by the single shared fold — see effective-limits.ts.
    const effective = computeEffectiveLimits(
      {
        maxContestsPerCycle: sub.plan.maxContestsPerCycle,
        maxParticipantsPerContest: sub.plan.maxParticipantsPerContest,
        maxQuestionsPerContest: sub.plan.maxQuestionsPerContest,
        maxOrgMembers: sub.plan.maxOrgMembers,
      },
      sub.overrides,
    );

    // Feature flags are booleans (on/off), not stackable numbers — "last
    // active override wins" is the correct semantic here, so this stays a
    // simple map rather than going through the numeric fold above.
    const featureOverrideMap = new Map<string, any>();
    for (const ov of sub.overrides) {
      if (!LIMIT_FIELDS.includes(ov.field as any)) {
        featureOverrideMap.set(ov.field, ov.value);
      }
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
      maxContestsPerCycle: effective.maxContestsPerCycle.value,
      maxParticipantsPerContest: effective.maxParticipantsPerContest.value,
      maxQuestionsPerContest: effective.maxQuestionsPerContest.value,
      maxOrgMembers: effective.maxOrgMembers.value,
      features: {
        proctoring: featureOverrideMap.has('featureProctoring')
          ? Boolean(featureOverrideMap.get('featureProctoring'))
          : sub.plan.featureProctoring,
        certBranding: featureOverrideMap.has('featureCertBranding')
          ? Boolean(featureOverrideMap.get('featureCertBranding'))
          : sub.plan.featureCertBranding,
        prioritySupport: featureOverrideMap.has('featurePrioritySupport')
          ? Boolean(featureOverrideMap.get('featurePrioritySupport'))
          : sub.plan.featurePrioritySupport,
        analyticsExport: featureOverrideMap.has('featureAnalyticsExport')
          ? Boolean(featureOverrideMap.get('featureAnalyticsExport'))
          : sub.plan.featureAnalyticsExport,
        customDomain: featureOverrideMap.has('featureCustomDomain')
          ? Boolean(featureOverrideMap.get('featureCustomDomain'))
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
