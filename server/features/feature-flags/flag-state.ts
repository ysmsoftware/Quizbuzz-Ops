import { FEATURE_FLAG_REGISTRY, FeatureFlagAccessModel } from './feature-flag-registry';

/**
 * Effective on/off for a feature flag, given its global switch and an optional per-org
 * override. This is a port of the main app's single source of truth
 * (Quizbuzz-new/backend/src/common/effective-flag-state.ts: computeEffectiveFlagState and
 * computeOptInFlagState). Keep the two in lockstep — the Features panel and
 * isFeatureEnabled() here must answer exactly what the main app will.
 */

export interface OrgOverrideInput {
  isEnabled: boolean;
  expiresAt: Date | null;
}

export type FlagStateReason =
  | 'kill_switch' // OPT_IN flag turned off globally: off for everyone, overrides ignored
  | 'override' // an active per-org override decided the value
  | 'not_granted' // OPT_IN flag, global on, but this org was never granted it
  | 'type_preset' // OPT_IN flag on by default for the org's type (no override set)
  | 'type_denied' // the org's type always turns this flag off in the main app
  | 'global'; // GLOBAL flag following the global switch

export interface EffectiveFlagState {
  value: boolean;
  reason: FlagStateReason;
}

export function isOverrideActive(override: OrgOverrideInput, now: Date = new Date()): boolean {
  return override.expiresAt === null || override.expiresAt > now;
}

export function computeEffectiveFlagState(
  accessModel: FeatureFlagAccessModel,
  globalValue: boolean,
  override: OrgOverrideInput | null,
  now: Date = new Date(),
  /** The org's type (main app only): 'preset' = on unless overridden, 'denied' = always off. */
  typeRule: 'preset' | 'denied' | null = null
): EffectiveFlagState {
  const active = override && isOverrideActive(override, now) ? override : null;

  if (typeRule === 'denied') return { value: false, reason: 'type_denied' };
  if (accessModel === 'OPT_IN') {
    if (!globalValue) return { value: false, reason: 'kill_switch' };
    if (active) return { value: active.isEnabled, reason: 'override' };
    return typeRule === 'preset' ? { value: true, reason: 'type_preset' } : { value: false, reason: 'not_granted' };
  }

  // GLOBAL: an active override wins outright (matches the main app's code, even though the
  // registry header comment describes it differently).
  return active ? { value: active.isEnabled, reason: 'override' } : { value: globalValue, reason: 'global' };
}

export function accessModelOf(flagKey: string): FeatureFlagAccessModel {
  return FEATURE_FLAG_REGISTRY.find((f) => f.key === flagKey)?.accessModel ?? 'GLOBAL';
}
