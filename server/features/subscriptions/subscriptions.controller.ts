import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseRequest } from '../../http/validation';
import { assignPlanSchema, changePlanSchema, addOverrideSchema, removeOverrideSchema } from './subscriptions.validator';
import { ISubscriptionsService, SubscriptionsService } from './subscriptions.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';

export class SubscriptionsController {
  constructor(private service: ISubscriptionsService = new SubscriptionsService()) {}

  async getSubscription(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getSubscription(orgId);
    if (!result) {
      return errorResponse('Subscription not found for this organization.', 'NOT_FOUND', null, 404);
    }
    return okResponse(result, 'Subscription details retrieved.');
  }

  async assignPlan(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, assignPlanSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const result = await this.service.assignPlan(orgId, input.planId, actor, input.billingCycle);
    return okResponse(result, 'Subscription plan assigned successfully.');
  }

  async changePlan(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, changePlanSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const result = await this.service.changePlan(orgId, input.planId, actor, input.billingCycle, input.reason);
    return okResponse(result, 'Subscription plan changed successfully.');
  }

  async addOverride(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, addOverrideSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
    const result = await this.service.addOverride(orgId, input.field, input.value, input.reason, actor, expiresAt, input.mode);
    return okResponse(result, 'Subscription limit override added successfully.');
  }

  async removeOverride(req: Request, orgId: string, overrideId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, removeOverrideSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const result = await this.service.removeOverride(orgId, overrideId, input.reason || 'Manual removal', actor);
    return okResponse(result, 'Subscription limit override removed.');
  }

  async resendRenewalReminder(orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const actor = { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
    const result = await this.service.resendRenewalReminder(orgId, actor);
    return okResponse(result, result.sent ? 'Renewal reminder resent.' : 'No owner contact found — nothing was sent.');
  }

  async resendReceipt(orgId: string, paymentId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const actor = { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
    const result = await this.service.resendReceipt(orgId, paymentId, actor);
    return okResponse(result, result.sent ? 'Receipt resent.' : 'No owner contact found — nothing was sent.');
  }
}
export default SubscriptionsController;
