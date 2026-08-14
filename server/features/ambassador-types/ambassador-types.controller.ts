import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseRequest } from '../../http/validation';
import {
  ambassadorTypeCreateSchema,
  ambassadorTypeUpdateSchema,
  orgAccessSetSchema,
} from './ambassador-types.validator';
import { IAmbassadorTypesService, AmbassadorTypesService } from './ambassador-types.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { AuditActor } from '../../audit/audit-writer';

function toActor(admin: { id: string; email: string; name: string; role: string }): AuditActor {
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

export class AmbassadorTypesController {
  constructor(private service: IAmbassadorTypesService = new AmbassadorTypesService()) {}

  async listTypes() {
    await getSessionAdmin();
    const result = await this.service.listTypes();
    return okResponse(result, 'Ambassador types retrieved.');
  }

  async getType(key: string) {
    await getSessionAdmin();
    const result = await this.service.getTypeByKey(key);
    if (!result) {
      return errorResponse('Ambassador type not found', 'NOT_FOUND', null, 404);
    }
    return okResponse(result, 'Ambassador type details retrieved.');
  }

  async createType(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, ambassadorTypeCreateSchema);
    const result = await this.service.createType(input, toActor(admin));
    return okResponse(result, 'Ambassador type created.');
  }

  async updateType(req: Request, key: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, ambassadorTypeUpdateSchema);
    const result = await this.service.updateType(key, input, toActor(admin));
    return okResponse(result, 'Ambassador type updated.');
  }

  async listOrgAccess(key: string) {
    await getSessionAdmin();
    const result = await this.service.listOrgAccess(key);
    return okResponse(result, 'Organization access list retrieved.');
  }

  async setOrgAccess(req: Request, key: string, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, orgAccessSetSchema);
    const result = await this.service.setOrgAccess(key, orgId, input.isEnabled, toActor(admin));
    return okResponse(result, 'Organization access updated.');
  }
}
export default AmbassadorTypesController;
