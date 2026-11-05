'use client';

import { SubscriptionPlan } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';
import type { SubscriptionPlanDetail } from '@/server/features/plans/plans.types';

function toStartingPrice(monthlyPrice: number | null, annualPrice: number | null): number {
  if (monthlyPrice != null) return monthlyPrice;
  if (annualPrice != null) return annualPrice;
  return 0;
}

function mapPlan(p: SubscriptionPlanDetail): SubscriptionPlan {
  const monthlyPrice = p.monthlyPrice != null ? Number(p.monthlyPrice) : null;
  const annualPrice = p.annualPrice != null ? Number(p.annualPrice) : null;

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    currency: p.currency,
    allowsMonthly: !!p.allowsMonthly,
    allowsAnnual: !!p.allowsAnnual,
    allowsHalfYearly: !!p.allowsHalfYearly,
    monthlyPrice,
    annualPrice,
    halfYearlyPrice: p.halfYearlyPrice != null ? Number(p.halfYearlyPrice) : null,
    isActive: p.isActive,
    isSellable: p.isSellable,
    kind: p.kind,
    audience: p.audience,
    organizationId: p.organizationId,
    limits: {
      maxContestsPerCycle: p.maxContestsPerCycle,
      maxParticipantsPerContest: p.maxParticipantsPerContest,
      maxQuestionsPerContest: p.maxQuestionsPerContest,
      maxOrgMembers: p.maxOrgMembers,
      maxLearners: p.maxLearners,
      maxCandidatesPerMonth: p.maxCandidatesPerMonth,
      aiCreditsPerMonth: p.aiCreditsPerMonth,
    },
    features: {
      proctoring: p.featureProctoring,
      customCertificateBranding: p.featureCertBranding,
      prioritySupport: p.featurePrioritySupport,
      analyticsExport: p.featureAnalyticsExport,
      customDomain: p.featureCustomDomain,
      learnerGroups: p.featureLearnerGroups,
      gradebook: p.featureGradebook,
      ambassadorCampaigns: p.featureAmbassadorCampaigns,
      manualEmails: p.featureManualEmails,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    priceINR: toStartingPrice(monthlyPrice, annualPrice),
    organizationCount: p.organizationCount || 0,
  };
}

export async function getPlans(includeInactive = true): Promise<SubscriptionPlan[]> {
  const result = await apiRequest<SubscriptionPlanDetail[]>(`/api/v1/ops/plans?includeInactive=${includeInactive}`);
  return result.map(mapPlan);
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  try {
    const p = await apiRequest<SubscriptionPlanDetail>(`/api/v1/ops/plans/${planId}`);
    return mapPlan(p);
  } catch {
    return null;
  }
}

export async function createSubscriptionPlan(
  plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt' | 'priceINR' | 'kind'>
): Promise<SubscriptionPlan> {
  const result = await apiRequest<SubscriptionPlanDetail>('/api/v1/ops/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      currency: plan.currency,
      allowsMonthly: plan.allowsMonthly,
      allowsAnnual: plan.allowsAnnual,
      allowsHalfYearly: plan.allowsHalfYearly,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      halfYearlyPrice: plan.halfYearlyPrice,
      isSellable: plan.isSellable,
      audience: plan.audience,
      organizationId: plan.organizationId,
      kind: plan.organizationId ? 'CUSTOM' : 'STANDARD',
      maxContestsPerCycle: plan.limits?.maxContestsPerCycle,
      maxParticipantsPerContest: plan.limits?.maxParticipantsPerContest,
      maxQuestionsPerContest: plan.limits?.maxQuestionsPerContest,
      maxOrgMembers: plan.limits?.maxOrgMembers,
      maxLearners: plan.limits?.maxLearners,
      maxCandidatesPerMonth: plan.limits?.maxCandidatesPerMonth,
      aiCreditsPerMonth: plan.limits?.aiCreditsPerMonth,
      featureProctoring: plan.features?.proctoring,
      featureCertBranding: plan.features?.customCertificateBranding,
      featurePrioritySupport: plan.features?.prioritySupport,
      featureAnalyticsExport: plan.features?.analyticsExport,
      featureCustomDomain: plan.features?.customDomain,
      featureLearnerGroups: plan.features?.learnerGroups,
      featureGradebook: plan.features?.gradebook,
      featureAmbassadorCampaigns: plan.features?.ambassadorCampaigns,
      featureManualEmails: plan.features?.manualEmails,
    }),
  });

  return mapPlan(result);
}

export async function updateSubscriptionPlan(planId: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.allowsMonthly !== undefined) payload.allowsMonthly = updates.allowsMonthly;
  if (updates.allowsAnnual !== undefined) payload.allowsAnnual = updates.allowsAnnual;
  if (updates.monthlyPrice !== undefined) payload.monthlyPrice = updates.monthlyPrice;
  if (updates.annualPrice !== undefined) payload.annualPrice = updates.annualPrice;
  if (updates.allowsHalfYearly !== undefined) payload.allowsHalfYearly = updates.allowsHalfYearly;
  if (updates.halfYearlyPrice !== undefined) payload.halfYearlyPrice = updates.halfYearlyPrice;
  if (updates.isSellable !== undefined) payload.isSellable = updates.isSellable;
  if (updates.audience !== undefined) payload.audience = updates.audience;
  if (updates.limits) {
    if (updates.limits.maxContestsPerCycle !== undefined) payload.maxContestsPerCycle = updates.limits.maxContestsPerCycle;
    if (updates.limits.maxParticipantsPerContest !== undefined) payload.maxParticipantsPerContest = updates.limits.maxParticipantsPerContest;
    if (updates.limits.maxQuestionsPerContest !== undefined) payload.maxQuestionsPerContest = updates.limits.maxQuestionsPerContest;
    if (updates.limits.maxOrgMembers !== undefined) payload.maxOrgMembers = updates.limits.maxOrgMembers;
    if (updates.limits.maxLearners !== undefined) payload.maxLearners = updates.limits.maxLearners;
    if (updates.limits.maxCandidatesPerMonth !== undefined) payload.maxCandidatesPerMonth = updates.limits.maxCandidatesPerMonth;
    if (updates.limits.aiCreditsPerMonth !== undefined) payload.aiCreditsPerMonth = updates.limits.aiCreditsPerMonth;
  }
  if (updates.features) {
    if (updates.features.proctoring !== undefined) payload.featureProctoring = updates.features.proctoring;
    if (updates.features.customCertificateBranding !== undefined) payload.featureCertBranding = updates.features.customCertificateBranding;
    if (updates.features.prioritySupport !== undefined) payload.featurePrioritySupport = updates.features.prioritySupport;
    if (updates.features.analyticsExport !== undefined) payload.featureAnalyticsExport = updates.features.analyticsExport;
    if (updates.features.customDomain !== undefined) payload.featureCustomDomain = updates.features.customDomain;
    if (updates.features.learnerGroups !== undefined) payload.featureLearnerGroups = updates.features.learnerGroups;
    if (updates.features.gradebook !== undefined) payload.featureGradebook = updates.features.gradebook;
    if (updates.features.ambassadorCampaigns !== undefined) payload.featureAmbassadorCampaigns = updates.features.ambassadorCampaigns;
    if (updates.features.manualEmails !== undefined) payload.featureManualEmails = updates.features.manualEmails;
  }

  const result = await apiRequest<SubscriptionPlanDetail>(`/api/v1/ops/plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return mapPlan(result);
}

export async function getPlanImpact(planId: string): Promise<{ organizationCount: number; organizations: Array<{ id: string; name?: string }> }> {
  return apiRequest(`/api/v1/ops/plans/${planId}/impact`);
}

export async function deactivateSubscriptionPlan(planId: string): Promise<void> {
  await apiRequest(`/api/v1/ops/plans/${planId}/deactivate`, {
    method: 'POST',
  });
}
