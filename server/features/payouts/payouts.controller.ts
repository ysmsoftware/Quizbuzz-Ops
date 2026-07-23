import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseQueryParams, parseRequest } from '../../http/validation';
import {
  payoutAccountsQuerySchema,
  routeTransfersQuerySchema,
  attachLinkedAccountSchema,
  updatePayoutStatusSchema,
} from './payouts.validator';
import { IPayoutsService, PayoutsService } from './payouts.service';
import { okResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';

export class PayoutsController {
  constructor(private service: IPayoutsService = new PayoutsService()) {}

  async listPayoutAccounts(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, payoutAccountsQuerySchema);
    const result = await this.service.getPlatformPayoutAccounts(query);
    return okResponse(result, 'Payout accounts retrieved.');
  }

  async getOrganizationPayoutAccount(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.getOrganizationPayoutAccount(orgId);
    return okResponse(result, 'Payout account retrieved.');
  }

  async listOrganizationRouteTransfers(req: Request, orgId: string) {
    await getSessionAdmin();
    const query = parseQueryParams(req, routeTransfersQuerySchema);
    const result = await this.service.getOrganizationRouteTransfers(orgId, query);
    return okResponse(result, 'Route transfers retrieved.');
  }

  async listPlatformRouteTransfers(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, routeTransfersQuerySchema);
    const result = await this.service.getPlatformRouteTransfers(query);
    return okResponse(result, 'Platform route transfers retrieved.');
  }

  async attachLinkedAccount(req: Request, orgId: string) {
    const admin = await requireRole([
      PlatformAdminRole.SUPER_ADMIN,
      PlatformAdminRole.BILLING_ADMIN,
    ]);
    const input = await parseRequest(req, attachLinkedAccountSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    const result = await this.service.attachLinkedAccount(
      orgId,
      actor,
      input.razorpayLinkedAccountId
    );
    return okResponse(result, 'Payout account linked and activated.');
  }

  async updatePayoutStatus(req: Request, orgId: string) {
    const admin = await requireRole([
      PlatformAdminRole.SUPER_ADMIN,
      PlatformAdminRole.BILLING_ADMIN,
    ]);
    const input = await parseRequest(req, updatePayoutStatusSchema);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    const result = await this.service.updatePayoutStatus(
      orgId,
      actor,
      input.status,
      input.reason
    );
    return okResponse(result, 'Payout account status updated.');
  }
}

export default PayoutsController;
