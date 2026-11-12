import { z } from 'zod';

export const planCreateSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  slug: z.string().min(1, 'Plan slug is required'),
  description: z.string().default(''),
  currency: z.string().default('INR'),
  allowsMonthly: z.boolean().default(true),
  allowsAnnual: z.boolean().default(false),
  allowsHalfYearly: z.boolean().default(false),
  halfYearlyPrice: z.coerce.number().min(0, 'halfYearlyPrice must be non-negative').nullable().optional(),
  // Plans made in ops are private until someone puts them on sale.
  isSellable: z.boolean().default(false),
  kind: z.enum(['FREE', 'STANDARD', 'CUSTOM']).default('STANDARD'),
  audience: z.enum(['ORGANIZER', 'EDUCATION', 'BUSINESS']).nullable().optional(),
  organizationId: z.string().min(1).nullable().optional(),
  monthlyPrice: z.coerce.number().min(0, 'monthlyPrice must be non-negative').nullable().optional(),
  annualPrice: z.coerce.number().min(0, 'annualPrice must be non-negative').nullable().optional(),
  maxContestsPerCycle: z.coerce.number().int().min(0).nullable().optional(),
  maxParticipantsPerContest: z.coerce.number().int().min(0).nullable().optional(),
  maxQuestionsPerContest: z.coerce.number().int().min(0).nullable().optional(),
  maxOrgMembers: z.coerce.number().int().min(0).nullable().optional(),
  maxLearners: z.coerce.number().int().min(0).nullable().optional(),
  maxCandidatesPerMonth: z.coerce.number().int().min(0).nullable().optional(),
  aiCreditsPerMonth: z.coerce.number().int().min(0).nullable().optional(),
  commissionPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  featureProctoring: z.boolean().default(false),
  featureCertBranding: z.boolean().default(false),
  featurePrioritySupport: z.boolean().default(false),
  featureAnalyticsExport: z.boolean().default(false),
  featureCustomDomain: z.boolean().default(false),
  featureLearnerGroups: z.boolean().default(false),
  featureGradebook: z.boolean().default(false),
  featureAmbassadorCampaigns: z.boolean().default(false),
  featureManualEmails: z.boolean().default(false),
});

// .partial() alone keeps the defaults, so a PATCH that left a field out would reset it.
export const planUpdateSchema = z.object(
  Object.fromEntries(
    Object.entries(planCreateSchema.shape).map(([key, field]) => [
      key,
      (field instanceof z.ZodDefault ? field.removeDefault() : field).optional(),
    ]),
  ),
) as unknown as z.ZodType<Partial<z.infer<typeof planCreateSchema>>>;

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
