import { planFeatureList } from '@/server/features/plans/plan-feature-list';
import { prisma } from '@/server/db/ops-prisma';
import { okResponse, errorResponse } from '@/server/http/envelope';

export async function GET() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      // Private plans and retired versions are never listed.
      where: { isActive: true, isSellable: true, organizationId: null },
      orderBy: [{ monthlyPrice: { sort: 'asc', nulls: 'last' } }, { annualPrice: { sort: 'asc', nulls: 'last' } }],
    });

    const formattedPlans = plans.map((p) => {
      const featureList = planFeatureList(p);

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description || '',
        currency: p.currency,
        allowsMonthly: p.allowsMonthly,
        allowsHalfYearly: p.allowsHalfYearly,
        allowsAnnual: p.allowsAnnual,
        audience: p.audience,
        monthlyPrice: p.monthlyPrice != null ? Number(p.monthlyPrice) : null,
        halfYearlyPrice: p.halfYearlyPrice != null ? Number(p.halfYearlyPrice) : null,
        annualPrice: p.annualPrice != null ? Number(p.annualPrice) : null,
        maxContestsPerCycle: p.maxContestsPerCycle,
        maxParticipantsPerContest: p.maxParticipantsPerContest,
        maxQuestionsPerContest: p.maxQuestionsPerContest,
        maxOrgMembers: p.maxOrgMembers,
        maxLearners: p.maxLearners,
        maxCandidatesPerMonth: p.maxCandidatesPerMonth,
        aiCreditsPerMonth: p.aiCreditsPerMonth,
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

    return okResponse(formattedPlans, 'Subscription plans retrieved.');
  } catch (error) {
    console.error('Error fetching billing portal plans:', error);
    return errorResponse('Failed to fetch subscription plans', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
