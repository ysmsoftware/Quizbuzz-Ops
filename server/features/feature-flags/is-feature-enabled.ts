import { featureFlagsRepository } from '../../container';
import { accessModelOf, computeEffectiveFlagState } from './flag-state';

/**
 * Feature-flag resolution for this repo's own gated code paths (e.g. the
 * billing-portal Razorpay checkout route). Reads ops's own FeatureFlag /
 * FeatureFlagOrgOverride tables directly — this repo already has a live
 * Prisma pool to them, so unlike Quizbuzz-new's SDK (server/db/main-db-pool.ts
 * write-through + TTL cache) there's no round-trip or staleness to manage
 * here; this IS the source of truth.
 *
 * GLOBAL vs OPT_IN semantics live in flag-state.ts (same rules as the main app).
 */
export async function isFeatureEnabled(key: string, organizationId?: string): Promise<boolean> {
  const flag = await featureFlagsRepository.getFlagByKey(key);
  if (!flag) return false;

  const override =
    flag.supportsOrgOverride && organizationId
      ? await featureFlagsRepository.getActiveOrgOverride(key, organizationId)
      : null;

  return computeEffectiveFlagState(accessModelOf(key), flag.isEnabled, override, new Date()).value;
}
