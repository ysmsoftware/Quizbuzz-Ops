import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseRequest } from '../../http/validation';
import { assignPlanSchema, changePlanSchema, addOverrideSchema, removeOverrideSchema, updateAccessSchema, migrateSubscribersSchema } from './subscriptions.validator';
import { cancelScheduledChange, migratePlanSubscribers, scheduleChange } from './plan-change';
import { prisma } from '../../db/ops-prisma';
import { ISubscriptionsService, SubscriptionsService } from './subscriptions.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { assertOrgExists } from '../organizations/org-exists';

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
    await assertOrgExists(orgId);

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
    await assertOrgExists(orgId);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    if (input.when === 'period_end') {
      const current = await prisma.organizationSubscription.findUnique({ where: { organizationId: orgId }, select: { billingCycle: true, currentPeriodEnd: true } });
      await scheduleChange(orgId, input.planId, input.billingCycle ?? current?.billingCycle ?? 'MONTHLY', actor, input.reason || 'Scheduled by ops');
      return okResponse(await this.service.getSubscription(orgId), `Change scheduled for ${current?.currentPeriodEnd.toISOString().slice(0, 10)}.`);
    }
    const result = await this.service.changePlan(orgId, input.planId, actor, input.billingCycle, input.reason);
    return okResponse(result, 'Subscription plan changed successfully.');
  }

  async cancelScheduledChange(orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    await cancelScheduledChange(orgId, { id: admin.id, email: admin.email, name: admin.name, role: admin.role });
    return okResponse(await this.service.getSubscription(orgId), 'Scheduled change cancelled.');
  }

  async migrateSubscribers(req: Request, planId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, migrateSubscribersSchema);
    const result = await migratePlanSubscribers(planId, input, { id: admin.id, email: admin.email, name: admin.name, role: admin.role });
    return okResponse(result, input.dryRun ? 'Preview.' : `Moved ${result.moved} organizations.`);
  }

  async addOverride(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, addOverrideSchema);
    await assertOrgExists(orgId);

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

  async updateAccess(req: Request, orgId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, updateAccessSchema);
    if (input.graceDays !== undefined && admin.role !== PlatformAdminRole.SUPER_ADMIN) {
      return errorResponse('Only a super admin can change the grace period.', 'FORBIDDEN', null, 403);
    }
    await assertOrgExists(orgId);
    const actor = { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
    const result = await this.service.updateAccess(
      orgId,
      {
        currentPeriodStart: input.currentPeriodStart ? new Date(input.currentPeriodStart) : undefined,
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : undefined,
        graceDays: input.graceDays,
        contractStart: input.contractStart === undefined ? undefined : input.contractStart ? new Date(input.contractStart) : null,
        contractEnd: input.contractEnd === undefined ? undefined : input.contractEnd ? new Date(input.contractEnd) : null,
        poNumber: input.poNumber,
        contractNotes: input.contractNotes,
        reason: input.reason,
      },
      actor,
    );
    return okResponse(result, 'Subscription access updated.');
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
