import { IAmbassadorTypesRepository, AmbassadorTypesRepository } from './ambassador-types.repository';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType, AmbassadorType, OrganizationAmbassadorTypeAccess, Prisma } from '@prisma/client';
import { AppError, NotFoundError } from '../../http/errors';
import { generateUlid } from '../../utils/ulid';
import {
  AmbassadorTypeDetail,
  OrganizationAmbassadorTypeAccessDetail,
  ApplicationFieldDef,
} from './ambassador-types.types';
import { AmbassadorTypeCreateInput, AmbassadorTypeUpdateInput } from './ambassador-types.validator';

function toTypeDetail(type: AmbassadorType): AmbassadorTypeDetail {
  return {
    id: type.id,
    key: type.key,
    label: type.label,
    description: type.description,
    proofFieldLabel: type.proofFieldLabel,
    applicationFields: type.applicationFields as unknown as ApplicationFieldDef[],
    isActive: type.isActive,
    createdByName: type.createdByName,
    createdAt: type.createdAt.toISOString(),
    updatedAt: type.updatedAt.toISOString(),
  };
}

function toOrgAccessDetail(access: OrganizationAmbassadorTypeAccess): OrganizationAmbassadorTypeAccessDetail {
  return {
    id: access.id,
    organizationId: access.organizationId,
    ambassadorTypeId: access.ambassadorTypeId,
    isEnabled: access.isEnabled,
    updatedByName: access.updatedByName,
    updatedAt: access.updatedAt.toISOString(),
  };
}

export interface IAmbassadorTypesService {
  listTypes(): Promise<AmbassadorTypeDetail[]>;
  getTypeByKey(key: string): Promise<AmbassadorTypeDetail | null>;
  createType(input: AmbassadorTypeCreateInput, admin: AuditActor): Promise<AmbassadorTypeDetail>;
  updateType(key: string, input: AmbassadorTypeUpdateInput, admin: AuditActor): Promise<AmbassadorTypeDetail>;
  listOrgAccess(key: string): Promise<OrganizationAmbassadorTypeAccessDetail[]>;
  setOrgAccess(
    key: string,
    organizationId: string,
    isEnabled: boolean,
    admin: AuditActor
  ): Promise<OrganizationAmbassadorTypeAccessDetail>;
}

export class AmbassadorTypesService implements IAmbassadorTypesService {
  constructor(private repo: IAmbassadorTypesRepository = new AmbassadorTypesRepository()) {}

  async listTypes() {
    const types = await this.repo.listTypes();
    return types.map(toTypeDetail);
  }

  async getTypeByKey(key: string) {
    const type = await this.repo.getTypeByKey(key);
    return type ? toTypeDetail(type) : null;
  }

  private async requireTypeByKey(key: string) {
    const type = await this.repo.getTypeByKey(key);
    if (!type) throw new NotFoundError(`Ambassador type '${key}' not found`);
    return type;
  }

  // Runtime-creatable, unlike FeatureFlag — this is the entire point of
  // keeping the type catalog out of the code registry. Both what the type is
  // called AND what its application form asks for are set here, in one call,
  // never via a seed script (ambassador-incentive-program-plan.md §0.3).
  async createType(input: AmbassadorTypeCreateInput, admin: AuditActor) {
    const existing = await this.repo.getTypeByKey(input.key);
    if (existing) {
      throw new AppError(`An ambassador type with key '${input.key}' already exists`, 'DUPLICATE_KEY', 409);
    }

    const created = await this.repo.createType({
      id: generateUlid(),
      key: input.key,
      label: input.label,
      description: input.description,
      proofFieldLabel: input.proofFieldLabel,
      applicationFields: input.applicationFields as unknown as Prisma.InputJsonValue,
      createdById: admin.id!,
      createdByName: admin.name,
    });

    await writeAuditLogEntry(admin, 'ambassador_type.created', AuditTargetType.AMBASSADOR_TYPE, created.key, created.label, {
      applicationFieldCount: input.applicationFields.length,
    });

    this.repo.syncTypeToMainApp(created).catch((err) =>
      console.error(`Failed to sync ambassador type '${created.key}' to main app:`, err)
    );

    return toTypeDetail(created);
  }

  async updateType(key: string, input: AmbassadorTypeUpdateInput, admin: AuditActor) {
    const existing = await this.requireTypeByKey(key);

    const updated = await this.repo.updateType(existing.id, {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.proofFieldLabel !== undefined && { proofFieldLabel: input.proofFieldLabel }),
      ...(input.applicationFields !== undefined && {
        applicationFields: input.applicationFields as unknown as Prisma.InputJsonValue,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    await writeAuditLogEntry(admin, 'ambassador_type.updated', AuditTargetType.AMBASSADOR_TYPE, updated.key, updated.label, {
      changes: input,
    });

    this.repo.syncTypeToMainApp(updated).catch((err) =>
      console.error(`Failed to sync ambassador type '${updated.key}' to main app:`, err)
    );

    return toTypeDetail(updated);
  }

  async listOrgAccess(key: string) {
    const type = await this.requireTypeByKey(key);
    const rows = await this.repo.listOrgAccess(type.id);
    return rows.map(toOrgAccessDetail);
  }

  // Update-in-place (see repository note) — no "reason" required, this is a
  // lower-stakes toggle than a feature flag override, per the plan doc.
  async setOrgAccess(key: string, organizationId: string, isEnabled: boolean, admin: AuditActor) {
    const type = await this.requireTypeByKey(key);

    const access = await this.repo.upsertOrgAccess({
      id: generateUlid(),
      ambassadorTypeId: type.id,
      organizationId,
      isEnabled,
      updatedById: admin.id!,
      updatedByName: admin.name,
    });

    await writeAuditLogEntry(
      admin,
      'ambassador_type.org_access.set',
      AuditTargetType.AMBASSADOR_TYPE,
      type.key,
      type.label,
      { organizationId, isEnabled }
    );

    this.repo.syncOrgAccessToMainApp(type.key, organizationId, isEnabled).catch((err) =>
      console.error(`Failed to sync ambassador type org access '${type.key}'/'${organizationId}' to main app:`, err)
    );

    return toOrgAccessDetail(access);
  }
}
export default AmbassadorTypesService;
