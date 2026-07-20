import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseQueryParams, parseRequest } from '../../http/validation';
import { planCreateSchema, planUpdateSchema } from './plans.validator';
import { PlansService } from './plans.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { z } from 'zod';

export class PlansController {
  private service = new PlansService();

  async getPlans(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(
      req,
      z.object({
        includeInactive: z.preprocess((v) => v === 'true', z.boolean()).default(false),
      })
    );
    const result = await this.service.getPlans(query.includeInactive);
    return okResponse(result, 'Subscription plans retrieved.');
  }

  async getPlanById(planId: string) {
    await getSessionAdmin();
    const result = await this.service.getPlanById(planId);
    if (!result) {
      return errorResponse('Subscription plan not found', 'NOT_FOUND', null, 404);
    }
    return okResponse(result, 'Subscription plan details retrieved.');
  }

  async createPlan(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, planCreateSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const result = await this.service.createPlan(input, actor);
    return okResponse(result, 'Subscription plan created.');
  }

  async updatePlan(req: Request, planId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);
    const input = await parseRequest(req, planUpdateSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const result = await this.service.updatePlan(planId, input, actor);
    return okResponse(result, 'Subscription plan updated successfully.');
  }

  async getImpact(planId: string) {
    await getSessionAdmin();
    const result = await this.service.getImpact(planId);
    return okResponse(result, 'Subscription plan update impact evaluated.');
  }

  async deactivatePlan(req: Request, planId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN]);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    await this.service.deactivatePlan(planId, actor);
    return okResponse(null, 'Subscription plan deactivated successfully.');
  }
}
export default PlansController;
