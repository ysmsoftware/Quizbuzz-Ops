'use client';

import { SubscriptionPlan } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

function toStartingPrice(monthlyPrice: number | null, annualPrice: number | null): number {
  if (monthlyPrice != null) return monthlyPrice;
  if (annualPrice != null) return annualPrice;
  return 0;
}

function mapPlan(p: any): SubscriptionPlan {
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
    monthlyPrice,
    annualPrice,
    isActive: p.isActive,
    limits: {
      maxContestsPerCycle: p.maxContestsPerCycle,
      maxParticipantsPerContest: p.maxParticipantsPerContest,
      maxQuestionsPerContest: p.maxQuestionsPerContest,
      maxOrgMembers: p.maxOrgMembers,
    },
    features: {
      proctoring: p.featureProctoring,
      customCertificateBranding: p.featureCertBranding,
      prioritySupport: p.featurePrioritySupport,
      analyticsExport: p.featureAnalyticsExport,
      customDomain: p.featureCustomDomain,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    priceINR: toStartingPrice(monthlyPrice, annualPrice),
    organizationCount: p.organizationCount || 0,
  };
}

export async function getPlans(includeInactive = true): Promise<SubscriptionPlan[]> {
  const result = await apiRequest<any[]>(`/api/v1/ops/plans?includeInactive=${includeInactive}`);
  return result.map(mapPlan);
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  try {
    const p = await apiRequest<any>(`/api/v1/ops/plans/${planId}`);
    return mapPlan(p);
  } catch (err) {
    return null;
  }
}

export async function createSubscriptionPlan(
  plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt' | 'priceINR'>
): Promise<SubscriptionPlan> {
  const result = await apiRequest<any>('/api/v1/ops/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      currency: plan.currency,
      allowsMonthly: plan.allowsMonthly,
      allowsAnnual: plan.allowsAnnual,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      maxContestsPerCycle: plan.limits?.maxContestsPerCycle,
      maxParticipantsPerContest: plan.limits?.maxParticipantsPerContest,
      maxQuestionsPerContest: plan.limits?.maxQuestionsPerContest,
      maxOrgMembers: plan.limits?.maxOrgMembers,
      featureProctoring: plan.features?.proctoring,
      featureCertBranding: plan.features?.customCertificateBranding,
      featurePrioritySupport: plan.features?.prioritySupport,
      featureAnalyticsExport: plan.features?.analyticsExport,
      featureCustomDomain: plan.features?.customDomain,
    }),
  });

  return mapPlan(result);
}

export async function updateSubscriptionPlan(planId: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.allowsMonthly !== undefined) payload.allowsMonthly = updates.allowsMonthly;
  if (updates.allowsAnnual !== undefined) payload.allowsAnnual = updates.allowsAnnual;
  if (updates.monthlyPrice !== undefined) payload.monthlyPrice = updates.monthlyPrice;
  if (updates.annualPrice !== undefined) payload.annualPrice = updates.annualPrice;
  if (updates.limits) {
    if (updates.limits.maxContestsPerCycle !== undefined) payload.maxContestsPerCycle = updates.limits.maxContestsPerCycle;
    if (updates.limits.maxParticipantsPerContest !== undefined) payload.maxParticipantsPerContest = updates.limits.maxParticipantsPerContest;
    if (updates.limits.maxQuestionsPerContest !== undefined) payload.maxQuestionsPerContest = updates.limits.maxQuestionsPerContest;
    if (updates.limits.maxOrgMembers !== undefined) payload.maxOrgMembers = updates.limits.maxOrgMembers;
  }
  if (updates.features) {
    if (updates.features.proctoring !== undefined) payload.featureProctoring = updates.features.proctoring;
    if (updates.features.customCertificateBranding !== undefined) payload.featureCertBranding = updates.features.customCertificateBranding;
    if (updates.features.prioritySupport !== undefined) payload.featurePrioritySupport = updates.features.prioritySupport;
    if (updates.features.analyticsExport !== undefined) payload.featureAnalyticsExport = updates.features.analyticsExport;
    if (updates.features.customDomain !== undefined) payload.featureCustomDomain = updates.features.customDomain;
  }

  const result = await apiRequest<any>(`/api/v1/ops/plans/${planId}`, {
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
