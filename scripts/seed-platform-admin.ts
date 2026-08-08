/**
 * One-off seed script: creates (or updates) the first PlatformAdmin.
 *
 * There is no self-serve signup page for platform admins (login-only by
 * design), so the very first admin account has to be inserted directly.
 * Safe to re-run — upserts by email, so it won't create duplicates.
 *
 * Usage:
 *   npx tsx scripts/seed-platform-admin.ts
 *
 * Override the defaults via env vars if you ever need to seed a different
 * account without editing this file:
 *   SEED_ADMIN_EMAIL=someone@else.com SEED_ADMIN_PASSWORD=... npx tsx scripts/seed-platform-admin.ts
 */
import bcrypt from 'bcryptjs';
import { PlatformAdminRole } from '@prisma/client';
import { prisma } from '../server/db/ops-prisma';
import { generateUlid } from '../server/utils/ulid';

const BCRYPT_SALT_ROUNDS = 10;

interface SeedAdminInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  role: PlatformAdminRole;
}

async function seedPlatformAdmin(input: SeedAdminInput): Promise<void> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  const admin = await prisma.platformAdmin.upsert({
    where: { email: input.email },
    update: {
      passwordHash,
      role: input.role,
      isActive: true,
    },
    create: {
      id: generateUlid(),
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      isActive: true,
    },
  });

  console.log(`[seed-platform-admin] OK — ${admin.email} (role: ${admin.role}, id: ${admin.id})`);
}

async function main(): Promise<void> {
  const input: SeedAdminInput = {
    email: process.env.SEED_ADMIN_EMAIL || 'austinmakasare22@gmail.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Austin@2026',
    firstName: process.env.SEED_ADMIN_FIRST_NAME || 'Austin',
    lastName: process.env.SEED_ADMIN_LAST_NAME || 'Makasare',
    role: PlatformAdminRole.SUPER_ADMIN,
  };

  await seedPlatformAdmin(input);
}

main()
  .catch((err) => {
    console.error('[seed-platform-admin] FAILED', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
