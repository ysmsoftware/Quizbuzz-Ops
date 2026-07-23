import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/ops-prisma';
import { verifyJwt } from '@/server/utils/jwt';
import { env } from '@/server/config/env';
import { generateUlid } from '@/server/utils/ulid';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Handoff token is required' },
        { status: 400 }
      );
    }

    const secret = process.env.BILLING_HANDOFF_SECRET || env.BILLING_HANDOFF_SECRET || 'billing_handoff_secret_shared_key_998877';
    let payload: any;
    try {
      payload = verifyJwt(token, secret);
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: `Invalid or expired token: ${e.message}` },
        { status: 401 }
      );
    }

    const { organizationId, adminId, adminEmail, adminName, planSlug } = payload;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, error: 'Target plan not found or inactive' },
        { status: 404 }
      );
    }

    const amountInPaise = Math.round(Number(plan.price) * 100);
    const keyId = process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET || '';

    let razorpayOrderId = `order_test_${generateUlid()}`;

    // If real Razorpay keys are provided, call Razorpay API to create order
    if (keyId && keySecret && !keyId.includes('stub')) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const res = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: plan.currency || 'INR',
            receipt: `sub_${organizationId.slice(-10)}_${Date.now()}`,
            notes: {
              organizationId,
              planSlug: plan.slug,
              adminEmail: adminEmail || '',
            },
          }),
        });

        if (res.ok) {
          const razorpayOrder = await res.json();
          razorpayOrderId = razorpayOrder.id;
        } else {
          const errText = await res.text();
          console.warn('Razorpay order creation failed, using fallback order ID:', errText);
        }
      } catch (err) {
        console.warn('Razorpay API error, using fallback test order ID:', err);
      }
    }

    // Create OpsPayment record
    const paymentId = generateUlid();
    const payment = await prisma.opsPayment.create({
      data: {
        id: paymentId,
        organizationId,
        purpose: 'subscription',
        amount: plan.price,
        currency: plan.currency || 'INR',
        status: 'PENDING',
        razorpayOrderId,
      },
    });

    // Audit Log for Payment Attempted
    await writeAuditLogEntry(
      {
        id: null,
        email: adminEmail || 'admin@org.com',
        name: adminName || 'Org Admin',
        role: 'ORG_ADMIN via billing-portal',
      },
      'billing_portal.payment_attempted',
      AuditTargetType.PAYMENT,
      payment.id,
      `Subscription Order - ${plan.name}`,
      {
        organizationId,
        adminId,
        adminEmail,
        planId: plan.id,
        planSlug: plan.slug,
        razorpayOrderId,
        amount: Number(plan.price),
        currency: plan.currency,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: razorpayOrderId,
        amount: amountInPaise,
        currency: plan.currency || 'INR',
        keyId: keyId || 'rzp_test_stubKey',
        planName: plan.name,
      },
    });
  } catch (error: any) {
    console.error('Error creating subscription payment order:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error creating payment order' },
      { status: 500 }
    );
  }
}
