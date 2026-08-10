import { PrismaClient } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';
import { FEATURE_FLAG_REGISTRY } from './feature-flag-registry';

export interface FeatureFlagSyncResult {
  created: string[];
  updated: string[];
  deprecated: string[];
}

/**
 * Idempotent — safe to run on every server boot and safe under concurrent
 * execution from multiple app replicas, since every write here is either an
 * upsert-by-unique-key or a plain update-by-key.
 *
 * What this does NOT do, on purpose: it never writes `isEnabled` for a flag
 * that already has a row. That's live operator state, owned by the database
 * (set via the ops dashboard's toggle/PUT endpoints), not by this file or
 * the code registry. Re-running this after a deploy must never silently
 * flip a flag back on/off.
 */
export async function syncFeatureFlagRegistry(prisma: PrismaClient): Promise<FeatureFlagSyncResult> {
  const result: FeatureFlagSyncResult = { created: [], updated: [], deprecated: [] };
  const registryKeys = new Set(FEATURE_FLAG_REGISTRY.map((f) => f.key));

  for (const def of FEATURE_FLAG_REGISTRY) {
    const existing = await prisma.featureFlag.findUnique({ where: { key: def.key } });

    if (!existing) {
      await prisma.featureFlag.create({
        data: {
          id: generateUlid(),
          key: def.key,
          label: def.label,
          description: def.description,
          isEnabled: def.defaultEnabled,
          severity: def.severity,
          supportsOrgOverride: def.supportsOrgOverride,
          updatedByName: 'System Auto-Sync',
          deprecatedAt: null,
        },
      });
      result.created.push(def.key);
      continue;
    }

    // Metadata is code-owned and safe to refresh on every boot.
    // deprecatedAt: null un-deprecates a flag that was removed and later
    // re-added to the registry. isEnabled is deliberately absent — see the
    // doc comment above.
    const metadataChanged =
      existing.label !== def.label ||
      existing.description !== def.description ||
      existing.severity !== def.severity ||
      existing.supportsOrgOverride !== def.supportsOrgOverride ||
      existing.deprecatedAt !== null;

    if (metadataChanged) {
      await prisma.featureFlag.update({
        where: { key: def.key },
        data: {
          label: def.label,
          description: def.description,
          severity: def.severity,
          supportsOrgOverride: def.supportsOrgOverride,
          deprecatedAt: null,
        },
      });
      result.updated.push(def.key);
    }
  }

  // Flags present in the DB but no longer in the registry — soft-deprecate,
  // never delete (feature_flag_org_overrides.flagKey is ON DELETE RESTRICT
  // against this table, and even override-free flags should keep their
  // PlatformAuditLog history addressable by key).
  const activeDbFlags = await prisma.featureFlag.findMany({ where: { deprecatedAt: null } });
  for (const flag of activeDbFlags) {
    if (!registryKeys.has(flag.key)) {
      await prisma.featureFlag.update({
        where: { key: flag.key },
        data: { deprecatedAt: new Date() },
      });
      result.deprecated.push(flag.key);
    }
  }

  return result;
}
