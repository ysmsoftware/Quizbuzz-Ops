import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseQueryParams, parseRequest } from '../../http/validation';
import { orgListQuerySchema, createNoteSchema, suspendOrgSchema, reactivateOrgSchema } from './organizations.validator';
import { IOrganizationsService, OrganizationsService } from './organizations.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';

export class OrganizationsController {
  constructor(private service: IOrganizationsService = new OrganizationsService()) {}

  async getOrganizationsList(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, orgListQuerySchema);
    const result = await this.service.getOrganizationsList(query);
    return okResponse(result, 'Organizations directory retrieved.');
  }

  async getOrganizationDetail(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getOrganizationDetail(orgId);
    if (!result) {
      return errorResponse('Organization not found', 'NOT_FOUND', null, 404);
    }
    return okResponse(result, 'Organization profile retrieved.');
  }

  async getMembers(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getMembers(orgId);
    return okResponse(result, 'Organization member roster retrieved.');
  }

  async getContests(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getContests(orgId);
    return okResponse(result, 'Organization contest list retrieved.');
  }

  async getParticipants(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getParticipants(orgId);
    return okResponse(result, 'Organization participant register retrieved.');
  }

  async getPayments(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getPayments(orgId);
    return okResponse(result, 'Organization payment logs retrieved.');
  }

  async getNotes(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getNotes(orgId);
    return okResponse(result, 'Organization operator notes retrieved.');
  }

  async addNote(req: Request, orgId: string) {
    const admin = await getSessionAdmin();
    const input = await parseRequest(req, createNoteSchema);
    
    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const result = await this.service.addNote(orgId, actor, input.body, input.tags);
    return okResponse(result, 'Support note logged successfully.');
  }

  async suspend(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, suspendOrgSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    await this.service.suspend(orgId, actor, input.reason);
    return okResponse(null, 'Organization suspended successfully.');
  }

  async reactivate(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, reactivateOrgSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    await this.service.reactivate(orgId, actor, input.reason);
    return okResponse(null, 'Organization reactivated successfully.');
  }
}

export default OrganizationsController;
