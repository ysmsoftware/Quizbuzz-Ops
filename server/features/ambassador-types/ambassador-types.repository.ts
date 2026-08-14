import { prisma } from '../../db/ops-prisma';
import { queryMainDb } from '../../db/main-db-pool';
import { AmbassadorType, OrganizationAmbassadorTypeAccess, Prisma } from '@prisma/client';

export interface IAmbassadorTypesRepository {
  listTypes(): Promise<AmbassadorType[]>;
  getTypeByKey(key: string): Promise<AmbassadorType | null>;
  getTypeById(id: string): Promise<AmbassadorType | null>;
  createType(input: {
    id: string;
    key: string;
    label: string;
    description?: string | undefined;
    proofFieldLabel: string;
    applicationFields: Prisma.InputJsonValue;
    createdById: string;
    createdByName: string;
  }): Promise<AmbassadorType>;
  updateType(
    id: string,
    data: Partial<{
      label: string;
      description: string | null;
      proofFieldLabel: string;
      applicationFields: Prisma.InputJsonValue;
      isActive: boolean;
    }>
  ): Promise<AmbassadorType>;
  listOrgAccess(ambassadorTypeId: string): Promise<OrganizationAmbassadorTypeAccess[]>;
  getOrgAccess(ambassadorTypeId: string, organizationId: string): Promise<OrganizationAmbassadorTypeAccess | null>;
  upsertOrgAccess(input: {
    id: string;
    ambassadorTypeId: string;
    organizationId: string;
    isEnabled: boolean;
    updatedById: string;
    updatedByName: string;
  }): Promise<OrganizationAmbassadorTypeAccess>;
  syncTypeToMainApp(type: AmbassadorType): Promise<void>;
  syncOrgAccessToMainApp(typeKey: string, organizationId: string, isEnabled: boolean): Promise<void>;
}

export class AmbassadorTypesRepository implements IAmbassadorTypesRepository {
  async listTypes() {
    return prisma.ambassadorType.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async getTypeByKey(key: string) {
    return prisma.ambassadorType.findUnique({ where: { key } });
  }

  async getTypeById(id: string) {
    return prisma.ambassadorType.findUnique({ where: { id } });
  }

  async createType(input: {
    id: string;
    key: string;
    label: string;
    description?: string | undefined;
    proofFieldLabel: string;
    applicationFields: Prisma.InputJsonValue;
    createdById: string;
    createdByName: string;
  }) {
    return prisma.ambassadorType.create({
      data: {
        id: input.id,
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        proofFieldLabel: input.proofFieldLabel,
        applicationFields: input.applicationFields,
        createdById: input.createdById,
        createdByName: input.createdByName,
      },
    });
  }

  async updateType(
    id: string,
    data: Partial<{
      label: string;
      description: string | null;
      proofFieldLabel: string;
      applicationFields: Prisma.InputJsonValue;
      isActive: boolean;
    }>
  ) {
    return prisma.ambassadorType.update({ where: { id }, data });
  }

  async listOrgAccess(ambassadorTypeId: string) {
    return prisma.organizationAmbassadorTypeAccess.findMany({
      where: { ambassadorTypeId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getOrgAccess(ambassadorTypeId: string, organizationId: string) {
    return prisma.organizationAmbassadorTypeAccess.findUnique({
      where: { organizationId_ambassadorTypeId: { organizationId, ambassadorTypeId } },
    });
  }

  // Update-in-place (not soft-remove-and-replace like FeatureFlagOrgOverride) —
  // this toggle doesn't carry a required reason or expiry, so there's no
  // per-change history worth preserving as separate rows; @@unique([organizationId,
  // ambassadorTypeId]) makes this a genuine upsert, one row per (org, type) pair.
  async upsertOrgAccess(input: {
    id: string;
    ambassadorTypeId: string;
    organizationId: string;
    isEnabled: boolean;
    updatedById: string;
    updatedByName: string;
  }) {
    return prisma.organizationAmbassadorTypeAccess.upsert({
      where: {
        organizationId_ambassadorTypeId: {
          organizationId: input.organizationId,
          ambassadorTypeId: input.ambassadorTypeId,
        },
      },
      create: {
        id: input.id,
        organizationId: input.organizationId,
        ambassadorTypeId: input.ambassadorTypeId,
        isEnabled: input.isEnabled,
        updatedById: input.updatedById,
        updatedByName: input.updatedByName,
      },
      update: {
        isEnabled: input.isEnabled,
        updatedById: input.updatedById,
        updatedByName: input.updatedByName,
      },
    });
  }

  // Write-through to Quizbuzz-new's own database — same queryMainDb
  // connection/pattern feature-flags.repository.ts uses for platform_feature_flags.
  // Ops's own ambassador_types table remains the source of truth; this mirrors
  // the current row onto the minimal read-only copy the main app's
  // common/ambassador-types.ts SDK reads. Full type row on every sync (not a
  // diff) — simplest correct thing at this volume (a handful of types, ever).
  async syncTypeToMainApp(type: AmbassadorType) {
    await queryMainDb(
      `
      INSERT INTO platform_ambassador_types (key, label, "proofFieldLabel", "applicationFields", "isActive", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (key) DO UPDATE SET
        label = $2,
        "proofFieldLabel" = $3,
        "applicationFields" = $4,
        "isActive" = $5,
        "updatedAt" = NOW()
    `,
      [type.key, type.label, type.proofFieldLabel, JSON.stringify(type.applicationFields), type.isActive]
    );
  }

  async syncOrgAccessToMainApp(typeKey: string, organizationId: string, isEnabled: boolean) {
    await queryMainDb(
      `
      INSERT INTO organization_ambassador_type_access ("organizationId", "typeKey", "isEnabled", "updatedAt")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT ("organizationId", "typeKey") DO UPDATE SET "isEnabled" = $3, "updatedAt" = NOW()
    `,
      [organizationId, typeKey, isEnabled]
    );
  }
}
export default AmbassadorTypesRepository;
