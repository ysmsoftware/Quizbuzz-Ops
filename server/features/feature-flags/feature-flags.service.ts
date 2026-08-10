import { IFeatureFlagsRepository, FeatureFlagsRepository } from './feature-flags.repository';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType, FeatureFlag, FeatureFlagOrgOverride } from '@prisma/client';
import { AppError, NotFoundError } from '../../http/errors';
import { generateUlid } from '../../utils/ulid';
import { FeatureFlagDetail, FeatureFlagOrgOverrideDetail } from './feature-flags.types';

function toFlagDetail(flag: FeatureFlag): FeatureFlagDetail {
  return {
    id: flag.id,
    key: flag.key,
    label: flag.label,
    description: flag.description,
    isEnabled: flag.isEnabled,
    severity: flag.severity,
    supportsOrgOverride: flag.supportsOrgOverride,
    updatedAt: flag.updatedAt.toISOString(),
    updatedByName: flag.updatedByName,
  };
}

function toOverrideDetail(override: FeatureFlagOrgOverride): FeatureFlagOrgOverrideDetail {
  return {
    id: override.id,
    flagKey: override.flagKey,
    organizationId: override.organizationId,
    isEnabled: override.isEnabled,
    reason: override.reason,
    createdByName: override.createdByName,
    expiresAt: override.expiresAt ? override.expiresAt.toISOString() : null,
    createdAt: override.createdAt.toISOString(),
  };
}

export interface IFeatureFlagsService {
  listFlags(): Promise<FeatureFlagDetail[]>;
  getFlagByKey(key: string): Promise<FeatureFlagDetail | null>;
  toggleFlag(key: string, isEnabled: boolean, admin: AuditActor): Promise<FeatureFlagDetail>;
  listOrgOverrides(key: string): Promise<FeatureFlagOrgOverrideDetail[]>;
  setOrgOverride(
    key: string,
    organizationId: string,
    isEnabled: boolean,
    reason: string,
    admin: AuditActor
  ): Promise<FeatureFlagOrgOverrideDetail>;
  removeOrgOverride(key: string, organizationId: string, admin: AuditActor, reason?: string): Promise<void>;
}

export class FeatureFlagsService implements IFeatureFlagsService {
  constructor(private repo: IFeatureFlagsRepository = new FeatureFlagsRepository()) {}

  async listFlags() {
    const flags = await this.repo.listFlags();
    return flags.map(toFlagDetail);
  }

  async getFlagByKey(key: string) {
    const flag = await this.repo.getFlagByKey(key);
    return flag ? toFlagDetail(flag) : null;
  }

  private async requireFlag(key: string) {
    const flag = await this.repo.getFlagByKey(key);
    if (!flag) throw new NotFoundError(`Feature flag '${key}' not found`);
    return flag;
  }

  // RBAC is a single, statically-known permission checked in the controller
  // via requireRole([SUPER_ADMIN]) before this method is ever called — no
  // per-row role check here.
  async toggleFlag(key: string, isEnabled: boolean, admin: AuditActor) {
    const flag = await this.requireFlag(key);
    if (flag.deprecatedAt) {
      throw new AppError(
        `Flag '${key}' was removed from the feature-flag registry and can no longer be toggled`,
        'FLAG_DEPRECATED',
        400
      );
    }
    const oldValue = flag.isEnabled;

    const updated = await this.repo.updateFlag(key, isEnabled, admin.id!, admin.name);

    await writeAuditLogEntry(
      admin,
      'feature_flag.toggled',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { from: oldValue, to: isEnabled }
    );

    // Best-effort, fire-and-forget — a main-app sync failure must not fail
    // the toggle itself (same pattern audit-writer.ts uses).
    this.repo.syncFlagToMainApp(key, isEnabled).catch((err) =>
      console.error(`Failed to sync flag '${key}' to main app:`, err)
    );

    return toFlagDetail(updated);
  }

  async listOrgOverrides(key: string) {
    const flag = await this.requireFlag(key);
    if (!flag.supportsOrgOverride) {
      throw new AppError(`Flag '${key}' does not support org overrides`, 'ORG_OVERRIDE_NOT_SUPPORTED', 400);
    }
    const overrides = await this.repo.listActiveOrgOverrides(key);
    return overrides.map(toOverrideDetail);
  }

  // "Set" = replace: soft-remove any existing active override for this
  // (key, orgId) pair, then create a fresh row, so a changed decision is
  // always a new row, never a mutated one.
  async setOrgOverride(key: string, organizationId: string, isEnabled: boolean, reason: string, admin: AuditActor) {
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
    });

    await writeAuditLogEntry(
      admin,
      'feature_flag.org_override.set',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { organizationId, isEnabled, reason, previousOverrideId: existing?.id ?? null }
    );

    this.repo.syncOrgOverrideToMainApp(key, organizationId, isEnabled, created.expiresAt).catch((err) =>
      console.error(`Failed to sync org override '${key}'/'${organizationId}' to main app:`, err)
    );

    return toOverrideDetail(created);
  }

  async removeOrgOverride(key: string, organizationId: string, admin: AuditActor, reason?: string) {
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

    this.repo.syncOrgOverrideRemovalToMainApp(key, organizationId).catch((err) =>
      console.error(`Failed to sync org override removal '${key}'/'${organizationId}' to main app:`, err)
    );
  }
}
export default FeatureFlagsService;
