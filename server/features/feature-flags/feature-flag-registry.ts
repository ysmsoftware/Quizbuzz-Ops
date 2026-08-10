import { FeatureFlagSeverity } from '@prisma/client';

/**
 * The single source of truth for which system-wide feature flags exist.
 *
 * This file answers "what flags exist" (type-checked, code-reviewed, ships
 * with a deploy). The database is the source of truth for "is it on right
 * now" (isEnabled) and "who has an org-level override" — that's live
 * operator state and must never be touched by anything in this file.
 *
 * HOW TO ADD A NEW FLAG:
 *   1. Add an entry below with a unique `key`. TypeScript will catch
 *      duplicate/malformed entries at compile time (see the `satisfies`
 *      check at the bottom of this file).
 *   2. Add real enforcement call site(s) for it in this repo and/or
 *      Quizbuzz-new using isFeatureEnabled(key) / isFeatureEnabled(key, {
 *      organizationId }) — see server/features/feature-flags/is-feature-enabled.ts.
 *   3. Ship the deploy. syncFeatureFlagRegistry() (sync-feature-flags.ts)
 *      runs automatically on every server boot (instrumentation.ts) and will
 *      insert the new row with `defaultEnabled` as its starting value — no
 *      manual seed script, no SSH session, no SQL. It'll show up in the
 *      Feature Flags tab on the next deploy.
 *
 * HOW TO REMOVE A FLAG:
 *   1. Remove (or stop calling) its enforcement call site(s) in code.
 *   2. Delete its entry from this array and ship the deploy.
 *   3. The next boot's sync marks the DB row `deprecatedAt` (never deletes
 *      it — feature_flag_org_overrides has a DB-level FK back to it, and the
 *      audit trail should stay addressable). It disappears from the active
 *      Feature Flags list automatically; its history is preserved.
 *   4. If you re-add the same `key` later, the next sync un-deprecates it
 *      and metadata (label/description/severity/supportsOrgOverride) is
 *      refreshed from this file — but `isEnabled` picks up wherever it was
 *      last left in the database, not `defaultEnabled` again.
 */
export interface FeatureFlagRegistryEntry {
  /** Stable slug. Never change an existing key — it's the join key to
   *  FeatureFlagOrgOverride, Quizbuzz-new's platform_feature_flags/
   *  organization_feature_flag_overrides tables, and PlatformAuditLog
   *  history. Add a new key and deprecate the old one instead. */
  key: string;
  label: string;
  description: string;
  /** Only used the first time this key is seen — the starting value for a
   *  brand-new flag. Ignored on every later sync; the DB row's current
   *  isEnabled is never overwritten once it exists. */
  defaultEnabled: boolean;
  severity: FeatureFlagSeverity;
  supportsOrgOverride: boolean;
}

export const FEATURE_FLAG_REGISTRY: readonly FeatureFlagRegistryEntry[] = [
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'Activates maintenance window platform-wide. All live operations are suspended.',
    defaultEnabled: false,
    severity: FeatureFlagSeverity.CRITICAL,
    supportsOrgOverride: false,
  },
  {
    key: 'new_registrations_paused',
    label: 'Pause Registrations',
    description: 'Temporarily pause registration for new contest participants across the platform.',
    defaultEnabled: false,
    severity: FeatureFlagSeverity.WARNING,
    supportsOrgOverride: false,
  },
  {
    key: 'proctoring_enabled_platform_wide',
    label: 'Platform-wide AI Proctoring',
    description: 'Enables AI proctoring services across all qualified organization contests.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.STANDARD,
    supportsOrgOverride: true,
  },
  {
    key: 'certificate_auto_delivery',
    label: 'Certificate Auto-delivery',
    description: 'Automatically deliver signed PDF certificates to participants completing a contest.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.STANDARD,
    supportsOrgOverride: true,
  },
  {
    key: 'enhanced_analytics_pipeline',
    label: 'Enhanced Analytics Pipeline',
    description: 'Streams raw candidate responses to the high-concurrency analytical engine.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.STANDARD,
    supportsOrgOverride: true,
  },
  {
    key: 'razorpay_gateway_active',
    label: 'Razorpay Payment Gateway',
    description: 'Accept live candidate registration payments via Razorpay merchant portal.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.WARNING,
    supportsOrgOverride: true,
  },
] as const satisfies readonly FeatureFlagRegistryEntry[];

// Fails the build (not just a runtime surprise) if a copy-paste ever
// introduces two entries with the same key.
const duplicateKeys = FEATURE_FLAG_REGISTRY.map((f) => f.key).filter(
  (key, index, all) => all.indexOf(key) !== index
);
if (duplicateKeys.length > 0) {
  throw new Error(`FEATURE_FLAG_REGISTRY has duplicate key(s): ${duplicateKeys.join(', ')}`);
}
