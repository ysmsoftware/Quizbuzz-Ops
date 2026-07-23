import { z } from 'zod';

export const payoutAccountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['all', 'PENDING', 'ACTIVE', 'VERIFICATION_FAILED', 'DISABLED'])
    .default('all'),
  search: z.string().optional(),
});

export const routeTransfersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['all', 'PENDING', 'PROCESSED', 'FAILED', 'REVERSED'])
    .default('all'),
  reason: z.string().optional(),
});

export const attachLinkedAccountSchema = z.object({
  razorpayLinkedAccountId: z
    .string()
    .trim()
    .regex(/^acc_[a-zA-Z0-9]+$/, {
      message: 'Must be a valid Razorpay linked account ID starting with acc_',
    }),
});

export const updatePayoutStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'VERIFICATION_FAILED', 'DISABLED']),
  reason: z.string().trim().min(3, {
    message: 'Reason must be at least 3 characters long',
  }),
});
