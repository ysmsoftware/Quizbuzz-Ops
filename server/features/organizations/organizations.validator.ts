import { z } from 'zod';
import { paginationFields } from '../../http/query-schemas';
import { SLUG_PATTERN } from './org-slug';
import { PARTICIPANT_STATUS, PAYMENT_STATUS } from '../../../lib/constants/status';
import { INSTITUTION_FLAG_KEYS } from '../../../lib/constants/institution';

// Sortable columns -> SQL lives in the repository (whitelist; never interpolate user input).
export const ORG_SORT_FIELDS = ['createdAt', 'name', 'memberCount', 'contestCount', 'participantCount'] as const;
export type OrgSortField = (typeof ORG_SORT_FIELDS)[number];

export const orgListQuerySchema = z.object({
  // limit max is high on purpose: a few screens still resolve org names from one big page.
  ...paginationFields(10, 1000),
  search: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'suspended', 'deleted']).default('all'),
  planSlug: z.string().trim().optional(),
  // Only organizations that effectively have this institution feature ('any' = at least one of them).
  feature: z.enum([...INSTITUTION_FLAG_KEYS, 'any']).optional(),
  sort: z.enum(ORG_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const participantStatuses = Object.keys(PARTICIPANT_STATUS) as [string, ...string[]];
// 'PAID' is only an alias of SUCCESS for ops' own subscription payments; the participant list never has it.
const paymentStatuses = Object.keys(PAYMENT_STATUS).filter((k) => k !== 'PAID') as [string, ...string[]];

export const orgParticipantsQuerySchema = z.object({
  ...paginationFields(10, 100),
  search: z.string().trim().optional(),
  contestId: z.string().trim().optional(),
  status: z.enum(participantStatuses).optional(),
  // SUCCESS = paid, FREE = no payment row (free or assigned contest)
  paymentStatus: z.enum(paymentStatuses).optional(),
});
export type OrgParticipantsQueryInput = z.infer<typeof orgParticipantsQuerySchema>;

const orgName = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);

export const createOrgSchema = z.object({
  name: orgName,
  // Optional: generated from the name when omitted. Immutable afterwards (it is in public URLs).
  slug: z.string().trim().toLowerCase().max(60).regex(SLUG_PATTERN, 'Slug may contain lowercase letters, numbers and single hyphens').optional(),
  ownerName: z.string().trim().min(2, 'Owner name is required').max(100),
  ownerEmail: z.string().trim().toLowerCase().email('A valid owner email is required'),
  // Ops subscription plan id; defaults to the free "starter" plan when omitted.
  planId: z.string().trim().optional(),
});

export const updateOrgSchema = z
  .object({
    name: orgName.optional(),
    // '' or null clears the logo. The slug is deliberately not editable.
    logoUrl: z.union([z.string().trim().url().max(500), z.literal(''), z.null()]).optional(),
  })
  .refine((v) => v.name !== undefined || v.logoUrl !== undefined, { message: 'Nothing to update' });

export const deleteOrgSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required for the audit trail'),
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
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type DeleteOrgInput = z.infer<typeof deleteOrgSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type SuspendOrgInput = z.infer<typeof suspendOrgSchema>;
export type ReactivateOrgInput = z.infer<typeof reactivateOrgSchema>;
