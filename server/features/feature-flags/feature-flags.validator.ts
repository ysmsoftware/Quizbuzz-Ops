import { z } from 'zod';

export const flagUpdateSchema = z.object({ isEnabled: z.boolean() });

export const orgOverrideSetSchema = z.object({
  isEnabled: z.boolean(),
  reason: z.string().min(1, 'reason is required'),
  expiresAt: z.string().datetime().optional(),
});

export const orgOverrideRemoveSchema = z.object({ reason: z.string().optional() });

export type FlagUpdateInput = z.infer<typeof flagUpdateSchema>;
export type OrgOverrideSetInput = z.infer<typeof orgOverrideSetSchema>;
export type OrgOverrideRemoveInput = z.infer<typeof orgOverrideRemoveSchema>;
