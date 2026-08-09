import { featureFlagsRepository } from '../../container';

/**
 * Feature-flag resolution for this repo's own gated code paths (e.g. the
 * billing-portal Razorpay checkout route). Reads ops's own FeatureFlag /
 * FeatureFlagOrgOverride tables directly — this repo already has a live
 * Prisma pool to them, so unlike Quizbuzz-new's SDK (server/db/main-db-pool.ts
 * write-through + TTL cache) there's no round-trip or staleness to manage
 * here; this IS the source of truth.
 */
export async function isFeatureEnabled(key: string, organizationId?: string): Promise<boolean> {
  const flag = await featureFlagsRepository.getFlagByKey(key);
  if (!flag) return false;

  if (flag.supportsOrgOverride && organizationId) {
    const override = await featureFlagsRepository.getActiveOrgOverride(key, organizationId);
    if (override && (override.expiresAt === null || override.expiresAt > new Date())) {
      return override.isEnabled;
    }
  }

  return flag.isEnabled;
}
