import { prisma } from '@/server/db/ops-prisma';
import SubscriptionsService from '@/server/features/subscriptions/subscriptions.service';
import { finishSubscriptionPayment } from '@/server/features/invoices/subscription-paid';
import { stopAutoDebit } from '@/server/features/autodebit/autodebit.service';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType, BillingCycle, type OpsPayment } from '@prisma/client';
import type { AuditActor } from '@/server/audit/audit-writer';

const subscriptionsService = new SubscriptionsService();

/**
 * Settles one captured Razorpay payment for a one-time order: marks it PAID and gives the plan.
 * Shared by the webhook and the status check that asks Razorpay directly, so both do exactly the same
 * and a repeat (webhook after a status check, or the reverse) changes nothing.
 */
export async function settleCapture(input: {
  opsPayment: OpsPayment;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  /** The checkout signature, only when the webhook or verify call carried one. */
  signature?: string | null;
  /** Razorpay's amount for the captured payment, in paise. */
  amountPaise?: number;
  actor: AuditActor;
}): Promise<{ data: unknown; message: string }> {
  const { opsPayment, razorpayOrderId, razorpayPaymentId, signature, amountPaise, actor } = input;

  const expectedPaise = Math.round(Number(opsPayment.amount) * 100);
  if (typeof amountPaise === 'number' && amountPaise !== expectedPaise) {
    console.error('Razorpay amount mismatch — refusing to mark payment PAID.', { opsPaymentId: opsPayment.id, expectedPaise, razorpayPaise: amountPaise });
    return { data: null, message: 'Event acknowledged, amount mismatch flagged' };
  }

  let updatedPayment;
  try {
    updatedPayment = await prisma.opsPayment.update({
      where: { razorpayOrderId, status: { notIn: ['PAID'] } },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        razorpayPaymentId: razorpayPaymentId || opsPayment.razorpayPaymentId,
        ...(signature ? { razorpaySignature: signature } : {}),
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') {
      // Already PAID. If the plan was already assigned, a concurrent run fully handled this. If not, an
      // earlier run marked PAID but failed before finishing (e.g. a transient sync error): finish it now.
      if (opsPayment.subscriptionId) return { data: null, message: 'Already processed' };
      updatedPayment = opsPayment;
    } else {
      throw e;
    }
  }

  if (updatedPayment.subscriptionId) return { data: null, message: 'Already processed' };

  if (!updatedPayment.planId) {
    console.error('OpsPayment has no planId — cannot auto-assign subscription.', updatedPayment.id);
    return { data: null, message: 'Payment marked PAID but plan could not be auto-assigned (missing planId)' };
  }

  const billingCycle = (updatedPayment.billingCycle || 'MONTHLY') as BillingCycle;
  const existingSub = await prisma.organizationSubscription.findUnique({ where: { organizationId: updatedPayment.organizationId } });
  const lapsedRenewalStart =
    existingSub?.planId === updatedPayment.planId && (existingSub?.status === 'PAST_DUE' || existingSub?.status === 'RESTRICTED')
      ? existingSub.currentPeriodEnd
      : undefined;

  // linkedPaymentId makes the subscription upsert + this payment's subscriptionId backfill one atomic
  // transaction, so a retry can't leave it half done.
  await subscriptionsService.assignPlan(
    updatedPayment.organizationId,
    updatedPayment.planId,
    actor,
    billingCycle,
    // Renewing the same plan during grace continues from the old end date, so paying late buys no free days.
    lapsedRenewalStart,
    updatedPayment.id
  );

  await writeAuditLogEntry(
    actor,
    'billing_portal.payment_succeeded',
    AuditTargetType.PAYMENT,
    updatedPayment.id,
    `Payment Succeeded - ₹${Number(updatedPayment.amount)}`,
    {
      organizationId: updatedPayment.organizationId,
      razorpayOrderId,
      razorpayPaymentId: updatedPayment.razorpayPaymentId,
      planId: updatedPayment.planId,
      billingCycle,
      periodMonths: updatedPayment.periodMonths,
      baseAmount: updatedPayment.baseAmount ? Number(updatedPayment.baseAmount) : null,
      gatewayFeeAmount: updatedPayment.gatewayFeeAmount ? Number(updatedPayment.gatewayFeeAmount) : null,
      gstAmount: updatedPayment.gstAmount ? Number(updatedPayment.gstAmount) : null,
      amount: Number(updatedPayment.amount),
      currency: updatedPayment.currency,
    }
  );

  // Paying once replaces auto-debit: otherwise a failing mandate could still charge for the same
  // period, or an old plan's mandate could charge after an upgrade. The owner can turn it on again.
  await stopAutoDebit(updatedPayment.organizationId, actor, `Paid once with payment ${updatedPayment.id}`);
  await finishSubscriptionPayment(updatedPayment, billingCycle);

  return { data: { paymentId: updatedPayment.id, status: 'PAID' }, message: 'Payment processed and subscription updated successfully' };
}
