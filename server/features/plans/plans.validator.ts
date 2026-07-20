import { z } from 'zod';
import { BillingCycle } from '@prisma/client';

export const planCreateSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  slug: z.string().min(1, 'Plan slug is required'),
  description: z.string().default(''),
  price: z.coerce.number().min(0, 'Price must be non-negative'),
  currency: z.string().default('INR'),
  billingCycle: z.nativeEnum(BillingCycle).default(BillingCycle.MONTHLY),
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
