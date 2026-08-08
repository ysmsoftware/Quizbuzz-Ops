import { z } from 'zod';

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
});

export const removeOverrideSchema = z.object({
  reason: z.string().optional(),
});

export type AssignPlanInput = z.infer<typeof assignPlanSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type AddOverrideInput = z.infer<typeof addOverrideSchema>;
export type RemoveOverrideInput = z.infer<typeof removeOverrideSchema>;
