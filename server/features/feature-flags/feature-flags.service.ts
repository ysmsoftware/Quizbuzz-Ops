import { IFeatureFlagsRepository, FeatureFlagsRepository } from './feature-flags.repository';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType, FeatureFlag, FeatureFlagOrgOverride } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../http/errors';
import { generateUlid } from '../../utils/ulid';
import {
  FeatureFlagDetail,
  FeatureFlagOrgOverrideDetail,
  FlagSyncReport,
  MirrorResult,
  OrgFeatureAccess,
  SetOverrideResult,
  ToggleFlagResult,
} from './feature-flags.types';
import { dependentsOf, requiresOf } from './feature-flag-registry';
import { accessModelOf, computeEffectiveFlagState } from './flag-state';

type OrgNameLookup = (ids: string[]) => Promise<Record<string, string>>;

const sameInstant = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Await a write to the main app's DB and report — rather than hide — a failure. */
async function mirror(label: string, write: () => Promise<void>): Promise<MirrorResult> {
  try {
    await write();
    return { ok: true };
  } catch (err) {
    console.error(`Failed to mirror ${label} to the main app:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface IFeatureFlagsService {
  listFlags(): Promise<FeatureFlagDetail[]>;
  getFlagByKey(key: string): Promise<FeatureFlagDetail | null>;
  toggleFlag(key: string, isEnabled: boolean, admin: AuditActor): Promise<ToggleFlagResult>;
  listOrgOverrides(key: string): Promise<FeatureFlagOrgOverrideDetail[]>;
  setOrgOverride(
    key: string,
    organizationId: string,
    isEnabled: boolean,
    reason: string,
    expiresAt: Date | null,
    admin: AuditActor
  ): Promise<SetOverrideResult>;
  removeOrgOverride(key: string, organizationId: string, admin: AuditActor, reason?: string): Promise<MirrorResult>;
  getOrgFeatureAccess(organizationId: string): Promise<OrgFeatureAccess[]>;
  getSyncReport(key: string): Promise<FlagSyncReport>;
  repairSync(key: string, admin: AuditActor, extras?: 'keep' | 'adopt' | 'remove'): Promise<FlagSyncReport>;
}

export class FeatureFlagsService implements IFeatureFlagsService {
  constructor(
    private repo: IFeatureFlagsRepository = new FeatureFlagsRepository(),
    // Organizations live in the main DB; injected so this service stays unit-testable.
    private orgNames: OrgNameLookup = async () => ({})
  ) {}

  private toFlagDetail(
    flag: FeatureFlag,
    granted: Map<string, number>,
    mainGlobals: Map<string, boolean> | null
  ): FeatureFlagDetail {
    const mainValue = mainGlobals ? (mainGlobals.get(flag.key) ?? null) : null;
    return {
      id: flag.id,
      key: flag.key,
      label: flag.label,
      description: flag.description,
      isEnabled: flag.isEnabled,
      severity: flag.severity,
      supportsOrgOverride: flag.supportsOrgOverride,
      accessModel: accessModelOf(flag.key),
      requires: [...requiresOf(flag.key)],
      dependents: dependentsOf(flag.key),
      grantedOrgCount: granted.get(flag.key) ?? 0,
      mirror: {
        state: !mainGlobals ? 'UNKNOWN' : mainValue === flag.isEnabled ? 'IN_SYNC' : 'OUT_OF_SYNC',
        mainValue,
      },
      updatedAt: flag.updatedAt.toISOString(),
      updatedByName: flag.updatedByName,
    };
  }

  private async mainGlobalsOrNull() {
    try {
      return await this.repo.getMainGlobalFlags();
    } catch (err) {
      console.error('Could not read the main app flag table:', err);
      return null;
    }
  }

  async listFlags() {
    const [flags, granted, mainGlobals] = await Promise.all([
      this.repo.listFlags(),
      this.repo.countGrantedByFlag(),
      this.mainGlobalsOrNull(),
    ]);
    return flags.map((f) => this.toFlagDetail(f, granted, mainGlobals));
  }

  async getFlagByKey(key: string) {
    const flag = await this.repo.getFlagByKey(key);
    if (!flag) return null;
    const [granted, mainGlobals] = await Promise.all([this.repo.countGrantedByFlag(), this.mainGlobalsOrNull()]);
    return this.toFlagDetail(flag, granted, mainGlobals);
  }

  private async requireFlag(key: string) {
    const flag = await this.repo.getFlagByKey(key);
    if (!flag) throw new NotFoundError(`Feature flag '${key}' not found`);
    return flag;
  }

  private async labelOf(key: string) {
    return (await this.repo.getFlagByKey(key))?.label ?? key;
  }

  // RBAC is a single, statically-known permission checked in the controller
  // via requireRole([SUPER_ADMIN]) before this method is ever called — no
  // per-row role check here.
  async toggleFlag(key: string, isEnabled: boolean, admin: AuditActor): Promise<ToggleFlagResult> {
    const flag = await this.requireFlag(key);
    if (flag.deprecatedAt) {
      throw new AppError(
        `Flag '${key}' was removed from the feature-flag registry and can no longer be toggled`,
        'FLAG_DEPRECATED',
        400
      );
    }
    const oldValue = flag.isEnabled;
    const warnings: string[] = [];

    if (!isEnabled) {
      for (const dep of dependentsOf(key)) {
        warnings.push(`"${await this.labelOf(dep)}" needs "${flag.label}", so it stops working for every organization too.`);
      }
    } else {
      for (const req of requiresOf(key)) {
        const reqFlag = await this.repo.getFlagByKey(req);
        if (reqFlag && !reqFlag.isEnabled) {
          warnings.push(`"${flag.label}" also needs "${reqFlag.label}", which is currently off globally.`);
        }
      }
    }

    const updated = await this.repo.updateFlag(key, isEnabled, admin.id!, admin.name);

    await writeAuditLogEntry(
      admin,
      'feature_flag.toggled',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { from: oldValue, to: isEnabled }
    );

    const mirrorResult = await mirror(`flag '${key}'`, () => this.repo.syncFlagToMainApp(key, isEnabled));

    return { flag: (await this.getFlagByKey(key)) ?? this.toFlagDetail(updated, new Map(), null), mirror: mirrorResult, warnings };
  }

  async listOrgOverrides(key: string) {
    const flag = await this.requireFlag(key);
    if (!flag.supportsOrgOverride) {
      throw new AppError(`Flag '${key}' does not support org overrides`, 'ORG_OVERRIDE_NOT_SUPPORTED', 400);
    }
    const overrides = await this.repo.listActiveOrgOverrides(key);
    const names = await this.orgNames(overrides.map((o) => o.organizationId)).catch(() => ({} as Record<string, string>));

    let mainByOrg: Map<string, { isEnabled: boolean; expiresAt: Date | null }> | null = null;
    try {
      mainByOrg = new Map((await this.repo.getMainOverrides(key)).map((r) => [r.organizationId, r]));
    } catch (err) {
      console.error(`Could not read main-app overrides for '${key}':`, err);
    }

    const now = new Date();
    return overrides.map((o) => {
      const main = mainByOrg?.get(o.organizationId);
      return {
        id: o.id,
        flagKey: o.flagKey,
        organizationId: o.organizationId,
        organizationName: names[o.organizationId] ?? null,
        isEnabled: o.isEnabled,
        reason: o.reason,
        createdByName: o.createdByName,
        expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
        isExpired: !!o.expiresAt && o.expiresAt <= now,
        mirrored: mainByOrg ? !!main && main.isEnabled === o.isEnabled && sameInstant(main.expiresAt, o.expiresAt) : null,
        createdAt: o.createdAt.toISOString(),
      } satisfies FeatureFlagOrgOverrideDetail;
    });
  }

  /**
   * Warnings for a grant that would not actually give the org the feature: the global switch is
   * off (kill switch), or a flag it depends on isn't on for this org.
   */
  private async grantWarnings(key: string, flag: FeatureFlag, organizationId: string, isEnabled: boolean): Promise<string[]> {
    if (!isEnabled) return [];
    const warnings: string[] = [];
    if (accessModelOf(key) === 'OPT_IN' && !flag.isEnabled) {
      warnings.push(`"${flag.label}" is switched off globally (kill switch), so this grant has no effect until the global switch is turned on.`);
    }
    for (const req of requiresOf(key)) {
      const reqFlag = await this.repo.getFlagByKey(req);
      if (!reqFlag) continue;
      const reqOverride = await this.repo.getActiveOrgOverride(req, organizationId);
      const state = computeEffectiveFlagState(accessModelOf(req), reqFlag.isEnabled, reqOverride, new Date());
      if (!state.value) {
        warnings.push(`"${flag.label}" also needs "${reqFlag.label}", which this organization doesn't have yet — it won't appear until you grant that too.`);
      }
    }
    return warnings;
  }

  // "Set" = replace: soft-remove any existing active override for this
  // (key, orgId) pair, then create a fresh row, so a changed decision is
  // always a new row, never a mutated one.
  async setOrgOverride(
    key: string,
    organizationId: string,
    isEnabled: boolean,
    reason: string,
    expiresAt: Date | null,
    admin: AuditActor
  ): Promise<SetOverrideResult> {
    const flag = await this.requireFlag(key);
    if (flag.deprecatedAt) {
      throw new AppError(
        `Flag '${key}' was removed from the feature-flag registry and can no longer take new overrides`,
        'FLAG_DEPRECATED',
        400
      );
    }
    if (!flag.supportsOrgOverride) {
      throw new AppError(`Flag '${key}' does not support org overrides`, 'ORG_OVERRIDE_NOT_SUPPORTED', 400);
    }
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new ValidationError({ expiresAt: { _errors: ['The expiry date must be in the future'] } });
    }

    const existing = await this.repo.getActiveOrgOverride(key, organizationId);
    if (existing) {
      await this.repo.removeOrgOverride(existing.id, admin.id!, 'Replaced by new override');
    }

    const created = await this.repo.createOrgOverride({
      id: generateUlid(),
      flagKey: key,
      organizationId,
      isEnabled,
      reason,
      createdById: admin.id!,
      createdByName: admin.name,
      expiresAt,
    });

    await writeAuditLogEntry(
      admin,
      'feature_flag.org_override.set',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { organizationId, isEnabled, reason, expiresAt: expiresAt?.toISOString() ?? null, previousOverrideId: existing?.id ?? null }
    );

    const mirrorResult = await mirror(`override '${key}'/'${organizationId}'`, () =>
      this.repo.syncOrgOverrideToMainApp(key, organizationId, isEnabled, created.expiresAt)
    );
    const warnings = await this.grantWarnings(key, flag, organizationId, isEnabled);
    const names = await this.orgNames([organizationId]).catch(() => ({} as Record<string, string>));

    return {
      override: {
        id: created.id,
        flagKey: created.flagKey,
        organizationId: created.organizationId,
        organizationName: names[organizationId] ?? null,
        isEnabled: created.isEnabled,
        reason: created.reason,
        createdByName: created.createdByName,
        expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
        isExpired: false,
        mirrored: mirrorResult.ok,
        createdAt: created.createdAt.toISOString(),
      },
      mirror: mirrorResult,
      warnings,
    };
  }

  async removeOrgOverride(key: string, organizationId: string, admin: AuditActor, reason?: string): Promise<MirrorResult> {
    const flag = await this.requireFlag(key);

    const existing = await this.repo.getActiveOrgOverride(key, organizationId);
    if (!existing) throw new NotFoundError(`No active override for '${key}' on org '${organizationId}'`);

    await this.repo.removeOrgOverride(existing.id, admin.id!, reason);

    await writeAuditLogEntry(
      admin,
      'feature_flag.org_override.removed',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { organizationId, removedOverrideId: existing.id, reason: reason ?? null }
    );

    return mirror(`override removal '${key}'/'${organizationId}'`, () =>
      this.repo.syncOrgOverrideRemovalToMainApp(key, organizationId)
    );
  }

  /**
   * "What does THIS organization have?" — every flag that can be set per org, with the answer the main
   * app will give, why, and whether a missing prerequisite keeps it from showing up.
   * The answer comes from the main app's tables (what is enforced); Ops' own view is compared to flag drift.
   */
  async getOrgFeatureAccess(organizationId: string): Promise<OrgFeatureAccess[]> {
    const [flags, opsOverrides] = await Promise.all([this.repo.listFlags(), this.repo.listActiveOverridesForOrg(organizationId)]);
    const opsByKey = new Map(opsOverrides.map((o) => [o.flagKey, o]));

    let mainGlobals: Map<string, boolean> | null = null;
    let mainByKey: Map<string, { isEnabled: boolean; expiresAt: Date | null }> | null = null;
    try {
      const [g, rows] = await Promise.all([this.repo.getMainGlobalFlags(), this.repo.getMainOverridesForOrg(organizationId)]);
      mainGlobals = g;
      mainByKey = new Map(rows.map((r) => [r.key, r]));
    } catch (err) {
      console.error('Could not read the main app flag tables for org features:', err);
    }

    const now = new Date();
    const stateOf = (flag: FeatureFlag, source: 'main' | 'ops') => {
      const override = source === 'main' ? (mainByKey?.get(flag.key) ?? null) : (opsByKey.get(flag.key) ?? null);
      const global = source === 'main' ? (mainGlobals?.get(flag.key) ?? false) : flag.isEnabled;
      return computeEffectiveFlagState(accessModelOf(flag.key), global, override, now);
    };

    const settable = flags.filter((f) => f.supportsOrgOverride);
    // Authoritative answer per flag: the main app's when readable, else Ops'.
    const effective = new Map(settable.map((f) => [f.key, stateOf(f, mainGlobals ? 'main' : 'ops')]));

    return settable.map((flag) => {
      const state = effective.get(flag.key)!;
      const ops = opsByKey.get(flag.key) ?? null;
      const blockedBy = requiresOf(flag.key).filter((req) => !(effective.get(req)?.value ?? false));
      return {
        key: flag.key,
        label: flag.label,
        description: flag.description,
        accessModel: accessModelOf(flag.key),
        requires: [...requiresOf(flag.key)],
        globalEnabled: mainGlobals ? (mainGlobals.get(flag.key) ?? false) : flag.isEnabled,
        override: ops
          ? {
              id: ops.id,
              isEnabled: ops.isEnabled,
              reason: ops.reason,
              createdByName: ops.createdByName,
              expiresAt: ops.expiresAt ? ops.expiresAt.toISOString() : null,
              isExpired: !!ops.expiresAt && ops.expiresAt <= now,
            }
          : null,
        effective: state,
        blockedBy,
        usable: state.value && blockedBy.length === 0,
        inSync: mainGlobals ? stateOf(flag, 'ops').value === state.value : null,
      } satisfies OrgFeatureAccess;
    });
  }

  /** Compare what Ops believes with what the main app (which enforces flags) actually holds. */
  async getSyncReport(key: string): Promise<FlagSyncReport> {
    const flag = await this.requireFlag(key);
    const [opsOverrides, mainGlobals, mainOverrides] = await Promise.all([
      flag.supportsOrgOverride ? this.repo.listActiveOrgOverrides(key) : Promise.resolve([] as FeatureFlagOrgOverride[]),
      this.repo.getMainGlobalFlags(),
      flag.supportsOrgOverride ? this.repo.getMainOverrides(key) : Promise.resolve([]),
    ]);

    const now = new Date();
    // An expired override is intentionally inert; it neither needs to exist in main nor counts as "extra" there.
    const opsActive = opsOverrides.filter((o) => !o.expiresAt || o.expiresAt > now);
    const mainByOrg = new Map(mainOverrides.map((r) => [r.organizationId, r]));
    const opsOrgs = new Set(opsActive.map((o) => o.organizationId));

    const missingInMain: string[] = [];
    const mismatched: FlagSyncReport['mismatched'] = [];
    for (const o of opsActive) {
      const m = mainByOrg.get(o.organizationId);
      if (!m) missingInMain.push(o.organizationId);
      else if (m.isEnabled !== o.isEnabled || !sameInstant(m.expiresAt, o.expiresAt)) {
        mismatched.push({
          organizationId: o.organizationId,
          ops: { isEnabled: o.isEnabled, expiresAt: o.expiresAt?.toISOString() ?? null },
          main: { isEnabled: m.isEnabled, expiresAt: m.expiresAt?.toISOString() ?? null },
        });
      }
    }
    const extraInMain = mainOverrides.filter((m) => !opsOrgs.has(m.organizationId)).map((m) => m.organizationId);

    const mainValue = mainGlobals.get(key) ?? null;
    return {
      key,
      inSync: mainValue === flag.isEnabled && missingInMain.length === 0 && mismatched.length === 0 && extraInMain.length === 0,
      global: { ops: flag.isEnabled, main: mainValue },
      missingInMain,
      mismatched,
      extraInMain,
    };
  }

  /**
   * Make the main app match Ops (Ops is the source of truth): re-write the global value and every
   * active override. Grants that exist ONLY in the main app are left alone unless asked
   * (`adopt` copies them into Ops so they become visible/manageable; `remove` deletes them).
   */
  async repairSync(key: string, admin: AuditActor, extras: 'keep' | 'adopt' | 'remove' = 'keep'): Promise<FlagSyncReport> {
    const flag = await this.requireFlag(key);
    const before = await this.getSyncReport(key);
    if (before.inSync) return before;

    await this.repo.syncFlagToMainApp(key, flag.isEnabled);
    const now = new Date();
    for (const o of await this.repo.listActiveOrgOverrides(key)) {
      if (o.expiresAt && o.expiresAt <= now) continue;
      await this.repo.syncOrgOverrideToMainApp(key, o.organizationId, o.isEnabled, o.expiresAt);
    }

    if (extras === 'remove') {
      for (const orgId of before.extraInMain) await this.repo.syncOrgOverrideRemovalToMainApp(key, orgId);
    } else if (extras === 'adopt' && before.extraInMain.length > 0) {
      const mainRows = new Map((await this.repo.getMainOverrides(key)).map((r) => [r.organizationId, r]));
      for (const orgId of before.extraInMain) {
        const row = mainRows.get(orgId);
        if (!row) continue;
        await this.repo.createOrgOverride({
          id: generateUlid(),
          flagKey: key,
          organizationId: orgId,
          isEnabled: row.isEnabled,
          reason: 'Adopted from the main app during a sync repair',
          createdById: admin.id!,
          createdByName: admin.name,
          expiresAt: row.expiresAt,
        });
      }
    }

    await writeAuditLogEntry(admin, 'feature_flag.sync_repaired', AuditTargetType.FEATURE_FLAG, key, flag.label, {
      globalWas: before.global.main,
      rewroteOverrides: before.missingInMain.length + before.mismatched.length,
      leftoverGrants: { count: before.extraInMain.length, handling: extras },
    });

    return this.getSyncReport(key);
  }
}
export default FeatureFlagsService;
