import { z } from 'zod';

export const planCreateSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  slug: z.string().min(1, 'Plan slug is required'),
  description: z.string().default(''),
  currency: z.string().default('INR'),
  allowsMonthly: z.boolean().default(true),
  allowsAnnual: z.boolean().default(false),
  monthlyPrice: z.coerce.number().min(0, 'monthlyPrice must be non-negative').nullable().optional(),
  annualPrice: z.coerce.number().min(0, 'annualPrice must be non-negative').nullable().optional(),
  maxContestsPerCycle: z.coerce.number().nullable().optional(),
  maxParticipantsPerContest: z.coerce.number().nullable().optional(),
  maxQuestionsPerContest: z.coerce.number().nullable().optional(),
  maxOrgMembers: z.coerce.number().nullable().optional(),
  featureProctoring: z.boolean().default(false),
  featureCertBranding: z.boolean().default(false),
  featurePrioritySupport: z.boolean().default(false),
  featureAnalyticsExport: z.boolean().default(false),
  featureCustomDomain: z.boolean().default(false),
});

export const planUpdateSchema = planCreateSchema.partial();

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
