import { z } from 'zod';

export const orgListQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'suspended', 'deleted']).default('all'),
  planSlug: z.string().optional(),
  sort: z.string().optional(),
});

export const createNoteSchema = z.object({
  body: z.string().min(1, 'Note body cannot be empty'),
  tags: z.array(z.string()).default([]),
});

export const suspendOrgSchema = z.object({
  reason: z.string().min(3, 'Suspension reason is required'),
});

export const reactivateOrgSchema = z.object({
  reason: z.string().optional(),
});

export type OrgListQueryInput = z.infer<typeof orgListQuerySchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type SuspendOrgInput = z.infer<typeof suspendOrgSchema>;
export type ReactivateOrgInput = z.infer<typeof reactivateOrgSchema>;
