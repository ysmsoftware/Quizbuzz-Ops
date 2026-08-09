import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseRequest } from '../../http/validation';
import { flagUpdateSchema, orgOverrideSetSchema, orgOverrideRemoveSchema } from './feature-flags.validator';
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
    const result = await this.service.setOrgOverride(key, orgId, input.isEnabled, input.reason, toActor(admin));
    return okResponse(result, 'Organization override set.');
  }

  async removeOrgOverride(req: Request, key: string, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, orgOverrideRemoveSchema);
    await this.service.removeOrgOverride(key, orgId, toActor(admin), input.reason);
    return okResponse(
      { flagKey: key, organizationId: orgId, removedAt: new Date().toISOString() },
      'Organization override removed. Organization now follows the global default.'
    );
  }
}
export default FeatureFlagsController;
