import { z } from 'zod';
import { LIMIT_FIELDS, PLAN_FEATURES } from './effective-limits';

// Plan feature switches the entitlements sync reads back as booleans.
const FEATURE_OVERRIDE_FIELDS: string[] = Object.values(PLAN_FEATURES);

export const assignPlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  billingCycle: z.enum(['MONTHLY', 'HALF_YEARLY', 'ANNUAL']).optional(),
});

export const changePlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  billingCycle: z.enum(['MONTHLY', 'HALF_YEARLY', 'ANNUAL']).optional(),
  reason: z.string().optional(),
  // period_end keeps the current plan until the paid time runs out, then switches.
  when: z.enum(['now', 'period_end']).default('now'),
});

export const migrateSubscribersSchema = z.object({
  toPlanId: z.string().min(1),
  when: z.enum(['now', 'renewal']),
  dryRun: z.boolean().default(true),
  reason: z.string().trim().min(1, 'Reason is required'),
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

export const updateAccessSchema = z.object({
  currentPeriodStart: z.string().datetime({ offset: true }).optional(),
  currentPeriodEnd: z.string().datetime({ offset: true }).optional(),
  graceDays: z.number().int().min(0).max(365).optional(),
  contractStart: z.string().datetime({ offset: true }).nullable().optional(),
  contractEnd: z.string().datetime({ offset: true }).nullable().optional(),
  poNumber: z.string().trim().max(100).nullable().optional(),
  contractNotes: z.string().trim().max(2000).nullable().optional(),
  reason: z.string().trim().min(1, 'Reason is required'),
}).refine((v) => Object.keys(v).some((k) => k !== 'reason' && v[k as keyof typeof v] !== undefined), {
  message: 'Change at least one thing',
});

export const removeOverrideSchema = z.object({
  reason: z.string().optional(),
});

export type AssignPlanInput = z.infer<typeof assignPlanSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type AddOverrideInput = z.infer<typeof addOverrideSchema>;
export type UpdateAccessInput = z.infer<typeof updateAccessSchema>;
export type RemoveOverrideInput = z.infer<typeof removeOverrideSchema>;
