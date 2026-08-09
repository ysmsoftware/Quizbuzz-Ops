// Load environment variables first
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
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

  // 2. Feature flags — carries over the exact keys/labels/descriptions from
  // the old lib/data/db.ts INITIAL_FEATURE_FLAGS mock 1:1 so existing UI
  // copy doesn't need to change.
  const featureFlags = [
    {
      id: 'flag_maintenance',
      key: 'maintenance_mode',
      label: 'Maintenance Mode',
      description: 'Activates maintenance window platform-wide. All live operations are suspended.',
      isEnabled: false,
      severity: 'CRITICAL',
      supportsOrgOverride: false,
      updatedByName: 'System Auto-Config',
    },
    {
      id: 'flag_pause_reg',
      key: 'new_registrations_paused',
      label: 'Pause Registrations',
      description: 'Temporarily pause registration for new contest participants across the platform.',
      isEnabled: false,
      severity: 'WARNING',
      supportsOrgOverride: false,
      updatedByName: 'System Auto-Config',
    },
    {
      id: 'flag_proctoring',
      key: 'proctoring_enabled_platform_wide',
      label: 'Platform-wide AI Proctoring',
      description: 'Enables AI proctoring services across all qualified organization contests.',
      isEnabled: true,
      severity: 'STANDARD',
      supportsOrgOverride: true,
      updatedByName: 'System Auto-Config',
    },
    {
      id: 'flag_cert_auto',
      key: 'certificate_auto_delivery',
      label: 'Certificate Auto-delivery',
      description: 'Automatically deliver signed PDF certificates to participants completing a contest.',
      isEnabled: true,
      severity: 'STANDARD',
      supportsOrgOverride: true,
      updatedByName: 'System Auto-Config',
    },
    {
      id: 'flag_analytics',
      key: 'enhanced_analytics_pipeline',
      label: 'Enhanced Analytics Pipeline',
      description: 'Streams raw candidate responses to the high-concurrency analytical engine.',
      isEnabled: true,
      severity: 'STANDARD',
      supportsOrgOverride: true,
      updatedByName: 'System Auto-Config',
    },
    {
      id: 'flag_razorpay',
      key: 'razorpay_gateway_active',
      label: 'Razorpay Payment Gateway',
      description: 'Accept live candidate registration payments via Razorpay merchant portal.',
      isEnabled: true,
      severity: 'WARNING',
      supportsOrgOverride: true,
      updatedByName: 'System Auto-Config',
    },
  ];

  for (const flag of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: flag,
    });
    console.log(`Feature flag seeded: ${flag.label} (${flag.key})`);
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
