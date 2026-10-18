import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseRequest } from '../../http/validation';
import { flagUpdateSchema, orgOverrideSetSchema, orgOverrideRemoveSchema, syncRepairSchema } from './feature-flags.validator';
import { IFeatureFlagsService, FeatureFlagsService } from './feature-flags.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { AuditActor } from '../../audit/audit-writer';

function toActor(admin: { id: string; email: string; name: string; role: string }): AuditActor {
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

export class FeatureFlagsController {
  constructor(private service: IFeatureFlagsService = new FeatureFlagsService()) {}

  async listFlags() {
    await getSessionAdmin();
    const result = await this.service.listFlags();
    return okResponse(result, 'Feature flags retrieved.');
  }

  async getFlag(key: string) {
    await getSessionAdmin();
    const result = await this.service.getFlagByKey(key);
    if (!result) {
      return errorResponse('Feature flag not found', 'NOT_FOUND', null, 404);
    }
    return okResponse(result, 'Feature flag details retrieved.');
  }

  async toggleFlag(req: Request, key: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, flagUpdateSchema);
    const result = await this.service.toggleFlag(key, input.isEnabled, toActor(admin));
    return okResponse(result, 'Feature flag updated.');
  }

  async listOrgOverrides(key: string) {
    await getSessionAdmin();
    const result = await this.service.listOrgOverrides(key);
    return okResponse(result, 'Organization overrides retrieved.');
  }

  async setOrgOverride(req: Request, key: string, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, orgOverrideSetSchema);
    const result = await this.service.setOrgOverride(
      key,
      orgId,
      input.isEnabled,
      input.reason,
      input.expiresAt ? new Date(input.expiresAt) : null,
      toActor(admin)
    );
    return okResponse(result, 'Organization override set.');
  }

  async removeOrgOverride(req: Request, key: string, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, orgOverrideRemoveSchema);
    const mirror = await this.service.removeOrgOverride(key, orgId, toActor(admin), input.reason);
    return okResponse(
      { flagKey: key, organizationId: orgId, removedAt: new Date().toISOString(), mirror },
      'Organization override removed. Organization now follows the global default.'
    );
  }

  /** Every per-org flag with this organization's effective state. */
  async getOrgFeatures(orgId: string) {
    await getSessionAdmin();
    return okResponse(await this.service.getOrgFeatureAccess(orgId), 'Organization feature access retrieved.');
  }

  /** Ops vs main-app comparison for one flag (read-only). */
  async getSync(key: string) {
    await getSessionAdmin();
    return okResponse(await this.service.getSyncReport(key), 'Flag sync report retrieved.');
  }

  /** Re-write the main app's copy of this flag from Ops. */
  async repairSync(req: Request, key: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, syncRepairSchema);
    return okResponse(await this.service.repairSync(key, toActor(admin), input.extras), 'Flag re-synced to the main app.');
  }
}
export default FeatureFlagsController;
