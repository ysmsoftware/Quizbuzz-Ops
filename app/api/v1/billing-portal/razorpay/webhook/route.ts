import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/server/db/ops-prisma';
import SubscriptionsService from '@/server/features/subscriptions/subscriptions.service';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

const subscriptionsService = new SubscriptionsService();

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '';
    const signature = req.headers.get('x-razorpay-signature');

    // Verify webhook signature if secret and signature are present
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.warn('Invalid Razorpay webhook signature');
        return NextResponse.json({ success: false, error: 'Invalid webhook signature' }, { status: 400 });
      }
    }

    const event = body.event;
    const payload = body.payload || {};

    // Support both Razorpay Webhook payloads and direct payment completion payloads
    const paymentEntity = payload.payment?.entity || body.payment || {};
    const razorpayOrderId = paymentEntity.order_id || body.razorpayOrderId || body.orderId;
    const razorpayPaymentId = paymentEntity.id || body.razorpayPaymentId || body.paymentId;
    const planSlug = body.planSlug || paymentEntity.notes?.planSlug;
    const adminEmail = body.adminEmail || paymentEntity.notes?.adminEmail;
    const adminName = body.adminName || paymentEntity.notes?.adminName;

    const actor = {
      id: null,
      email: adminEmail || 'admin@org.com',
      name: adminName || 'Org Admin',
      role: 'ORG_ADMIN via billing-portal',
    };

    if (event === 'payment.captured' || body.status === 'PAID' || body.action === 'capture') {
      if (!razorpayOrderId) {
        return NextResponse.json({ success: false, error: 'Missing razorpayOrderId' }, { status: 400 });
      }

      // 1. Find the OpsPayment record
      const opsPayment = await prisma.opsPayment.findFirst({
        where: { razorpayOrderId },
      });

      if (!opsPayment) {
        return NextResponse.json({ success: false, error: 'OpsPayment record not found' }, { status: 404 });
      }

      // 2. Mark OpsPayment as PAID
      const updatedPayment = await prisma.opsPayment.update({
        where: { id: opsPayment.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          razorpayPaymentId: razorpayPaymentId || `pay_stub_${Date.now()}`,
          razorpaySignature: signature || body.razorpaySignature || null,
        },
      });

      // 3. Resolve Target Plan to Assign
      let planToAssign = null;
      if (planSlug) {
        planToAssign = await prisma.subscriptionPlan.findUnique({ where: { slug: planSlug } });
      }
      if (!planToAssign) {
        // Fallback to starter-test or first active plan
        planToAssign = await prisma.subscriptionPlan.findFirst({
          where: { slug: 'starter-test', isActive: true },
        });
      }

      if (planToAssign) {
        // Assign plan (which syncs main DB plan limits cache automatically)
        await subscriptionsService.assignPlan(
          opsPayment.organizationId,
          planToAssign.id,
          actor
        );
      }

      // 4. Log Audit Entry for Payment Succeeded
      await writeAuditLogEntry(
        actor,
        'billing_portal.payment_succeeded',
        AuditTargetType.PAYMENT,
        opsPayment.id,
        `Payment Succeeded - ₹${Number(opsPayment.amount)}`,
        {
          organizationId: opsPayment.organizationId,
          razorpayOrderId,
          razorpayPaymentId: updatedPayment.razorpayPaymentId,
          amount: Number(opsPayment.amount),
          currency: opsPayment.currency,
          planSlug: planToAssign?.slug || null,
          planName: planToAssign?.name || null,
        }
      );

      return NextResponse.json({
        success: true,
        message: 'Payment processed and subscription updated successfully',
        data: { paymentId: opsPayment.id, status: 'PAID' },
      });
    }

    if (event === 'payment.failed' || body.status === 'FAILED' || body.action === 'fail') {
      if (!razorpayOrderId) {
        return NextResponse.json({ success: false, error: 'Missing razorpayOrderId' }, { status: 400 });
      }

      const opsPayment = await prisma.opsPayment.findFirst({
        where: { razorpayOrderId },
      });

      if (opsPayment) {
        await prisma.opsPayment.update({
          where: { id: opsPayment.id },
          data: { status: 'FAILED' },
        });

        await writeAuditLogEntry(
          actor,
          'billing_portal.payment_failed',
          AuditTargetType.PAYMENT,
          opsPayment.id,
          `Payment Failed - ₹${Number(opsPayment.amount)}`,
          {
            organizationId: opsPayment.organizationId,
            razorpayOrderId,
            amount: Number(opsPayment.amount),
            currency: opsPayment.currency,
            error: paymentEntity.error_description || body.error || 'Payment failed or cancelled',
          }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Payment marked as failed',
      });
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
