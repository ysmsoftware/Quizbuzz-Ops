import crypto from 'crypto';
import { prisma } from '@/server/db/ops-prisma';
import { env } from '@/server/config/env';
import SubscriptionsService from '@/server/features/subscriptions/subscriptions.service';
import { invoicesService } from '@/server/features/invoices/invoices.service';
import { settleCapture } from '@/server/features/invoices/settle-capture';
import { handleSubscriptionEvent, recordChargeFailure, stopAutoDebit, type RzpSubscription } from '@/server/features/autodebit/autodebit.service';
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
    subscription?: { entity?: RzpSubscription };
  };
}

const WEBHOOK_ACTOR = { id: null, email: 'razorpay', name: 'Razorpay webhook', role: 'razorpay-webhook' };

/** Razorpay can repeat an event. A failed attempt stays unprocessed, so its retry runs again. */
async function onceOnly(req: Request, rawBody: string, type: string, work: () => Promise<void>) {
  const eventId = req.headers.get('x-razorpay-event-id');
  if (eventId) {
    const seen = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    if (seen?.processedAt) return okResponse(null, 'Already processed');
    if (!seen) {
      await prisma.razorpayWebhookEvent
        .create({ data: { eventId, type, payload: JSON.parse(rawBody) } })
        .catch((e: { code?: string }) => { if (e.code !== 'P2002') throw e; });
    }
  }
  await work();
  if (eventId) await prisma.razorpayWebhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } });
  return okResponse(null, 'Event processed');
}

async function handlePaymentLinkEvent(body: LinkAwareBody) {
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
      invoice_id?: string | null;
      error_code?: string | null;
      error_reason?: string | null;
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
      return await onceOnly(req, rawBody, event, () => handlePaymentLinkEvent(body));
    }

    const subscriptionEntity = body.payload?.subscription?.entity;
    if (event?.startsWith('subscription.') && subscriptionEntity?.id) {
      return await onceOnly(req, rawBody, event, async () => {
        await handleSubscriptionEvent(event, subscriptionEntity, body.payload?.payment?.entity);
      });
    }

    const paymentEntity = body.payload?.payment?.entity;

    if (!paymentEntity) {
      return okResponse(null, 'Event acknowledged');
    }

    // Auto-debit charges and other apps' payments on this account aren't our orders. Answering 400
    // here would make Razorpay retry, then switch the whole webhook off after a day.
    const ownOrder = paymentEntity.order_id
      ? await prisma.opsPayment.findFirst({ where: { razorpayOrderId: paymentEntity.order_id }, select: { id: true } })
      : null;
    if (!ownOrder) {
      if (event === 'payment.failed') await recordChargeFailure(paymentEntity);
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

      const done = await settleCapture({ opsPayment, razorpayOrderId, razorpayPaymentId, signature, amountPaise: paymentEntity.amount, actor });
      return okResponse(done.data, done.message);
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
