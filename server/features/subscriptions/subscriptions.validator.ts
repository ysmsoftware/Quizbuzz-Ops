import { z } from 'zod';
import { LIMIT_FIELDS } from './effective-limits';

// Plan feature switches the entitlements sync reads back as booleans.
const FEATURE_OVERRIDE_FIELDS = ['featureProctoring', 'featureCertBranding', 'featurePrioritySupport', 'featureAnalyticsExport', 'featureCustomDomain'];

export const assignPlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
});

export const changePlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
  reason: z.string().optional(),
});

export const addOverrideSchema = z.object({
  field: z.string().min(1, 'Limit field name is required'),
  value: z.any(),
  // ADDITIVE (default): stacks on top of the current effective limit — the
  // "existing plan + 1" behavior. ABSOLUTE: replaces it outright.
  mode: z.enum(['ADDITIVE', 'ABSOLUTE']).default('ADDITIVE'),
  reason: z.string().min(1, 'Reason is required for limit override'),
  expiresAt: z.string().optional(),
}).superRefine(({ field, value }, ctx) => {
  if ((LIMIT_FIELDS as readonly string[]).includes(field)) {
    // null = unlimited.
    if (value !== null && !Number.isInteger(value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a whole number, or null for unlimited' });
    }
  } else if (FEATURE_OVERRIDE_FIELDS.includes(field)) {
    if (typeof value !== 'boolean') ctx.addIssue({ code: 'custom', path: ['value'], message: 'Must be true or false' });
  } else {
    ctx.addIssue({ code: 'custom', path: ['field'], message: `"${field}" is not a limit that can be overridden` });
  }
});

export const removeOverrideSchema = z.object({
  reason: z.string().optional(),
});

export type AssignPlanInput = z.infer<typeof assignPlanSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type AddOverrideInput = z.infer<typeof addOverrideSchema>;
export type RemoveOverrideInput = z.infer<typeof removeOverrideSchema>;
