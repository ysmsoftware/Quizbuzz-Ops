import { PlanAudience, PlanKind, PrismaClient } from '@prisma/client';

/**
 * The launch catalogue from docs/pricing/01-tier-sheet.md in the main repo. Like the flag registry,
 * this runs on every boot, but it only inserts: once a plan exists, ops owns its numbers. Institution
 * and Enterprise are contact sales, so they are private plans ops creates per customer.
 */

type CataloguePlan = {
  slug: string;
  name: string;
  description: string;
  kind?: PlanKind;
  audience: PlanAudience;
  prices?: [monthly: number, halfYearly: number, annual: number];
  contests: number | null;
  participants: number | null;
  questions: number;
  members: number;
  learners: number | null;
  candidates?: number;
  aiCredits: number;
  commission?: number;
  features: Array<'certBranding' | 'export' | 'groups' | 'gradebook' | 'ambassador' | 'manualEmails' | 'customDomain' | 'prioritySupport'>;
};

const EDUCATION = ['certBranding', 'export', 'groups', 'gradebook', 'manualEmails'] as const;
const PRO = [...EDUCATION, 'ambassador', 'prioritySupport'] as const;

export const PLAN_CATALOGUE: CataloguePlan[] = [
  // ponytail: Free's "50 AI credits once" is a one-time grant, so it is 0 per month here. Grant it when AI ships.
  { slug: 'free', name: 'Free', description: 'Run your first contest today. No card needed.', kind: PlanKind.FREE, audience: PlanAudience.ORGANIZER, contests: 2, participants: 100, questions: 25, members: 1, learners: 0, aiCredits: 0, commission: 5, features: [] },
  { slug: 'solo', name: 'Solo', description: 'For one person running regular contests or class tests.', audience: PlanAudience.ORGANIZER, prices: [699, 3749, 6990], contests: 10, participants: 250, questions: 75, members: 1, learners: 50, aiCredits: 100, commission: 3, features: ['certBranding', 'export'] },
  { slug: 'edu-basic', name: 'Basic', description: 'Weekly tests, results and ranks for up to 150 students.', audience: PlanAudience.EDUCATION, prices: [2399, 12949, 23990], contests: 40, participants: 500, questions: 200, members: 3, learners: 150, aiCredits: 300, commission: 2, features: [...EDUCATION] },
  { slug: 'edu-pro-500', name: 'Pro 500', description: 'For institutes with several batches or departments.', audience: PlanAudience.EDUCATION, prices: [5999, 32399, 59990], contests: 200, participants: 1000, questions: 500, members: 8, learners: 500, aiCredits: 1000, commission: 1.5, features: [...PRO] },
  { slug: 'edu-pro-1000', name: 'Pro 1,000', description: 'For institutes with several batches or departments.', audience: PlanAudience.EDUCATION, prices: [10999, 59399, 109990], contests: 200, participants: 2000, questions: 500, members: 14, learners: 1000, aiCredits: 2000, commission: 1.5, features: [...PRO, 'customDomain'] },
  { slug: 'edu-pro-1500', name: 'Pro 1,500', description: 'For institutes with several batches or departments.', audience: PlanAudience.EDUCATION, prices: [15499, 83699, 154990], contests: 200, participants: 3000, questions: 500, members: 20, learners: 1500, aiCredits: 3000, commission: 1, features: [...PRO, 'customDomain'] },
  { slug: 'biz-team', name: 'Team', description: 'For a hiring or training team running regular assessments.', audience: PlanAudience.BUSINESS, prices: [4999, 26999, 49990], contests: null, participants: null, questions: 200, members: 5, learners: null, candidates: 500, aiCredits: 300, features: ['certBranding', 'export', 'groups', 'manualEmails'] },
  { slug: 'biz-business', name: 'Business', description: 'For campus drives and company-wide certification.', audience: PlanAudience.BUSINESS, prices: [9999, 53999, 99990], contests: null, participants: null, questions: 500, members: 10, learners: null, candidates: 2000, aiCredits: 1000, features: ['certBranding', 'export', 'groups', 'gradebook', 'manualEmails', 'customDomain', 'prioritySupport'] },
];

/** Earlier plans. Subscribers stay on them, but they're off sale. */
const RETIRED_SLUGS = ['starter', 'starter-test', 'growth', 'scale', 'enterprise'];

export async function syncPlanCatalogue(prisma: PrismaClient): Promise<string[]> {
  const created: string[] = [];
  const existing = new Set((await prisma.subscriptionPlan.findMany({ select: { slug: true } })).map((p) => p.slug));

  for (const plan of PLAN_CATALOGUE) {
    if (existing.has(plan.slug)) continue;
    const has = (f: CataloguePlan['features'][number]) => plan.features.includes(f);
    await prisma.subscriptionPlan.create({
      data: {
        id: `plan_${plan.slug.replace(/-/g, '_')}`,
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        kind: plan.kind ?? PlanKind.STANDARD,
        audience: plan.audience,
        isSellable: true,
        allowsMonthly: true,
        allowsHalfYearly: !!plan.prices,
        allowsAnnual: !!plan.prices,
        monthlyPrice: plan.prices?.[0] ?? 0,
        halfYearlyPrice: plan.prices?.[1] ?? null,
        annualPrice: plan.prices?.[2] ?? null,
        maxContestsPerCycle: plan.contests,
        maxParticipantsPerContest: plan.participants,
        maxQuestionsPerContest: plan.questions,
        maxOrgMembers: plan.members,
        maxLearners: plan.learners,
        maxCandidatesPerMonth: plan.candidates ?? null,
        aiCreditsPerMonth: plan.aiCredits,
        commissionPercent: plan.commission ?? null,
        featureProctoring: true,
        featureCertBranding: has('certBranding'),
        featureAnalyticsExport: has('export'),
        featureLearnerGroups: has('groups'),
        featureGradebook: has('gradebook'),
        featureAmbassadorCampaigns: has('ambassador'),
        featureManualEmails: has('manualEmails'),
        featureCustomDomain: has('customDomain'),
        featurePrioritySupport: has('prioritySupport'),
      },
    });
    created.push(plan.slug);
  }

  // First boot on a DB that already has a `free` row: bring it to the catalogue once. After that ops owns it.
  const free = PLAN_CATALOGUE[0];
  await prisma.subscriptionPlan.updateMany({
    where: { slug: 'free', audience: null },
    data: {
      name: free.name,
      description: free.description,
      audience: free.audience,
      maxContestsPerCycle: free.contests,
      maxParticipantsPerContest: free.participants,
      maxQuestionsPerContest: free.questions,
      maxOrgMembers: free.members,
      maxLearners: free.learners,
      aiCreditsPerMonth: free.aiCredits,
      commissionPercent: free.commission,
      featureProctoring: true,
    },
  });
  await prisma.subscriptionPlan.updateMany({ where: { slug: 'free' }, data: { kind: PlanKind.FREE, isSellable: true } });

  // `starter` was the old free plan: its orgs move to `free`, and it goes off sale with the others.
  const starter = await prisma.subscriptionPlan.findUnique({ where: { slug: 'starter' }, select: { id: true } });
  const freeRow = await prisma.subscriptionPlan.findUnique({ where: { slug: 'free' }, select: { id: true } });
  if (starter && freeRow) {
    await prisma.organizationSubscription.updateMany({ where: { planId: starter.id }, data: { planId: freeRow.id } });
  }
  await prisma.subscriptionPlan.updateMany({ where: { slug: { in: RETIRED_SLUGS } }, data: { isSellable: false } });
  return created;
}
