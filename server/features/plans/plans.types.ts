export interface SubscriptionPlanDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  currency: string;
  allowsMonthly: boolean;
  allowsAnnual: boolean;
  monthlyPrice: number | null;
  annualPrice: number | null;
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
