import { planFeatureList } from '@/server/features/plans/plan-feature-list';
import { prisma } from '@/server/db/ops-prisma';
import { queryMainDb } from '@/server/db/main-db-pool';
import { verifyJwt, type BillingHandoffPayload } from '@/server/utils/jwt';
import { handoffSecret } from '@/server/features/invoices/handoff-secret';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { okResponse, errorResponse } from '@/server/http/envelope';
import { errorMessage } from '@/lib/errors';
import { canBuyPlan } from '@/server/features/plans/can-buy-plan';
import { isFeatureEnabled } from '@/server/features/feature-flags/is-feature-enabled';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return errorResponse('Token is required', 'VALIDATION_ERROR', null, 400);
    }

    const secret = handoffSecret();
    if (!secret) {
      return errorResponse('Billing is not available right now. Please contact support.', 'GATEWAY_NOT_CONFIGURED', null, 503);
    }
    let payload: BillingHandoffPayload;
    try {
      payload = verifyJwt(token, secret);
    } catch (e) {
      return errorResponse(`Invalid or expired token: ${errorMessage(e)}`, 'UNAUTHENTICATED', null, 401);
    }

    const { organizationId, adminId, adminEmail, adminName, planSlug } = payload;

    if (!organizationId || !planSlug) {
      return errorResponse('Invalid handoff payload', 'VALIDATION_ERROR', null, 400);
    }

    // 1. Fetch Plan from Ops DB
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan) {
      return errorResponse('The requested plan is invalid or inactive', 'NOT_FOUND', null, 404);
    }

    // 1b. Current subscription (if any) — lets the checkout page show a
    // proration-aware estimate before the org admin clicks Pay, using the
    // same calculateProratedBase() the order-creation route charges with.
    // Purely informational here; the order route re-derives this itself
    // server-side and is the only source of truth for what's actually charged.
    const currentSub = await prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: { select: { id: true, name: true, kind: true } } },
    });

    if (!canBuyPlan(plan, organizationId, currentSub?.planId)) {
      return errorResponse('The requested plan is invalid or inactive', 'NOT_FOUND', null, 404);
    }

    let currentSubscription: {
      planId: string;
      planName: string;
      billingCycle: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
      lastPaidBaseAmount: number | null;
    } | null = null;
    if (currentSub && currentSub.status === 'ACTIVE' && currentSub.currentPeriodEnd > new Date()) {
      const lastPaidPayment = await prisma.opsPayment.findFirst({
        where: {
          organizationId,
          purpose: 'subscription',
          status: 'PAID',
          subscriptionId: currentSub.id,
        },
        orderBy: { paidAt: 'desc' },
      });

      currentSubscription = {
        planId: currentSub.planId,
        planName: currentSub.plan.name,
        billingCycle: currentSub.billingCycle,
        currentPeriodStart: currentSub.currentPeriodStart.toISOString(),
        currentPeriodEnd: currentSub.currentPeriodEnd.toISOString(),
        lastPaidBaseAmount: lastPaidPayment?.baseAmount != null ? Number(lastPaidPayment.baseAmount) : null,
      };
    }

    // 2. Fetch Organization Name from Main DB (optional fallback to organizationId)
    let organizationName = organizationId;
    let organizationSlug: string | null = null;
    try {
      const orgRows = await queryMainDb<{ name: string; slug: string | null }>(
        `SELECT name, slug FROM organizations WHERE id = $1 LIMIT 1`,
        [organizationId]
      );
      if (orgRows.length > 0 && orgRows[0].name) {
        organizationName = orgRows[0].name;
      }
      organizationSlug = orgRows[0]?.slug ?? null;
    } catch (dbErr) {
      console.warn('Failed to query organization name from main DB:', dbErr);
    }

    // 3. Write Audit Log for Checkout Started
    await writeAuditLogEntry(
      {
        id: null,
        email: adminEmail || 'admin@org.com',
        name: adminName || 'Org Admin',
        role: 'ORG_ADMIN via billing-portal',
      },
      'billing_portal.checkout_started',
      AuditTargetType.ORGANIZATION,
      organizationId,
      organizationName,
      {
        organizationId,
        adminId,
        adminEmail,
        planSlug: plan.slug,
        planName: plan.name,
        monthlyPrice: plan.monthlyPrice != null ? Number(plan.monthlyPrice) : null,
        annualPrice: plan.annualPrice != null ? Number(plan.annualPrice) : null,
      }
    );

    const featureList = planFeatureList(plan);

    // Same rule as startAutoDebit: with paid time left, the first automatic charge is when it ends.
    const paidUntil =
      currentSub && currentSub.plan.kind !== 'FREE' && currentSub.currentPeriodEnd.getTime() > Date.now() + 15 * 60_000
        ? currentSub.currentPeriodEnd.toISOString()
        : null;
    const autoDebit = {
      available: (await isFeatureEnabled('razorpay_gateway_active', organizationId)) && (await isFeatureEnabled('auto_debit', organizationId)),
      firstChargeAt: paidUntil,
      // Set when this org already pays this way: choosing it again changes the payment method.
      current: currentSub?.collectionMethod === 'AUTO_DEBIT' ? { planId: currentSub.planId, billingCycle: currentSub.billingCycle } : null,
    };

    return okResponse(
      {
        session: {
          organizationId,
          organizationName,
          organizationSlug,
          adminId: adminId || null,
          adminEmail: adminEmail || null,
          adminName: adminName || null,
        },
        currentSubscription,
        autoDebit,
        plan: {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description || '',
          currency: plan.currency,
          allowsMonthly: plan.allowsMonthly,
          allowsHalfYearly: plan.allowsHalfYearly,
          allowsAnnual: plan.allowsAnnual,
          monthlyPrice: plan.monthlyPrice != null ? Number(plan.monthlyPrice) : null,
          halfYearlyPrice: plan.halfYearlyPrice != null ? Number(plan.halfYearlyPrice) : null,
          annualPrice: plan.annualPrice != null ? Number(plan.annualPrice) : null,
          features: featureList,
        },
      },
      'Checkout session verified.'
    );
  } catch (error) {
    console.error('Error verifying billing portal session:', error);
    return errorResponse('Internal server error verifying session', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
