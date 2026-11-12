import { z } from 'zod';

export const billingSettingsSchema = z.object({
  legalName: z.string().trim().min(1, 'Legal name is required'),
  // YSM Info Solution is GST-registered, so every invoice charges GST and must show this number.
  gstin: z.string().trim().regex(/^[0-9A-Z]{15}$/, 'GSTIN must be 15 letters and digits'),
  sacCode: z.string().trim().max(10).nullable().optional(),
  address: z.string().trim().min(1, 'Address is required'),
  state: z.string().trim().min(1, 'State is required'),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  bankName: z.string().trim().nullable().optional(),
  accountName: z.string().trim().nullable().optional(),
  accountNumber: z.string().trim().nullable().optional(),
  ifsc: z.string().trim().nullable().optional(),
  upiId: z.string().trim().nullable().optional(),
  invoicePrefix: z.string().trim().min(1).max(4).regex(/^[A-Z0-9-]+$/, 'Capital letters, digits and hyphens only'),
  receiptPrefix: z.string().trim().min(1).max(4).regex(/^[A-Z0-9-]+$/, 'Capital letters, digits and hyphens only'),
  creditNotePrefix: z.string().trim().min(1).max(4).regex(/^[A-Z0-9-]+$/, 'Capital letters, digits and hyphens only').default('CN'),
});

export const issueInvoiceSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(500),
  collectionMethod: z.enum(['PAY_ONLINE', 'OFFLINE', 'COMPLIMENTARY']),
  // Ex-GST.
  amount: z.number().min(0),
  gstRate: z.number().min(0).max(100).default(18),
  dueInDays: z.number().int().min(0).max(365),
  accessMode: z.enum(['ACCESS_NOW', 'ON_PAYMENT']),
  // Leave out for an instalment or an extra charge on the current plan.
  planId: z.string().min(1).optional(),
  billingCycle: z.enum(['MONTHLY', 'HALF_YEARLY', 'ANNUAL', 'CUSTOM']).optional(),
  periodEnd: z.string().datetime({ offset: true }).optional(),
}).superRefine((v, ctx) => {
  if (v.collectionMethod === 'COMPLIMENTARY') {
    if (v.amount !== 0) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'A complimentary plan has no charge' });
    if (!v.planId) ctx.addIssue({ code: 'custom', path: ['planId'], message: 'Choose the plan to grant' });
    if (!v.periodEnd) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'A complimentary plan needs an end date' });
  } else if (v.amount <= 0) {
    ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter the amount to charge' });
  }
  if (v.planId && !v.billingCycle) ctx.addIssue({ code: 'custom', path: ['billingCycle'], message: 'Choose the billing cycle' });
  if (v.planId && v.billingCycle === 'CUSTOM' && !v.periodEnd) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'A contract needs an end date' });
});

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export const recordPaymentSchema = z.object({
  amount: z.number().min(0),
  tdsAmount: z.number().min(0).default(0),
  receivedAt: z.string().datetime({ offset: true }).refine((v) => new Date(v).getTime() <= Date.now() + 864e5, 'The received date can\'t be in the future'),
  source: z.enum(['BANK_TRANSFER', 'CHEQUE', 'UPI_DIRECT', 'OTHER']),
  reference: z.string().trim().min(1, 'Enter the UTR, cheque number or other reference').max(100),
  notes: z.string().trim().max(1000).optional(),
  proof: z.object({
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
    base64: z.string().max(Math.ceil((MAX_PROOF_BYTES * 4) / 3) + 4, 'The proof file must be under 5 MB'),
  }).optional(),
}).refine((v) => v.amount + v.tdsAmount > 0, { message: 'Enter the amount received' });

export const invoiceActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('void'), reason: z.string().trim().min(1, 'Reason is required') }),
  z.object({ action: z.literal('write_off'), reason: z.string().trim().min(1, 'Reason is required') }),
  z.object({ action: z.literal('extend_due'), reason: z.string().trim().min(1, 'Reason is required'), dueAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal('create_link') }),
  z.object({ action: z.literal('resend') }),
]);

export const voidPaymentSchema = z.object({ reason: z.string().trim().min(1, 'Reason is required') });

export const listInvoicesSchema = z.object({
  organizationId: z.string().optional(),
  status: z.enum(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'WRITTEN_OFF']).optional(),
  overdue: z.preprocess((v) => v === 'true', z.boolean()).default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;

export const creditNoteSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().trim().min(3, 'Give a reason').max(500),
  refundMethod: z.enum(['RAZORPAY', 'BANK_TRANSFER', 'NONE']),
  paymentId: z.string().optional(),
  refundReference: z.string().trim().max(100).optional(),
  endAccess: z.boolean().default(false),
});
