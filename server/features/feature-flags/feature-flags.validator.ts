import { z } from 'zod';

export const flagUpdateSchema = z.object({ isEnabled: z.boolean() });

export const orgOverrideSetSchema = z.object({
  isEnabled: z.boolean(),
  reason: z.string().min(1, 'reason is required'),
  // Optional end date; after it the main app ignores the override. Must be in the future.
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

// What to do with grants that exist only in the main app (e.g. written by the demo seed or by hand):
// keep them untouched (default — never delete something we don't own), adopt them into Ops, or remove them.
export const syncRepairSchema = z.object({ extras: z.enum(['keep', 'adopt', 'remove']).default('keep') });

export const orgOverrideRemoveSchema = z.object({ reason: z.string().optional() });

export type FlagUpdateInput = z.infer<typeof flagUpdateSchema>;
export type OrgOverrideSetInput = z.infer<typeof orgOverrideSetSchema>;
export type SyncRepairInput = z.infer<typeof syncRepairSchema>;
export type OrgOverrideRemoveInput = z.infer<typeof orgOverrideRemoveSchema>;
