import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/ops-prisma';
import { queryMainDb } from '@/server/db/main-db-pool';
import { verifyJwt } from '@/server/utils/jwt';
import { env } from '@/server/config/env';
import { writeAuditLogEntry } from '@/server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
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

    if (!organizationId || !planSlug) {
      return NextResponse.json(
        { success: false, error: 'Invalid handoff payload' },
        { status: 400 }
      );
    }

    // 1. Fetch Plan from Ops DB
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, error: 'The requested plan is invalid or inactive' },
        { status: 404 }
      );
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
        price: Number(plan.price),
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

    return NextResponse.json({
      success: true,
      data: {
        session: {
          organizationId,
          organizationName,
          adminId: adminId || null,
          adminEmail: adminEmail || null,
          adminName: adminName || null,
        },
        plan: {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description || '',
          price: Number(plan.price),
          currency: plan.currency,
          billingCycle: plan.billingCycle,
          features: featureList,
        },
      },
    });
  } catch (error: any) {
    console.error('Error verifying billing portal session:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error verifying session' },
      { status: 500 }
    );
  }
}
