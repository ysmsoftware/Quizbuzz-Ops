import { z } from 'zod';

// status mirrors the main app's PaymentStatus enum (Quizbuzz-new/backend/prisma/schema.prisma).
export const paymentDetailsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z
    .enum(['all', 'CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'])
    .default('all'),
  search: z.string().trim().optional(),
  organizationId: z.string().optional(),
  // "1" → only rows whose razorpayOrderId was replaced at least once (attempts > 1).
  retriedOnly: z.enum(['0', '1']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type PaymentDetailsListQueryInput = z.infer<typeof paymentDetailsListQuerySchema>;
