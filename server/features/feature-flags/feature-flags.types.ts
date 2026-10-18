import { FeatureFlagSeverity } from '@prisma/client';
import type { FeatureFlagAccessModel } from './feature-flag-registry';

/** Did the write also reach the main app's database (which is what actually enforces flags)? */
export interface MirrorResult {
  ok: boolean;
  error?: string;
}

export type MirrorState = 'IN_SYNC' | 'OUT_OF_SYNC' | 'UNKNOWN';

export interface FeatureFlagDetail {
  id: string;
  key: string;
  label: string;
  description: string;
  /** The global switch. For OPT_IN flags it means "grantable" (and OFF = kill switch for every org). */
  isEnabled: boolean;
  severity: FeatureFlagSeverity;
  supportsOrgOverride: boolean;
  /** GLOBAL = on for everyone unless overridden; OPT_IN = off for every org until granted. */
  accessModel: FeatureFlagAccessModel;
  /** Flags that must also be on for this one to have any effect. */
  requires: string[];
  /** Flags that stop working if this one is turned off. */
  dependents: string[];
  /** Organizations that currently have this flag switched ON through an active (non-expired) override. */
  grantedOrgCount: number;
  /** Global value as the main app sees it, and whether it matches. */
  mirror: { state: MirrorState; mainValue: boolean | null };
  updatedAt: string;
  updatedByName: string;
}

export interface FeatureFlagOrgOverrideDetail {
  id: string;
  flagKey: string;
  organizationId: string;
  organizationName: string | null;
  isEnabled: boolean;
  reason: string;
  createdByName: string;
  expiresAt: string | null;
  /** Past its expiry: the main app ignores it, so the org is back to the default. */
  isExpired: boolean;
  /** Does the main app hold the same override? null = couldn't check. */
  mirrored: boolean | null;
  createdAt: string;
}

export interface ToggleFlagResult {
  flag: FeatureFlagDetail;
  mirror: MirrorResult;
  warnings: string[];
}

export interface SetOverrideResult {
  override: FeatureFlagOrgOverrideDetail;
  mirror: MirrorResult;
  warnings: string[];
}

export interface FlagSyncReport {
  key: string;
  inSync: boolean;
  global: { ops: boolean; main: boolean | null };
  /** Active in Ops, absent from the main app → the org does not actually have it. */
  missingInMain: string[];
  /** Present in both, but value or expiry differs. */
  mismatched: Array<{ organizationId: string; ops: { isEnabled: boolean; expiresAt: string | null }; main: { isEnabled: boolean; expiresAt: string | null } }>;
  /** In the main app but not an active override in Ops → leftover grant nobody can see in Ops. */
  extraInMain: string[];
}

/** One flag as it applies to ONE organization. */
export interface OrgFeatureAccess {
  key: string;
  label: string;
  description: string;
  accessModel: FeatureFlagAccessModel;
  requires: string[];
  globalEnabled: boolean;
  /** This organization's own override, if any (expired ones included, flagged). */
  override: {
    id: string;
    isEnabled: boolean;
    reason: string;
    createdByName: string;
    expiresAt: string | null;
    isExpired: boolean;
  } | null;
  /** What the main app (which enforces flags) will answer for this organization. */
  effective: { value: boolean; reason: 'kill_switch' | 'override' | 'not_granted' | 'global' };
  /** Prerequisite flags that are NOT effective for this org, so the feature still won't appear. */
  blockedBy: string[];
  /** Effective AND nothing blocking it: the org really has the feature. */
  usable: boolean;
  /** Ops and the main app agree on the answer. false = run Verify sync on the flag. */
  inSync: boolean | null;
}
