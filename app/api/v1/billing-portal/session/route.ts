import { prisma } from '@/server/db/ops-prisma';
import { queryMainDb } from '@/server/db/main-db-pool';
import { verifyJwt } from '@/server/utils/jwt';
import { env } from '@/server/config/env';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { okResponse, errorResponse } from '@/server/http/envelope';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return errorResponse('Token is required', 'VALIDATION_ERROR', null, 400);
    }

    const secret = env.BILLING_HANDOFF_SECRET;
    let payload: any;
    try {
      payload = verifyJwt(token, secret);
    } catch (e: any) {
      return errorResponse(`Invalid or expired token: ${e.message}`, 'UNAUTHENTICATED', null, 401);
    }

    const { organizationId, adminId, adminEmail, adminName, planSlug } = payload;

    if (!organizationId || !planSlug) {
      return errorResponse('Invalid handoff payload', 'VALIDATION_ERROR', null, 400);
    }

    // 1. Fetch Plan from Ops DB
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan || !plan.isActive) {
      return errorResponse('The requested plan is invalid or inactive', 'NOT_FOUND', null, 404);
    }

    // 1b. Current subscription (if any) — lets the checkout page show a
    // proration-aware estimate before the org admin clicks Pay, using the
    // same calculateProratedBase() the order-creation route charges with.
    // Purely informational here; the order route re-derives this itself
    // server-side and is the only source of truth for what's actually charged.
    const currentSub = await prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: { select: { id: true, name: true, monthlyPrice: true, annualPrice: true } } },
    });

    let currentSubscription: any = null;
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
        planMonthlyPrice: currentSub.plan.monthlyPrice != null ? Number(currentSub.plan.monthlyPrice) : null,
        planAnnualPrice: currentSub.plan.annualPrice != null ? Number(currentSub.plan.annualPrice) : null,
      };
    }

    // 2. Fetch Organization Name from Main DB (optional fallback to organizationId)
    let organizationName = organizationId;
    try {
      const orgRows = await queryMainDb<{ name: string }>(
        `SELECT name FROM organizations WHERE id = $1 LIMIT 1`,
        [organizationId]
      );
      if (orgRows.length > 0 && orgRows[0].name) {
        organizationName = orgRows[0].name;
      }
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

    // Build human readable feature list
    const featureList: string[] = [];
    if (plan.maxContestsPerCycle !== null) {
      featureList.push(`${plan.maxContestsPerCycle} contest${plan.maxContestsPerCycle === 1 ? '' : 's'} per month`);
    } else {
      featureList.push('Unlimited contests');
    }
    if (plan.maxParticipantsPerContest !== null) {
      featureList.push(`Up to ${plan.maxParticipantsPerContest} participants per contest`);
    } else {
      featureList.push('Unlimited participants');
    }
    if (plan.featureProctoring) featureList.push('Advanced proctoring');
    if (plan.featureCertBranding) featureList.push('Custom certificate branding');
    if (plan.featureAnalyticsExport) featureList.push('Analytics data export');
    if (plan.featurePrioritySupport) featureList.push('Priority support');

    return okResponse(
      {
        session: {
          organizationId,
          organizationName,
          adminId: adminId || null,
          adminEmail: adminEmail || null,
          adminName: adminName || null,
        },
        currentSubscription,
        plan: {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description || '',
          currency: plan.currency,
          allowsMonthly: plan.allowsMonthly,
          allowsAnnual: plan.allowsAnnual,
          monthlyPrice: plan.monthlyPrice != null ? Number(plan.monthlyPrice) : null,
          annualPrice: plan.annualPrice != null ? Number(plan.annualPrice) : null,
          features: featureList,
        },
      },
      'Checkout session verified.'
    );
  } catch (error: any) {
    console.error('Error verifying billing portal session:', error);
    return errorResponse('Internal server error verifying session', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
