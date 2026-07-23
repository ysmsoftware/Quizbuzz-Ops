import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/ops-prisma';

export async function GET() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    const formattedPlans = plans.map((p) => {
      // Build human readable feature list for frontend display
      const featureList: string[] = [];
      if (p.maxContestsPerCycle !== null) {
        featureList.push(`${p.maxContestsPerCycle} contest${p.maxContestsPerCycle === 1 ? '' : 's'} per month`);
      } else {
        featureList.push('Unlimited contests');
      }

      if (p.maxParticipantsPerContest !== null) {
        featureList.push(`Up to ${p.maxParticipantsPerContest} participants per contest`);
      } else {
        featureList.push('Unlimited participants');
      }

      if (p.featureProctoring) featureList.push('Advanced proctoring');
      if (p.featureCertBranding) featureList.push('Custom certificate branding');
      if (p.featureAnalyticsExport) featureList.push('Analytics data export');
      if (p.featurePrioritySupport) featureList.push('Priority support');
      if (p.featureCustomDomain) featureList.push('Custom domain integration');

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description || '',
        price: Number(p.price),
        currency: p.currency,
        billingCycle: p.billingCycle,
        maxContestsPerCycle: p.maxContestsPerCycle,
        maxParticipantsPerContest: p.maxParticipantsPerContest,
        maxQuestionsPerContest: p.maxQuestionsPerContest,
        maxOrgMembers: p.maxOrgMembers,
        features: featureList,
        featureFlags: {
          proctoring: p.featureProctoring,
          certBranding: p.featureCertBranding,
          prioritySupport: p.featurePrioritySupport,
          analyticsExport: p.featureAnalyticsExport,
          customDomain: p.featureCustomDomain,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedPlans,
    });
  } catch (error: any) {
    console.error('Error fetching billing portal plans:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subscription plans' },
      { status: 500 }
    );
  }
}
