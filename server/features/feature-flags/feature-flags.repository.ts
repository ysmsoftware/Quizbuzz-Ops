import { prisma } from '../../db/ops-prisma';
import { queryMainDb } from '../../db/main-db-pool';
import { FeatureFlag, FeatureFlagOrgOverride } from '@prisma/client';

export interface IFeatureFlagsRepository {
  listFlags(): Promise<FeatureFlag[]>;
  getFlagByKey(key: string): Promise<FeatureFlag | null>;
  updateFlag(key: string, isEnabled: boolean, updatedById: string, updatedByName: string): Promise<FeatureFlag>;
  listActiveOrgOverrides(flagKey: string): Promise<FeatureFlagOrgOverride[]>;
  getActiveOrgOverride(flagKey: string, organizationId: string): Promise<FeatureFlagOrgOverride | null>;
  createOrgOverride(input: {
    id: string;
    flagKey: string;
    organizationId: string;
    isEnabled: boolean;
    reason: string;
    createdById: string;
    createdByName: string;
    expiresAt?: Date | null;
  }): Promise<FeatureFlagOrgOverride>;
  removeOrgOverride(id: string, removedById: string, removedReason?: string | null): Promise<FeatureFlagOrgOverride>;
  syncFlagToMainApp(key: string, isEnabled: boolean): Promise<void>;
  syncOrgOverrideToMainApp(key: string, organizationId: string, isEnabled: boolean, expiresAt?: Date | null): Promise<void>;
  syncOrgOverrideRemovalToMainApp(key: string, organizationId: string): Promise<void>;
  /** key → global value, as stored in the main app's DB (what its SDK reads). */
  getMainGlobalFlags(): Promise<Map<string, boolean>>;
  getMainOverrides(key: string): Promise<MainOverrideRow[]>;
  /** This org's live (not removed) overrides across all flags, in Ops. */
  listActiveOverridesForOrg(organizationId: string): Promise<FeatureFlagOrgOverride[]>;
  /** The same org's overrides as the main app holds them. */
  getMainOverridesForOrg(organizationId: string): Promise<Array<MainOverrideRow & { key: string }>>;
  /** flagKey → organizations with an active, enabled, non-expired override. */
  countGrantedByFlag(): Promise<Map<string, number>>;
}

export interface MainOverrideRow {
  organizationId: string;
  isEnabled: boolean;
  expiresAt: Date | null;
}

export class FeatureFlagsRepository implements IFeatureFlagsRepository {
  // Deprecated flags (removed from server/features/feature-flags/
  // feature-flag-registry.ts, per sync-feature-flags.ts) are excluded from
  // the default admin list — their rows and override history still exist,
  // just not surfaced as something an admin can currently manage.
  async listFlags() {
    return prisma.featureFlag.findMany({ where: { deprecatedAt: null }, orderBy: { key: 'asc' } });
  }

  async getFlagByKey(key: string) {
    return prisma.featureFlag.findUnique({ where: { key } });
  }

  async updateFlag(key: string, isEnabled: boolean, updatedById: string, updatedByName: string) {
    return prisma.featureFlag.update({
      where: { key },
      data: { isEnabled, updatedById, updatedByName },
    });
  }

  async listActiveOrgOverrides(flagKey: string) {
    return prisma.featureFlagOrgOverride.findMany({
      where: { flagKey, removedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getActiveOrgOverride(flagKey: string, organizationId: string) {
    return prisma.featureFlagOrgOverride.findFirst({
      where: { flagKey, organizationId, removedAt: null },
    });
  }

  async createOrgOverride(input: {
    id: string;
    flagKey: string;
    organizationId: string;
    isEnabled: boolean;
    reason: string;
    createdById: string;
    createdByName: string;
    expiresAt?: Date | null;
  }) {
    return prisma.featureFlagOrgOverride.create({ data: input });
  }

  async removeOrgOverride(id: string, removedById: string, removedReason?: string | null) {
    return prisma.featureFlagOrgOverride.update({
      where: { id },
      data: { removedAt: new Date(), removedById, removedReason: removedReason ?? null },
    });
  }

  // Write-through to Quizbuzz-new's own database, same queryMainDb
  // connection/pattern entitlements.repository.ts already uses. Ops's own
  // tables above remain the source of truth; these just mirror the current
  // value onto the tables Quizbuzz-new's isFeatureEnabled() SDK reads.
  async syncFlagToMainApp(key: string, isEnabled: boolean) {
    await queryMainDb(
      `
      INSERT INTO platform_feature_flags (key, "isEnabled", "updatedAt")
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET "isEnabled" = $2, "updatedAt" = NOW()
    `,
      [key, isEnabled]
    );
  }

  async syncOrgOverrideToMainApp(key: string, organizationId: string, isEnabled: boolean, expiresAt?: Date | null) {
    await queryMainDb(
      `
      INSERT INTO organization_feature_flag_overrides (key, "organizationId", "isEnabled", "expiresAt", "updatedAt")
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (key, "organizationId") DO UPDATE SET "isEnabled" = $3, "expiresAt" = $4, "updatedAt" = NOW()
    `,
      [key, organizationId, isEnabled, expiresAt ?? null]
    );
  }

  async getMainGlobalFlags() {
    const rows = await queryMainDb<{ key: string; isEnabled: boolean }>(`SELECT key, "isEnabled" FROM platform_feature_flags`);
    return new Map(rows.map((r) => [r.key, r.isEnabled]));
  }

  async getMainOverrides(key: string) {
    return queryMainDb<MainOverrideRow>(
      `SELECT "organizationId", "isEnabled", "expiresAt" FROM organization_feature_flag_overrides WHERE key = $1`,
      [key]
    );
  }

  async listActiveOverridesForOrg(organizationId: string) {
    return prisma.featureFlagOrgOverride.findMany({ where: { organizationId, removedAt: null } });
  }

  async getMainOverridesForOrg(organizationId: string) {
    return queryMainDb<MainOverrideRow & { key: string }>(
      `SELECT key, "organizationId", "isEnabled", "expiresAt" FROM organization_feature_flag_overrides WHERE "organizationId" = $1`,
      [organizationId]
    );
  }

  async countGrantedByFlag() {
    const now = new Date();
    const rows = await prisma.featureFlagOrgOverride.groupBy({
      by: ['flagKey'],
      where: { removedAt: null, isEnabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.flagKey, r._count._all]));
  }

  async syncOrgOverrideRemovalToMainApp(key: string, organizationId: string) {
    await queryMainDb(
      `DELETE FROM organization_feature_flag_overrides WHERE key = $1 AND "organizationId" = $2`,
      [key, organizationId]
    );
  }
}
export default FeatureFlagsRepository;
