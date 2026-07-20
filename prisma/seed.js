// Load environment variables first
require('dotenv').config();

const { PrismaClient, PlatformAdminRole, BillingCycle } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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

  // 2. Create Initial Super Admin
  const adminEmail = 'admin@ysmquizbuzz.com';
  const passwordHash = await bcrypt.hash('YsmSecureOps2026!', 10);

  const admin = {
    id: 'admin_01HJ8E4TY9Q5X5M3K8E4TY9Q5X',
    email: adminEmail,
    passwordHash,
    firstName: 'Super',
    lastName: 'Admin',
    role: PlatformAdminRole.SUPER_ADMIN,
    isActive: true,
  };

  await prisma.platformAdmin.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      isActive: admin.isActive,
    },
    create: admin,
  });

  console.log(`Initial Super Admin seeded: ${adminEmail} (Password: YsmSecureOps2026!)`);
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
