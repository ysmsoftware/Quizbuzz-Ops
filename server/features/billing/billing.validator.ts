import { z } from 'zod';

export const billingPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['all', 'SUCCESS', 'FAILED', 'PENDING', 'REFUNDED'])
    .default('all'),
  search: z.string().optional(),
  orgId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
