import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseQueryParams, parseRequest } from '../../http/validation';
import {
  payoutAccountsQuerySchema,
  routeTransfersQuerySchema,
  attachLinkedAccountSchema,
  updatePayoutStatusSchema,
  paymentTimelineQuerySchema,
  needsAttentionQuerySchema,
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

  async getPlatformTransferSummary(req: Request) {
    await getSessionAdmin();
    const result = await this.service.getPlatformTransferSummary();
    return okResponse(result, 'Platform transfer summary retrieved.');
  }

  async getRouteTransferQueueHealth(req: Request) {
    await getSessionAdmin();
    const result = await this.service.getRouteTransferQueueHealth();
    return okResponse(result, 'Route transfer queue health retrieved.');
  }

  async getPaymentTimeline(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, paymentTimelineQuerySchema);
    const result = await this.service.getPaymentTimeline(query.search);
    return okResponse(result, result.found ? 'Payment timeline retrieved.' : 'No matching payment found.');
  }

  async getNeedsAttention(req: Request) {
    await getSessionAdmin();
    const query = parseQueryParams(req, needsAttentionQuerySchema);
    const result = await this.service.getNeedsAttention(query);
    return okResponse(result, 'Needs-attention list retrieved.');
  }

  async retryTransfer(req: Request, paymentId: string) {
    const admin = await requireRole([
      PlatformAdminRole.SUPER_ADMIN,
      PlatformAdminRole.BILLING_ADMIN,
    ]);

    const actor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    const result = await this.service.retryTransfer(paymentId, actor);
    return okResponse(result, 'Transfer retry enqueued.');
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
