// Load environment variables first
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { execSync } = require('child_process');
const path = require('path');

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
      currency: 'INR',
      allowsMonthly: true,
      allowsAnnual: false,
      monthlyPrice: 0.00,
      annualPrice: null,
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
      currency: 'INR',
      allowsMonthly: true,
      allowsAnnual: false,
      monthlyPrice: 1.00,
      annualPrice: null,
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
      currency: 'INR',
      allowsMonthly: true,
      allowsAnnual: true,
      monthlyPrice: 2999.00,
      annualPrice: 29999.00,
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
      currency: 'INR',
      allowsMonthly: true,
      allowsAnnual: false,
      monthlyPrice: 9999.00,
      annualPrice: null,
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
      currency: 'INR',
      allowsMonthly: false,
      allowsAnnual: true,
      monthlyPrice: null,
      annualPrice: 299999.00,
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

  // 2. Feature flags — the flag list itself now lives in exactly one place,
  // server/features/feature-flags/feature-flag-registry.ts (type-checked,
  // code-reviewed), not duplicated here. In production this same sync runs
  // automatically on every server boot (instrumentation.ts) so a flag added
  // to the registry shows up without anyone needing to run this script —
  // it's invoked here too only so `npm run db:seed` remains a true
  // one-command "set up a fresh local DB" for plans + flags together.
  console.log('🚩 Syncing feature flags from the code registry...');
  execSync('npx tsx --env-file=.env scripts/sync-feature-flags.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

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
