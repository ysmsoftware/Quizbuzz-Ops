import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/server/db/ops-prisma';
import { env } from '@/server/config/env';
import SubscriptionsService from '@/server/features/subscriptions/subscriptions.service';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType, BillingCycle } from '@prisma/client';

const subscriptionsService = new SubscriptionsService();

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
      return NextResponse.json(
        { success: false, error: 'Webhook is not configured' },
        { status: 503 }
      );
    }

    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      return NextResponse.json(
        { success: false, error: 'Missing x-razorpay-signature header' },
        { status: 400 }
      );
    }

    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(signature);
    const isValid =
      expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!isValid) {
      console.warn('Invalid Razorpay webhook signature');
      return NextResponse.json({ success: false, error: 'Invalid webhook signature' }, { status: 400 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const event = body.event;
    const paymentEntity = body.payload?.payment?.entity;

    if (!paymentEntity) {
      return NextResponse.json({ success: true, message: 'Event acknowledged' });
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
        return NextResponse.json({ success: false, error: 'Missing order_id in payment entity' }, { status: 400 });
      }

      const opsPayment = await prisma.opsPayment.findFirst({ where: { razorpayOrderId } });
      if (!opsPayment) {
        console.warn('Webhook payment.captured for unknown order:', razorpayOrderId);
        return NextResponse.json({ success: true, message: 'Event acknowledged for unknown order' });
      }

      const expectedPaise = Math.round(Number(opsPayment.amount) * 100);
      if (typeof paymentEntity.amount === 'number' && paymentEntity.amount !== expectedPaise) {
        console.error('Razorpay webhook amount mismatch — refusing to mark payment PAID.', {
          opsPaymentId: opsPayment.id,
          expectedPaise,
          razorpayPaise: paymentEntity.amount,
        });
        return NextResponse.json({ success: true, message: 'Event acknowledged, amount mismatch flagged' });
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
      } catch (e: any) {
        if (e?.code === 'P2025') {
          // Already PAID. If the plan was already assigned (subscriptionId
          // set), a concurrent delivery fully handled this — true no-op. If
          // not, a prior delivery marked PAID but failed before finishing
          // assignPlan/backfill/audit-log (e.g. a transient entitlements-
          // sync error) — fall through and finish that work instead of
          // leaving it stuck forever on every future retry.
          if (opsPayment.subscriptionId) {
            return NextResponse.json({ success: true, message: 'Already processed' });
          }
          updatedPayment = opsPayment;
        } else {
          throw e;
        }
      }

      if (updatedPayment.subscriptionId) {
        return NextResponse.json({ success: true, message: 'Already processed' });
      }

      if (!updatedPayment.planId) {
        console.error('OpsPayment has no planId — cannot auto-assign subscription.', updatedPayment.id);
        return NextResponse.json({
          success: true,
          message: 'Payment marked PAID but plan could not be auto-assigned (missing planId)',
        });
      }

      const billingCycle = (updatedPayment.billingCycle || 'MONTHLY') as BillingCycle;
      const sub = await subscriptionsService.assignPlan(
        updatedPayment.organizationId,
        updatedPayment.planId,
        actor,
        billingCycle
      );

      await prisma.opsPayment.update({
        where: { id: updatedPayment.id },
        data: { subscriptionId: sub.id },
      });

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

      return NextResponse.json({
        success: true,
        message: 'Payment processed and subscription updated successfully',
        data: { paymentId: updatedPayment.id, status: 'PAID' },
      });
    }

    if (event === 'payment.failed') {
      if (!razorpayOrderId) {
        return NextResponse.json({ success: false, error: 'Missing order_id in payment entity' }, { status: 400 });
      }

      let updatedPayment;
      try {
        updatedPayment = await prisma.opsPayment.update({
          where: { razorpayOrderId, status: { notIn: ['PAID', 'FAILED'] } },
          data: { status: 'FAILED' },
        });
      } catch (e: any) {
        if (e?.code === 'P2025') {
          return NextResponse.json({ success: true, message: 'Already processed' });
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

      return NextResponse.json({ success: true, message: 'Payment marked as failed' });
    }

    return NextResponse.json({ success: true, message: 'Event acknowledged' });
  } catch (error: any) {
    console.error('Error in Razorpay webhook handler:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error handling webhook' },
      { status: 500 }
    );
  }
}
