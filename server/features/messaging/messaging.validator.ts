import { z } from 'zod';
import { OpsMessageTemplate } from '@prisma/client';

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

export const PaginationQuerySchema = z.object({
  page: z.string().optional().default('1').transform((v) => parseInt(v, 10)),
  limit: z.string().optional().default('20').transform((v) => parseInt(v, 10)),
});
