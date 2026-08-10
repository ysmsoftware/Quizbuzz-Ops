/**
 * Manually run the same feature-flag registry sync that instrumentation.ts
 * runs automatically on every server boot. Useful for a fresh local dev DB
 * (this is what `npm run db:seed` calls), or to force a sync against a
 * running environment without waiting for the next deploy/restart.
 *
 * Safe to re-run — see server/features/feature-flags/sync-feature-flags.ts
 * for exactly what it does and doesn't touch (never writes isEnabled for an
 * existing flag).
 *
 * Usage:
 *   npm run flags:sync
 */
import { prisma } from '../server/db/ops-prisma';
import { syncFeatureFlagRegistry } from '../server/features/feature-flags/sync-feature-flags';

async function main(): Promise<void> {
  const result = await syncFeatureFlagRegistry(prisma);
  console.log('[sync-feature-flags] created:', result.created.length ? result.created : '(none)');
  console.log('[sync-feature-flags] updated:', result.updated.length ? result.updated : '(none)');
  console.log('[sync-feature-flags] deprecated:', result.deprecated.length ? result.deprecated : '(none)');
}

main()
  .catch((err) => {
    console.error('[sync-feature-flags] FAILED', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
