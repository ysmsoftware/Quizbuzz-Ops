import type { BillingCycle, OpsPayment } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { cycleTerm } from '@/lib/pricing/subscriptionPricing';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';
import { invoicesService } from './invoices.service';

/** After a plan payment is PAID and the plan assigned: the tax invoice, its receipt, and the two owner emails. Shared by one-time orders and auto-debit charges. */
export async function finishSubscriptionPayment(payment: OpsPayment, billingCycle: BillingCycle): Promise<void> {
  const plan = payment.planId ? await prisma.subscriptionPlan.findUnique({ where: { id: payment.planId }, select: { name: true } }) : null;
  const planName = plan?.name || 'your plan';
  const invoiceNumber = await invoicesService.recordOrderInvoice(payment, `QuizBuzz ${planName} plan, ${cycleTerm(billingCycle)}`).catch((err) => {
    console.error(`Could not make an invoice for payment ${payment.id}:`, err);
    return null;
  });
  const { receiptNumber } = await prisma.opsPayment.findUniqueOrThrow({ where: { id: payment.id }, select: { receiptNumber: true } });

  // Queue-only: the notifier never throws, so an email problem can't undo the payment.
  await orgOwnerNotifier.notify(payment.organizationId, 'BILLING_PAYMENT_SUCCESS', { planName, amount: Number(payment.amount) });
  await orgOwnerNotifier.notify(payment.organizationId, 'BILLING_RECEIPT', {
    invoiceNumber,
    receiptNumber,
    planName,
    billingCycle,
    baseAmount: payment.baseAmount ? Number(payment.baseAmount) : 0,
    creditApplied: payment.creditApplied ? Number(payment.creditApplied) : 0,
    gatewayFeeAmount: payment.gatewayFeeAmount ? Number(payment.gatewayFeeAmount) : 0,
    gstAmount: payment.gstAmount ? Number(payment.gstAmount) : 0,
    amount: Number(payment.amount),
    paidAt: payment.paidAt ? payment.paidAt.toISOString().slice(0, 10) : null,
    razorpayPaymentId: payment.razorpayPaymentId,
    paymentId: payment.id,
  });
}
