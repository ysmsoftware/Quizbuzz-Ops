import { AuditTargetType, PlatformAdminRole, type Invoice } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { razorpayAuth, razorpayCall } from '../../lib/razorpay';
import { generateUlid } from '../../utils/ulid';
import { writeAuditLogEntry, type AuditActor } from '../../audit/audit-writer';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../http/errors';
import { refreshSubscriptionStatus } from '../subscriptions/access-input';
import { syncOrgPlanLimitsCache } from '../subscriptions/subscriptions.service';
import SubscriptionsService from '../subscriptions/subscriptions.service';
import { stopAutoDebit } from '../autodebit/autodebit.service';
import { creditNoteDocument } from './billing-documents';
import { nextDocumentNumber } from './invoices.service';
import { round2, splitCredit } from './invoice-math';

/**
 * A credit note offsets an invoice; the invoice itself never changes. With a refund it says how the
 * money went back (Razorpay, or a bank transfer ops made); without one it only lowers what's owed,
 * which is how an unpaid tax invoice gets cancelled.
 */

export type RefundMethod = 'RAZORPAY' | 'BANK_TRANSFER' | 'NONE';

export interface CreditNoteInput {
  amount: number;
  reason: string;
  refundMethod: RefundMethod;
  paymentId?: string;
  refundReference?: string;
  endAccess: boolean;
}

export async function issueCreditNote(invoiceId: string, input: CreditNoteInput, actor: AuditActor) {
  if (actor.role !== PlatformAdminRole.SUPER_ADMIN) throw new ForbiddenError('Only a super admin can refund or issue a credit note.');
  const settings = await prisma.billingSettings.findUnique({ where: { id: 'billing_default' } });
  if (!settings) throw new ConflictError('Fill in Billing Settings first.');
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true, creditNotes: true } });
  if (!inv) throw new NotFoundError('Invoice not found');
  if (inv.status === 'VOID' || inv.status === 'WRITTEN_OFF') throw new ConflictError(`This invoice is ${inv.status.toLowerCase().replace('_', ' ')}.`);

  const amount = round2(input.amount);
  const creditable = round2(Number(inv.total) - Number(inv.creditedAmount));
  if (amount <= 0) throw new ValidationError(null, 'Enter an amount above zero.');
  if (amount > creditable) throw new ValidationError(null, `At most ₹${creditable.toFixed(2)} can still be credited on this invoice.`);

  // A refund returns money that came in on one payment, and never more than that payment.
  const payment = input.refundMethod === 'NONE' ? null : inv.payments.find((p) => p.id === input.paymentId && p.status !== 'FAILED' && !p.voidedAt);
  if (input.refundMethod !== 'NONE') {
    if (!payment) throw new ValidationError(null, 'Pick the payment to refund.');
    const refunded = round2(inv.creditNotes.filter((c) => c.paymentId === payment.id).reduce((sum, c) => sum + Number(c.total), 0));
    if (amount > round2(Number(payment.amount) - refunded)) throw new ValidationError(null, `At most ₹${round2(Number(payment.amount) - refunded).toFixed(2)} of that payment can still be refunded.`);
    if (input.refundMethod === 'RAZORPAY' && !payment.razorpayPaymentId) throw new ValidationError(null, 'That payment didn’t come through Razorpay. Refund it by bank transfer.');
    if (input.refundMethod === 'BANK_TRANSFER' && !input.refundReference?.trim()) throw new ValidationError(null, 'Enter the UTR or reference of the transfer you made.');
  }

  // Razorpay first: if it refuses, nothing is written.
  let razorpayRefundId: string | null = null;
  if (input.refundMethod === 'RAZORPAY' && payment?.razorpayPaymentId) {
    if (razorpayAuth()) {
      const refund = await razorpayCall<{ id: string }>(`payments/${payment.razorpayPaymentId}/refund`, 'POST', {
        amount: Math.round(amount * 100),
        notes: { invoiceNumber: inv.invoiceNumber, reason: input.reason.slice(0, 250) },
      });
      razorpayRefundId = refund.id;
    } else if (process.env.NODE_ENV === 'production') {
      throw new ConflictError('Razorpay isn’t configured, so it can’t refund. Refund by bank transfer instead.');
    } else {
      razorpayRefundId = `rfnd_test_${generateUlid()}`;
    }
  }

  const split = splitCredit(inv, amount);
  const creditedAmount = round2(Number(inv.creditedAmount) + amount);
  const covered = round2(Number(inv.amountPaid) + Number(inv.tdsAmount));
  const owed = round2(Number(inv.total) - creditedAmount);
  // Unpaid and now fully credited: closed. Paid invoices stay paid; the credit note sits beside them.
  const status = inv.status === 'PAID' ? 'PAID' : covered >= owed ? (covered > 0 ? 'PAID' : 'VOID') : inv.status;

  const note = await prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, settings.creditNotePrefix, new Date());
    const created = await tx.creditNote.create({
      data: {
        id: generateUlid(), number, invoiceId: inv.id, organizationId: inv.organizationId, paymentId: payment?.id ?? null,
        ...split, reason: input.reason, refundMethod: input.refundMethod, refundReference: input.refundReference?.trim() || null,
        razorpayRefundId, endedAccess: input.endAccess, createdById: actor.id,
      },
    });
    await tx.invoice.update({
      where: { id: inv.id },
      data: { creditedAmount, status, ...(status === 'VOID' ? { closedReason: `Cancelled by credit note ${number}` } : {}) },
    });
    if (payment) {
      const refundedTotal = round2(inv.creditNotes.filter((c) => c.paymentId === payment.id).reduce((s, c) => s + Number(c.total), 0) + amount);
      await tx.opsPayment.update({
        where: { id: payment.id },
        data: { refundedAt: new Date(), refundReason: input.reason, refundedById: actor.id, ...(refundedTotal >= Number(payment.amount) ? { status: 'REFUNDED' } : {}) },
      });
    }
    return created;
  });

  if (inv.razorpayLinkId && inv.razorpayLinkStatus === 'created' && status === 'VOID') {
    const { cancelPaymentLink } = await import('./razorpay-links');
    await cancelPaymentLink(inv.razorpayLinkId).catch((err) => console.error('[credit-notes] Could not cancel the link:', err));
  }

  if (input.endAccess) {
    await stopAutoDebit(inv.organizationId, actor, `Credit note ${note.number}: access ended`);
    const free = await prisma.subscriptionPlan.findUnique({ where: { slug: 'free' } });
    if (free) await new SubscriptionsService().changePlan(inv.organizationId, free.id, actor, undefined, `Credit note ${note.number}: access ended`);
  } else {
    await refreshSubscriptionStatus(inv.organizationId);
    await syncOrgPlanLimitsCache(inv.organizationId).catch((err) => console.error('[credit-notes] cache sync:', err));
  }

  await creditNoteDocument(note).catch((err) => console.error('[credit-notes] Could not save the PDF yet:', err));
  await writeAuditLogEntry(actor, 'invoice.credit_note_issued', AuditTargetType.INVOICE, inv.id, inv.invoiceNumber, {
    organizationId: inv.organizationId, creditNoteNumber: note.number, amount, reason: input.reason, refundMethod: input.refundMethod,
    paymentId: payment?.id ?? null, razorpayRefundId, refundReference: note.refundReference, endedAccess: input.endAccess,
  });
  await orgOwnerNotifier.notify(inv.organizationId, 'CREDIT_NOTE_ISSUED', {
    creditNoteId: note.id,
    creditNoteNumber: note.number,
    invoiceNumber: inv.invoiceNumber,
    amount,
    reason: input.reason,
    refundLine:
      input.refundMethod === 'RAZORPAY' ? `₹${amount.toFixed(2)} is being refunded to how you paid. Banks usually show it within 5 to 7 working days.`
      : input.refundMethod === 'BANK_TRANSFER' ? `₹${amount.toFixed(2)} was refunded to your bank account (reference ${note.refundReference}).`
      : null,
  });
  return note;
}
