import { z } from 'zod';
import { OpsMessageChannel, OpsMessageStatus, OpsMessageTemplate } from '@prisma/client';

/**
 * Public "compose & send" DTO — used by the manual send endpoint an admin
 * would eventually drive from the dashboard UI.
 *
 * `channel` is intentionally typed as `z.literal('EMAIL')` rather than
 * `z.nativeEnum(OpsMessageChannel)`. This is the enforcement point for
 * "don't let the user select WhatsApp yet": WHATSAPP is a real, working
 * value in the Prisma enum and the provider factory handles it correctly,
 * but it is not a value this schema will ever accept, so no request body —
 * and by extension no UI built against this endpoint — can ask for it.
 * Turning WhatsApp on for admin-composed messages later is a one-line
 * change here (swap back to the native enum); nothing else changes.
 */
export const SendMessageSchema = z.object({
  organizationId: z.string().min(1),
  template: z.nativeEnum(OpsMessageTemplate),
  recipient: z.string().min(1),
  subject: z.string().optional(),
  channel: z.literal('EMAIL').default('EMAIL'),
  params: z.record(z.string(), z.any()).optional(),
});

/** Preview DTO — same shape as the interesting half of SendMessageSchema, minus the recipient/organization (a preview never sends anything). */
export const PreviewMessageSchema = z.object({
  template: z.nativeEnum(OpsMessageTemplate),
  params: z.record(z.string(), z.any()).optional(),
});

export const PaginationQuerySchema = z.object({
  page: z.string().optional().default('1').transform((v) => parseInt(v, 10)),
  limit: z.string().optional().default('20').transform((v) => parseInt(v, 10)),
});

/**
 * Query DTO for the platform-wide message log (centralized Messaging
 * dashboard page). All filters are optional — an empty query returns every
 * message across every organization, newest first.
 */
export const MessagingListQuerySchema = z.object({
  page: z.string().optional().default('1').transform((v) => parseInt(v, 10)),
  limit: z.string().optional().default('20').transform((v) => parseInt(v, 10)),
  organizationId: z.string().optional(),
  status: z.nativeEnum(OpsMessageStatus).optional(),
  channel: z.nativeEnum(OpsMessageChannel).optional(),
  template: z.nativeEnum(OpsMessageTemplate).optional(),
  search: z.string().optional(),
});
