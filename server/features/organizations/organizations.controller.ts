import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseQueryParams, parseRequest } from '../../http/validation';
import { orgListQuerySchema, createNoteSchema, suspendOrgSchema, reactivateOrgSchema, createOrgSchema, updateOrgSchema, deleteOrgSchema, orgParticipantsQuerySchema } from './organizations.validator';
import type { ISubscriptionsService } from '../subscriptions/subscriptions.service';
import type { AuditActor } from '../../audit/audit-writer';
import { IOrganizationsService, OrganizationsService } from './organizations.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { z } from 'zod';

export class OrganizationsController {
  constructor(
    private service: IOrganizationsService = new OrganizationsService(),
    // Used only to give a newly created org its plan (the default is the free "starter" plan).
    private subscriptions?: Pick<ISubscriptionsService, 'assignPlan'>,
    private findPlanId?: (slug: string) => Promise<string | null>
  ) {}

  private actorOf(admin: { id: string; email: string; name: string; role: string }): AuditActor {
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
  }

  async create(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, createOrgSchema);
    const actor = this.actorOf(admin);

    const created = await this.service.createOrganization(actor, input);

    // Plan assignment is best-effort: the org already exists; the operator can fix the plan from the
    // Subscription tab. It must not turn a successful create into an error response.
    let planAssigned = false;
    try {
      const planId = input.planId ?? (this.findPlanId ? await this.findPlanId('starter') : null);
      if (planId && this.subscriptions) {
        await this.subscriptions.assignPlan(created.id, planId, actor);
        planAssigned = true;
      }
    } catch (err) {
      console.error(`[organizations] Created org ${created.id} but could not assign its plan:`, err);
    }

    return okResponse({ ...created, planAssigned }, 'Organization created successfully.');
  }

  async update(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, updateOrgSchema);
    await this.service.updateOrganization(orgId, this.actorOf(admin), input);
    return okResponse(null, 'Organization updated successfully.');
  }

  async softDelete(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, deleteOrgSchema);
    await this.service.softDelete(orgId, this.actorOf(admin), input.reason);
    return okResponse(null, 'Organization deleted. It is hidden from lists and can be restored.');
  }

  async restore(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, reactivateOrgSchema);
    await this.service.restore(orgId, this.actorOf(admin), input.reason);
    return okResponse(null, 'Organization restored.');
  }

  async getOrganizationsList(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, orgListQuerySchema);
    const result = await this.service.getOrganizationsList(query);
    return okResponse(result, 'Organizations directory retrieved.');
  }

  /** id → name for up to 100 organizations (deleted ones included, so old messages/logs still label). */
  async getNames(req: Request) {
    await getSessionAdmin();
    const { ids } = parseQueryParams(req, z.object({ ids: z.string().default('') }));
    const list = ids.split(',').map((i) => i.trim()).filter(Boolean).slice(0, 100);
    return okResponse(await this.service.getNames(list), 'Organization names retrieved.');
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

  async getUsage(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getUsage(orgId);
    return okResponse(result, 'Organization plan usage retrieved.');
  }

  async getParticipants(req: Request, orgId: string) {
    await getSessionAdmin();
    const query = parseQueryParams(req, orgParticipantsQuerySchema);
    const result = await this.service.getParticipants(orgId, query);
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
