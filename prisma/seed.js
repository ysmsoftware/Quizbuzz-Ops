// Load environment variables first
require('dotenv').config();

const { PrismaClient, BillingCycle } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Initialize the PG pool and Prisma adapter for Prisma 7 compatibility
const pool = new Pool({
  connectionString: process.env.OPS_DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Create Default Plans
  const plans = [
    {
      id: 'plan_starter',
      name: 'Starter (Free)',
      slug: 'starter',
      description: 'Perfect for small events and testing.',
      price: 0.00,
      currency: 'INR',
      billingCycle: BillingCycle.MONTHLY,
      maxContestsPerCycle: 2,
      maxParticipantsPerContest: 100,
      maxQuestionsPerContest: 15,
      maxOrgMembers: 1,
      featureProctoring: false,
      featureCertBranding: false,
      featurePrioritySupport: false,
      featureAnalyticsExport: false,
      featureCustomDomain: false,
    },
    {
      id: 'plan_starter_test',
      name: 'Starter (Test — ₹1)',
      slug: 'starter-test',
      description: 'Test plan for validating the subscription payment handoff. Not for production orgs.',
      price: 1.00,
      currency: 'INR',
      billingCycle: BillingCycle.MONTHLY,
      maxContestsPerCycle: 2,
      maxParticipantsPerContest: 100,
      maxQuestionsPerContest: 15,
      maxOrgMembers: 1,
      featureProctoring: false,
      featureCertBranding: false,
      featurePrioritySupport: false,
      featureAnalyticsExport: false,
      featureCustomDomain: false,
    },
    {
      id: 'plan_growth',
      name: 'Growth',
      slug: 'growth',
      description: 'For growing organizations running regular quizzes.',
      price: 2999.00,
      currency: 'INR',
      billingCycle: BillingCycle.MONTHLY,
      maxContestsPerCycle: 10,
      maxParticipantsPerContest: 1000,
      maxQuestionsPerContest: 50,
      maxOrgMembers: 5,
      featureProctoring: false,
      featureCertBranding: true,
      featurePrioritySupport: false,
      featureAnalyticsExport: true,
      featureCustomDomain: false,
    },
    {
      id: 'plan_scale',
      name: 'Scale',
      slug: 'scale',
      description: 'For large operations requiring advanced proctoring and exports.',
      price: 9999.00,
      currency: 'INR',
      billingCycle: BillingCycle.MONTHLY,
      maxContestsPerCycle: 30,
      maxParticipantsPerContest: 5000,
      maxQuestionsPerContest: 100,
      maxOrgMembers: 15,
      featureProctoring: true,
      featureCertBranding: true,
      featurePrioritySupport: false,
      featureAnalyticsExport: true,
      featureCustomDomain: false,
    },
    {
      id: 'plan_enterprise',
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Custom scaling, priority support, and absolute control.',
      price: 29999.00,
      currency: 'INR',
      billingCycle: BillingCycle.MONTHLY,
      maxContestsPerCycle: null,
      maxParticipantsPerContest: null,
      maxQuestionsPerContest: null,
      maxOrgMembers: null,
      featureProctoring: true,
      featureCertBranding: true,
      featurePrioritySupport: true,
      featureAnalyticsExport: true,
      featureCustomDomain: true,
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
    console.log(`Plan seeded: ${plan.name} (${plan.slug})`);
  }

  // NOTE: this script intentionally does NOT seed a platform admin account.
  // It used to upsert a fixed admin@ysmquizbuzz.com / YsmSecureOps2026!
  // super admin on every run — a real, known, working credential that would
  // silently get re-created (and re-activated) any time `npm run db:seed`
  // was run again, including by accident against a live production database.
  // Platform admins are provisioned directly against the database (or via a
  // dedicated one-off admin-creation script that generates a random password
  // and forces a reset), never via this shared seed script.

  console.log('✅ Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
