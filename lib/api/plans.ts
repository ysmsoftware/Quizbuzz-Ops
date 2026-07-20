'use client';

import { SubscriptionPlan } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

export async function getPlans(includeInactive = true): Promise<SubscriptionPlan[]> {
  const result = await apiRequest<any[]>(`/api/v1/ops/plans?includeInactive=${includeInactive}`);
  return result.map(p => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: p.price,
    currency: p.currency,
    billingCycle: p.billingCycle === 'ANNUAL' ? 'annual' : 'monthly',
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
    priceINR: p.price,
    interval: p.billingCycle === 'ANNUAL' ? 'yearly' : 'monthly',
    organizationCount: p.organizationCount || 0
  }));
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  try {
    const p = await apiRequest<any>(`/api/v1/ops/plans/${planId}`);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price,
      currency: p.currency,
      billingCycle: p.billingCycle === 'ANNUAL' ? 'annual' : 'monthly',
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
      priceINR: p.price,
      interval: p.billingCycle === 'ANNUAL' ? 'yearly' : 'monthly',
      organizationCount: p.organizationCount || 0
    };
  } catch (err) {
    return null;
  }
}

export async function createSubscriptionPlan(
  plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt' | 'priceINR' | 'interval'>
): Promise<SubscriptionPlan> {
  const result = await apiRequest<any>('/api/v1/ops/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      billingCycle: plan.billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY',
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

  return {
    ...plan,
    id: result.id,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    priceINR: result.price,
    interval: result.billingCycle === 'ANNUAL' ? 'yearly' : 'monthly',
  } as SubscriptionPlan;
}

export async function updateSubscriptionPlan(planId: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.price !== undefined) payload.price = updates.price;
  if (updates.billingCycle !== undefined) payload.billingCycle = updates.billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY';
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

  return {
    id: result.id,
    name: result.name,
    slug: result.slug,
    description: result.description,
    price: result.price,
    currency: result.currency,
    billingCycle: result.billingCycle === 'ANNUAL' ? 'annual' : 'monthly',
    isActive: result.isActive,
    limits: {
      maxContestsPerCycle: result.maxContestsPerCycle,
      maxParticipantsPerContest: result.maxParticipantsPerContest,
      maxQuestionsPerContest: result.maxQuestionsPerContest,
      maxOrgMembers: result.maxOrgMembers,
    },
    features: {
      proctoring: result.featureProctoring,
      customCertificateBranding: result.featureCertBranding,
      prioritySupport: result.featurePrioritySupport,
      analyticsExport: result.featureAnalyticsExport,
      customDomain: result.featureCustomDomain,
    },
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    priceINR: result.price,
    interval: result.billingCycle === 'ANNUAL' ? 'yearly' : 'monthly',
  };
}

export async function getPlanImpact(planId: string): Promise<{ organizationCount: number; organizations: Array<{ id: string; name?: string }> }> {
  return apiRequest(`/api/v1/ops/plans/${planId}/impact`);
}

export async function deactivateSubscriptionPlan(planId: string): Promise<void> {
  await apiRequest(`/api/v1/ops/plans/${planId}/deactivate`, {
    method: 'POST',
  });
}
