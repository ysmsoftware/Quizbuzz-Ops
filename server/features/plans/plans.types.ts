import { BillingCycle } from '@prisma/client';

export interface SubscriptionPlanDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  billingCycle: BillingCycle;
  isActive: boolean;
  maxContestsPerCycle: number | null;
  maxParticipantsPerContest: number | null;
  maxQuestionsPerContest: number | null;
  maxOrgMembers: number | null;
  featureProctoring: boolean;
  featureCertBranding: boolean;
  featurePrioritySupport: boolean;
  featureAnalyticsExport: boolean;
  featureCustomDomain: boolean;
  createdAt: string;
  updatedAt: string;
  organizationCount: number;
}
