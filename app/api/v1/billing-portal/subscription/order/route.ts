import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/ops-prisma';
import { verifyJwt } from '@/server/utils/jwt';
import { env } from '@/server/config/env';
import { generateUlid } from '@/server/utils/ulid';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import {
  calculateSubscriptionPricing,
  resolvePlanCyclePrice,
  periodMonthsForCycle,
  isValidBillingCycle,
} from '@/lib/pricing/subscriptionPricing';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, billingCycle } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Handoff token is required' },
        { status: 400 }
      );
    }

    if (!isValidBillingCycle(billingCycle)) {
      return NextResponse.json(
        { success: false, error: 'billingCycle must be MONTHLY or ANNUAL' },
        { status: 400 }
      );
    }

    const secret = env.BILLING_HANDOFF_SECRET;
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

    let baseAmount: number;
    try {
      baseAmount = resolvePlanCyclePrice(
        {
          allowsMonthly: plan.allowsMonthly,
          allowsAnnual: plan.allowsAnnual,
          monthlyPrice: plan.monthlyPrice ? Number(plan.monthlyPrice) : null,
          annualPrice: plan.annualPrice ? Number(plan.annualPrice) : null,
        },
        billingCycle
      );
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }

    const periodMonths = periodMonthsForCycle(billingCycle);
    const pricing = calculateSubscriptionPricing(baseAmount);
    const amountInPaise = Math.round(pricing.totalAmount * 100);
    const currency = plan.currency || 'INR';

    // Idempotency: reuse an existing non-terminal order for this exact
    // org + plan + cycle instead of minting a new Razorpay order every time
    // the admin double-clicks Pay, reloads, or retries after a network blip.
    const existing = await prisma.opsPayment.findFirst({
      where: {
        organizationId,
        planId: plan.id,
        billingCycle,
        purpose: 'subscription',
        status: { in: ['CREATED', 'PENDING'] },
        razorpayOrderId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: {
          paymentId: existing.id,
          orderId: existing.razorpayOrderId,
          amount: Math.round(Number(existing.amount) * 100),
          currency: existing.currency,
          keyId: env.RAZORPAY_KEY_ID || 'rzp_test_stubKey',
          planName: plan.name,
          pricing: {
            baseAmount: Number(existing.baseAmount ?? pricing.baseAmount),
            gatewayFeeAmount: Number(existing.gatewayFeeAmount ?? pricing.gatewayFeeAmount),
            gstAmount: Number(existing.gstAmount ?? pricing.gstAmount),
            totalAmount: Number(existing.amount),
          },
          billingCycle,
        },
      });
    }

    const keyId = env.RAZORPAY_KEY_ID || '';
    const keySecret = env.RAZORPAY_KEY_SECRET || '';
    const isProduction = process.env.NODE_ENV === 'production';

    let razorpayOrderId: string;

    if (keyId && keySecret && !keyId.includes('stub')) {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency,
          receipt: `sub_${organizationId.slice(-10)}_${Date.now()}`,
          notes: {
            organizationId,
            planSlug: plan.slug,
            billingCycle,
            adminEmail: adminEmail || '',
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Razorpay order creation failed:', errText);
        return NextResponse.json(
          { success: false, error: 'Payment gateway is unavailable right now. Please try again shortly.' },
          { status: 502 }
        );
      }

      const razorpayOrder = await res.json();
      razorpayOrderId = razorpayOrder.id;
    } else if (isProduction) {
      // No real Razorpay keys configured in production — fail loudly instead
      // of minting an order id nothing can ever legitimately pay against.
      console.error('RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not configured in production.');
      return NextResponse.json(
        { success: false, error: 'Payment gateway is not configured.' },
        { status: 503 }
      );
    } else {
      // Local/dev convenience only — never reachable in production.
      razorpayOrderId = `order_test_${generateUlid()}`;
    }

    const paymentId = generateUlid();
    const payment = await prisma.opsPayment.create({
      data: {
        id: paymentId,
        organizationId,
        purpose: 'subscription',
        planId: plan.id,
        billingCycle,
        periodMonths,
        baseAmount: pricing.baseAmount,
        gatewayFeeAmount: pricing.gatewayFeeAmount,
        gstAmount: pricing.gstAmount,
        amount: pricing.totalAmount,
        currency,
        status: 'CREATED',
        razorpayOrderId,
      },
    });

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
        billingCycle,
        razorpayOrderId,
        baseAmount: pricing.baseAmount,
        gatewayFeeAmount: pricing.gatewayFeeAmount,
        gstAmount: pricing.gstAmount,
        amount: pricing.totalAmount,
        currency,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: razorpayOrderId,
        amount: amountInPaise,
        currency,
        keyId: keyId || 'rzp_test_stubKey',
        planName: plan.name,
        pricing,
        billingCycle,
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
