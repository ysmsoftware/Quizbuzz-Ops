import crypto from 'crypto';
import { prisma } from '@/server/db/ops-prisma';
import { env } from '@/server/config/env';
import SubscriptionsService from '@/server/features/subscriptions/subscriptions.service';
import { invoicesService } from '@/server/features/invoices/invoices.service';
import { cycleTerm } from '@/lib/pricing/subscriptionPricing';
import { orgOwnerNotifier } from '@/server/notifications/org-owner-notifier';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType, BillingCycle } from '@prisma/client';
import { okResponse, errorResponse } from '@/server/http/envelope';

const subscriptionsService = new SubscriptionsService();

interface LinkAwareBody {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string } };
    payment?: { entity?: { id?: string; amount?: number } };
  };
}

const WEBHOOK_ACTOR = { id: null, email: 'razorpay', name: 'Razorpay webhook', role: 'razorpay-webhook' };

/** Razorpay can repeat an event. A failed attempt stays unprocessed, so its retry runs again. */
async function handlePaymentLinkEvent(req: Request, rawBody: string, body: LinkAwareBody) {
  const eventId = req.headers.get('x-razorpay-event-id');
  if (eventId) {
    const seen = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    if (seen?.processedAt) return okResponse(null, 'Already processed');
    if (!seen) {
      await prisma.razorpayWebhookEvent
        .create({ data: { eventId, type: body.event ?? '', payload: JSON.parse(rawBody) } })
        .catch((e: { code?: string }) => { if (e.code !== 'P2002') throw e; });
    }
  }

  const linkId = body.payload?.payment_link?.entity?.id;
  const payment = body.payload?.payment?.entity;
  if (linkId) {
    if ((body.event === 'payment_link.paid' || body.event === 'payment_link.partially_paid') && payment?.id && payment.amount) {
      await invoicesService.applyLinkPayment(linkId, { id: payment.id, amountPaise: payment.amount }, WEBHOOK_ACTOR);
      await invoicesService.setLinkStatus(linkId, body.event === 'payment_link.paid' ? 'paid' : 'partially_paid');
    } else if (body.event === 'payment_link.expired' || body.event === 'payment_link.cancelled') {
      await invoicesService.setLinkStatus(linkId, body.event.slice('payment_link.'.length));
    }
  }

  if (eventId) await prisma.razorpayWebhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } });
  return okResponse(null, 'Event processed');
}

/**
 * Razorpay-only. This is the single source of truth for whether a payment
 * actually happened — nothing the browser sends can mark an OpsPayment PAID.
 * Trust comes exclusively from a valid x-razorpay-signature HMAC over the
 * raw request body, verified with RAZORPAY_WEBHOOK_SECRET (never falls back
 * to RAZORPAY_KEY_SECRET — that's a different secret Razorpay never signs
 * webhooks with, so a fallback there would just mask an unconfigured
 * webhook, not protect one).
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET is not configured — rejecting webhook request.');
      return errorResponse('Webhook is not configured', 'GATEWAY_NOT_CONFIGURED', null, 503);
    }

    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      return errorResponse('Missing x-razorpay-signature header', 'VALIDATION_ERROR', null, 400);
    }

    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(signature);
    const isValid =
      expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!isValid) {
      console.warn('Invalid Razorpay webhook signature');
      return errorResponse('Invalid webhook signature', 'INVALID_SIGNATURE', null, 400);
    }

    interface RazorpayPaymentEntity {
      id?: string;
      order_id?: string;
      amount?: number;
      error_description?: string;
      notes?: { adminEmail?: string; adminName?: string };
    }
    let body: LinkAwareBody & { payload?: { payment?: { entity?: RazorpayPaymentEntity } } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse('Invalid JSON body', 'VALIDATION_ERROR', null, 400);
    }

    const event = body.event;

    if (event?.startsWith('payment_link.')) {
      return await handlePaymentLinkEvent(req, rawBody, body);
    }

    const paymentEntity = body.payload?.payment?.entity;

    if (!paymentEntity) {
      return okResponse(null, 'Event acknowledged');
    }

    const razorpayOrderId: string | undefined = paymentEntity.order_id;
    const razorpayPaymentId: string | undefined = paymentEntity.id;
    const notes = paymentEntity.notes || {};

    const actor = {
      id: null,
      email: notes.adminEmail || 'admin@org.com',
      name: notes.adminName || 'Org Admin',
      role: 'razorpay-webhook',
    };

    if (event === 'payment.captured') {
      if (!razorpayOrderId) {
        return errorResponse('Missing order_id in payment entity', 'VALIDATION_ERROR', null, 400);
      }

      const opsPayment = await prisma.opsPayment.findFirst({ where: { razorpayOrderId } });
      if (!opsPayment) {
        console.warn('Webhook payment.captured for unknown order:', razorpayOrderId);
        return okResponse(null, 'Event acknowledged for unknown order');
      }

      const expectedPaise = Math.round(Number(opsPayment.amount) * 100);
      if (typeof paymentEntity.amount === 'number' && paymentEntity.amount !== expectedPaise) {
        console.error('Razorpay webhook amount mismatch — refusing to mark payment PAID.', {
          opsPaymentId: opsPayment.id,
          expectedPaise,
          razorpayPaise: paymentEntity.amount,
        });
        return okResponse(null, 'Event acknowledged, amount mismatch flagged');
      }

      let updatedPayment;
      try {
        updatedPayment = await prisma.opsPayment.update({
          where: { razorpayOrderId, status: { notIn: ['PAID'] } },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            razorpayPaymentId: razorpayPaymentId || opsPayment.razorpayPaymentId,
            razorpaySignature: signature,
          },
        });
      } catch (e) {
        if ((e as { code?: string })?.code === 'P2025') {
          // Already PAID. If the plan was already assigned (subscriptionId
          // set), a concurrent delivery fully handled this — true no-op. If
          // not, a prior delivery marked PAID but failed before finishing
          // assignPlan/backfill/audit-log (e.g. a transient entitlements-
          // sync error) — fall through and finish that work instead of
          // leaving it stuck forever on every future retry.
          if (opsPayment.subscriptionId) {
            return okResponse(null, 'Already processed');
          }
          updatedPayment = opsPayment;
        } else {
          throw e;
        }
      }

      if (updatedPayment.subscriptionId) {
        return okResponse(null, 'Already processed');
      }

      if (!updatedPayment.planId) {
        console.error('OpsPayment has no planId — cannot auto-assign subscription.', updatedPayment.id);
        return okResponse(null, 'Payment marked PAID but plan could not be auto-assigned (missing planId)');
      }

      const billingCycle = (updatedPayment.billingCycle || 'MONTHLY') as BillingCycle;
      const existingSub = await prisma.organizationSubscription.findUnique({ where: { organizationId: updatedPayment.organizationId } });
      const lapsedRenewalStart =
        existingSub?.planId === updatedPayment.planId && (existingSub?.status === 'PAST_DUE' || existingSub?.status === 'RESTRICTED')
          ? existingSub.currentPeriodEnd
          : undefined;
      // linkedPaymentId makes the subscription upsert + this payment's
      // subscriptionId backfill one atomic transaction — see the comment on
      // assignPlan() for why that matters on webhook retry.
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

      // Two separate emails by design: PAYMENT_SUCCESS is a short immediate
      // confirmation, RECEIPT is the itemized record meant to be kept /
      // resent later (see the resend-receipt admin action). Both queue-only —
      // orgOwnerNotifier never sends synchronously and never throws, so a
      // notification problem here can't undo the payment processing above.
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: updatedPayment.planId },
        select: { name: true },
      });
      const planName = plan?.name || 'your plan';
      const invoiceNumber = await invoicesService.recordOrderInvoice(updatedPayment, `QuizBuzz ${planName} plan, ${cycleTerm(billingCycle)}`).catch((err) => {
        console.error(`Could not make an invoice for payment ${updatedPayment.id}:`, err);
        return null;
      });
      const { receiptNumber } = await prisma.opsPayment.findUniqueOrThrow({ where: { id: updatedPayment.id }, select: { receiptNumber: true } });
      const receiptParams = {
        invoiceNumber,
        receiptNumber,
        planName,
        billingCycle,
        baseAmount: updatedPayment.baseAmount ? Number(updatedPayment.baseAmount) : 0,
        creditApplied: updatedPayment.creditApplied ? Number(updatedPayment.creditApplied) : 0,
        gatewayFeeAmount: updatedPayment.gatewayFeeAmount ? Number(updatedPayment.gatewayFeeAmount) : 0,
        gstAmount: updatedPayment.gstAmount ? Number(updatedPayment.gstAmount) : 0,
        amount: Number(updatedPayment.amount),
        paidAt: updatedPayment.paidAt ? updatedPayment.paidAt.toISOString().slice(0, 10) : null,
        razorpayPaymentId: updatedPayment.razorpayPaymentId,
        paymentId: updatedPayment.id,
      };
      await orgOwnerNotifier.notify(updatedPayment.organizationId, 'BILLING_PAYMENT_SUCCESS', {
        planName,
        amount: Number(updatedPayment.amount),
      });
      await orgOwnerNotifier.notify(updatedPayment.organizationId, 'BILLING_RECEIPT', receiptParams);

      return okResponse(
        { paymentId: updatedPayment.id, status: 'PAID' },
        'Payment processed and subscription updated successfully'
      );
    }

    if (event === 'payment.failed') {
      if (!razorpayOrderId) {
        return errorResponse('Missing order_id in payment entity', 'VALIDATION_ERROR', null, 400);
      }

      let updatedPayment;
      try {
        updatedPayment = await prisma.opsPayment.update({
          where: { razorpayOrderId, status: { notIn: ['PAID', 'FAILED'] } },
          data: { status: 'FAILED' },
        });
      } catch (e) {
        if ((e as { code?: string })?.code === 'P2025') {
          return okResponse(null, 'Already processed');
        }
        throw e;
      }

      await writeAuditLogEntry(
        actor,
        'billing_portal.payment_failed',
        AuditTargetType.PAYMENT,
        updatedPayment.id,
        `Payment Failed - ₹${Number(updatedPayment.amount)}`,
        {
          organizationId: updatedPayment.organizationId,
          razorpayOrderId,
          amount: Number(updatedPayment.amount),
          currency: updatedPayment.currency,
          error: paymentEntity.error_description || 'Payment failed',
        }
      );

      if (updatedPayment.planId) {
        const failedPlan = await prisma.subscriptionPlan.findUnique({
          where: { id: updatedPayment.planId },
          select: { name: true },
        });
        await orgOwnerNotifier.notify(updatedPayment.organizationId, 'BILLING_PAYMENT_FAILED', {
          planName: failedPlan?.name || 'your plan',
          amount: Number(updatedPayment.amount),
          reason: paymentEntity.error_description || undefined,
        });
      }

      return okResponse(null, 'Payment marked as failed');
    }

    return okResponse(null, 'Event acknowledged');
  } catch (error) {
    console.error('Error in Razorpay webhook handler:', error);
    return errorResponse('Internal server error handling webhook', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
