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

  // 1. The plan catalogue lives in server/features/plans/plan-catalogue.ts and syncs on every boot.
  execSync('npx tsx --env-file=.env scripts/sync-plan-catalogue.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

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

  // NOTE: this script intentionally does NOT seed a platform admin account. Admin credentials
  // are never stored in code: create one with `npm run seed:platform-admin`, passing the email
  // and password as environment variables in the terminal (see that script).

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
