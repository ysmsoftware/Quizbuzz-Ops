import { prisma } from '@/server/db/ops-prisma';
import { redis } from '@/server/lib/redis';
import { verifyJwt } from '@/server/utils/jwt';
import { env } from '@/server/config/env';
import { generateUlid } from '@/server/utils/ulid';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { okResponse, errorResponse } from '@/server/http/envelope';
import {
  calculateSubscriptionPricing,
  calculateProratedBase,
  resolvePlanCyclePrice,
  periodMonthsForCycle,
  isValidBillingCycle,
  type BillingCycleChoice,
} from '@/lib/pricing/subscriptionPricing';

// Short-lived per org+plan+cycle lock so a double-click, two open tabs, or a
// retried request can't race two concurrent calls past the active-subscription
// check below and create two orders before either has committed. Deliberately
// NOT a lock on the handoff token itself — the token is legitimately reused
// across session verification + one or more retried order-creation calls
// (e.g. Razorpay's script failing to load), and the existing CREATED/PENDING
// reuse logic further down already makes same-token retries idempotent. This
// lock only needs to survive long enough to cover that race, not the token's
// full 10-minute life.
const ORDER_LOCK_TTL_MS = 8000;

export async function POST(req: Request) {
  let lockKey: string | null = null;

  try {
    const body = await req.json();
    const { token, billingCycle } = body;

    if (!token) {
      return errorResponse('Handoff token is required', 'VALIDATION_ERROR', null, 400);
    }

    if (!isValidBillingCycle(billingCycle)) {
      return errorResponse('billingCycle must be MONTHLY or ANNUAL', 'VALIDATION_ERROR', null, 400);
    }

    const secret = env.BILLING_HANDOFF_SECRET;
    let payload: any;
    try {
      payload = verifyJwt(token, secret);
    } catch (e: any) {
      return errorResponse(`Invalid or expired token: ${e.message}`, 'UNAUTHENTICATED', null, 401);
    }

    const { organizationId, adminId, adminEmail, adminName, planSlug } = payload;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan || !plan.isActive) {
      return errorResponse('Target plan not found or inactive', 'NOT_FOUND', null, 404);
    }

    // Acquire the concurrency lock now that we know org+plan+cycle.
    lockKey = `billing:order-lock:${organizationId}:${plan.id}:${billingCycle}`;
    const acquired = await redis.set(lockKey, '1', 'PX', ORDER_LOCK_TTL_MS, 'NX');
    if (!acquired) {
      lockKey = null; // we don't own it — don't release someone else's lock
      return errorResponse(
        'A payment request for this plan is already being processed. Please wait a moment and try again.',
        'CONFLICT',
        null,
        429
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
      return errorResponse(e.message, 'VALIDATION_ERROR', null, 400);
    }

    const periodMonths = periodMonthsForCycle(billingCycle);
    const currency = plan.currency || 'INR';

    // ── Duplicate-purchase guard ────────────────────────────────────────────
    // Block re-buying the exact same active plan+cycle outright — that can
    // never be a legitimate purchase (it would just double-charge for time
    // already paid for). A DIFFERENT plan (or a different cycle) while a
    // subscription is active is allowed through — that's a real upgrade/
    // downgrade/early-renewal flow, and gets prorated below instead of blocked.
    const currentSub = await prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    const now = new Date();
    const hasActiveSub =
      !!currentSub && currentSub.status === 'ACTIVE' && currentSub.currentPeriodEnd > now;

    if (
      hasActiveSub &&
      currentSub!.planId === plan.id &&
      currentSub!.billingCycle === billingCycle
    ) {
      return errorResponse(
        `You already have an active ${plan.name} (${billingCycle === 'ANNUAL' ? 'annual' : 'monthly'}) subscription until ${currentSub!.currentPeriodEnd.toISOString().slice(0, 10)}.`,
        'ALREADY_SUBSCRIBED',
        null,
        409
      );
    }

    // ── Proration ────────────────────────────────────────────────────────────
    // If there's an active, non-expired subscription (to any plan/cycle —
    // the identical-plan case above already returned), credit its unused time
    // against this purchase instead of charging a fresh full price on top of
    // time already paid for.
    let creditApplied = 0;
    let proratedBaseAmount = baseAmount;

    if (hasActiveSub) {
      const lastPaidPayment = await prisma.opsPayment.findFirst({
        where: {
          organizationId,
          purpose: 'subscription',
          status: 'PAID',
          subscriptionId: currentSub!.id,
        },
        orderBy: { paidAt: 'desc' },
      });

      const proration = calculateProratedBase(
        baseAmount,
        {
          currentPeriodStart: currentSub!.currentPeriodStart,
          currentPeriodEnd: currentSub!.currentPeriodEnd,
          billingCycle: currentSub!.billingCycle as BillingCycleChoice,
          lastPaidBaseAmount: lastPaidPayment?.baseAmount != null ? Number(lastPaidPayment.baseAmount) : null,
          planMonthlyPrice: plan.monthlyPrice ? Number(plan.monthlyPrice) : null,
          planAnnualPrice: plan.annualPrice ? Number(plan.annualPrice) : null,
        },
        now
      );

      proratedBaseAmount = proration.proratedBase;
      creditApplied = proration.creditApplied;
    }

    const pricing = calculateSubscriptionPricing(proratedBaseAmount);
    const amountInPaise = Math.round(pricing.totalAmount * 100);

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
      return okResponse(
        {
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
            creditApplied: Number(existing.creditApplied ?? creditApplied),
          },
          billingCycle,
        },
        'Existing payment order reused.'
      );
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
        return errorResponse('Payment gateway is unavailable right now. Please try again shortly.', 'GATEWAY_ERROR', null, 502);
      }

      const razorpayOrder = await res.json();
      razorpayOrderId = razorpayOrder.id;
    } else if (isProduction) {
      // No real Razorpay keys configured in production — fail loudly instead
      // of minting an order id nothing can ever legitimately pay against.
      console.error('RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not configured in production.');
      return errorResponse('Payment gateway is not configured.', 'GATEWAY_NOT_CONFIGURED', null, 503);
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
        creditApplied,
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
        creditApplied,
        amount: pricing.totalAmount,
        currency,
      }
    );

    return okResponse(
      {
        paymentId: payment.id,
        orderId: razorpayOrderId,
        amount: amountInPaise,
        currency,
        keyId: keyId || 'rzp_test_stubKey',
        planName: plan.name,
        pricing: { ...pricing, creditApplied },
        billingCycle,
      },
      'Payment order created.'
    );
  } catch (error: any) {
    console.error('Error creating subscription payment order:', error);
    return errorResponse('Internal server error creating payment order', 'INTERNAL_SERVER_ERROR', null, 500);
  } finally {
    if (lockKey) {
      await redis.del(lockKey).catch(() => {});
    }
  }
}
