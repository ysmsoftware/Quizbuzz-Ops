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
 *   2. Pick `accessModel` correctly — this is the part that's easy to get
 *      wrong (see the doc comment on `AccessModel` below and
 *      Quizbuzz-new/backend/DECISIONS.md's "Feature flags: two access
 *      models, not one" section for the incident this taxonomy was born
 *      from — ambassador_program_enabled leaked to every organization for
 *      days because it was wired as GLOBAL when it needed to be OPT_IN).
 *   3. If `accessModel: 'OPT_IN'`, you MUST also add the key to
 *      OPT_IN_ONLY_FLAGS in Quizbuzz-new/backend/src/common/feature-flags.ts.
 *      This file cannot enforce that for you — it lives in a different repo/
 *      deployment, and `isFeatureEnabled()` (the function that actually
 *      computes the effective on/off value) lives entirely on that side. This
 *      registry only tracks metadata and the DB row; ops-next never itself
 *      decides whether a given organization has the feature.
 *   4. Add real enforcement call site(s) for it in this repo and/or
 *      Quizbuzz-new using isFeatureEnabled(key) / isFeatureEnabled(key, {
 *      organizationId }) — see server/features/feature-flags/is-feature-enabled.ts.
 *   5. Ship the deploy. syncFeatureFlagRegistry() (sync-feature-flags.ts)
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
/**
 * The two ways a flag's global toggle and its per-org overrides combine into
 * one effective on/off value for a given organization. Every flag is exactly
 * one of these — there is no third option, and picking the wrong one is a
 * real, previously-shipped bug (see the HOW TO ADD A NEW FLAG note above).
 *
 * GLOBAL  — "on for everyone unless this one org is an exception."
 *   global=true  + no override        -> ON  (the common case)
 *   global=true  + override=false     -> OFF for that one org
 *   global=false + anything           -> OFF (global is the default here too)
 *   Use for infrastructure/vendor-integration flags where the sane default
 *   is "just work" — Razorpay, proctoring, certificate delivery, analytics.
 *   An org override exists only to carve out an exception.
 *
 * OPT_IN  — "off for everyone unless this one org has been explicitly
 *   granted access; the global toggle is a pure availability gate / kill
 *   switch, never a default."
 *   global=false + anything           -> OFF, unconditionally (kill switch
 *                                         always wins, even over an active
 *                                         override — "turn this off for the
 *                                         whole platform" must never be
 *                                         silently bypassed by a stale grant)
 *   global=true  + no override        -> OFF (no silent inherit — this is
 *                                         exactly the case that leaked
 *                                         ambassador_program_enabled to every
 *                                         org before this model existed)
 *   global=true  + override=true      -> ON  for that one org
 *   Use for features being rolled out to specific customers/pilots rather
 *   than the whole platform — e.g. ambassador_program_enabled.
 *
 * Enforced in Quizbuzz-new/backend/src/common/effective-flag-state.ts as
 * computeEffectiveFlagState (GLOBAL) and computeOptInFlagState (OPT_IN) —
 * isFeatureEnabled() there picks the right one per key via OPT_IN_ONLY_FLAGS.
 * This registry's `accessModel` is documentation of that decision, not the
 * enforcement itself (see step 3 above).
 */
export type FeatureFlagAccessModel = 'GLOBAL' | 'OPT_IN';

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
  /** See FeatureFlagAccessModel above. Purely documentation/display here —
   *  the real enforcement lives in Quizbuzz-new/backend's OPT_IN_ONLY_FLAGS. */
  accessModel: FeatureFlagAccessModel;
}

export const FEATURE_FLAG_REGISTRY: readonly FeatureFlagRegistryEntry[] = [
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'Activates maintenance window platform-wide. All live operations are suspended.',
    defaultEnabled: false,
    severity: FeatureFlagSeverity.CRITICAL,
    supportsOrgOverride: false,
    accessModel: 'GLOBAL', // no org override possible either way — platform-wide only
  },
  {
    key: 'new_registrations_paused',
    label: 'Pause Registrations',
    description: 'Temporarily pause registration for new contest participants across the platform.',
    defaultEnabled: false,
    severity: FeatureFlagSeverity.WARNING,
    supportsOrgOverride: false,
    accessModel: 'GLOBAL', // same — platform-wide only, no per-org variation
  },
  {
    key: 'proctoring_enabled_platform_wide',
    label: 'Platform-wide AI Proctoring',
    description: 'Enables AI proctoring services across all qualified organization contests.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.STANDARD,
    supportsOrgOverride: true,
    accessModel: 'GLOBAL', // on for everyone; override carves out an exception
  },
  {
    key: 'certificate_auto_delivery',
    label: 'Certificate Auto-delivery',
    description: 'Automatically deliver signed PDF certificates to participants completing a contest.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.STANDARD,
    supportsOrgOverride: true,
    accessModel: 'GLOBAL',
  },
  {
    key: 'enhanced_analytics_pipeline',
    label: 'Enhanced Analytics Pipeline',
    description: 'Streams raw candidate responses to the high-concurrency analytical engine.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.STANDARD,
    supportsOrgOverride: true,
    accessModel: 'GLOBAL',
  },
  {
    key: 'razorpay_gateway_active',
    label: 'Razorpay Payment Gateway',
    description: 'Accept live candidate registration payments via Razorpay merchant portal.',
    defaultEnabled: true,
    severity: FeatureFlagSeverity.WARNING,
    supportsOrgOverride: true,
    accessModel: 'GLOBAL',
  },
  {
    key: 'ambassador_program_enabled',
    label: 'Ambassador Program',
    description:
      'Enables the campus ambassador / incentive program for an organization — applications, campaigns, and the ambassador dashboard in the main app.',
    defaultEnabled: false,
    severity: FeatureFlagSeverity.STANDARD,
    supportsOrgOverride: true,
    // Rolled out per-org, not platform-wide — off by default, on only for
    // orgs with an explicit override. Mirrored in OPT_IN_ONLY_FLAGS on the
    // main-app side; see the AccessModel doc comment above.
    accessModel: 'OPT_IN',
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
