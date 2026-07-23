import { IPayoutsRepository, PayoutsRepository } from './payouts.repository';
import { NotFoundError } from '../../http/errors';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import {
  PayoutAccountsListQueryParams,
  RouteTransfersListQueryParams,
  PlatformPayoutAccountItem,
  OrgPayoutAccountResponse,
  PaymentRouteTransferItem,
  PayoutAccountDetail,
} from './payouts.types';

export interface IPayoutsService {
  getPlatformPayoutAccounts(params: PayoutAccountsListQueryParams): Promise<{
    data: PlatformPayoutAccountItem[];
    total: number;
    page: number;
    limit: number;
  }>;
  getOrganizationPayoutAccount(orgId: string): Promise<OrgPayoutAccountResponse>;
  getOrganizationRouteTransfers(
    orgId: string,
    params: RouteTransfersListQueryParams
  ): Promise<{ data: PaymentRouteTransferItem[]; total: number; page: number; limit: number }>;
  getPlatformRouteTransfers(
    params: RouteTransfersListQueryParams
  ): Promise<{ data: PaymentRouteTransferItem[]; total: number; page: number; limit: number }>;
  attachLinkedAccount(
    orgId: string,
    actor: AuditActor,
    razorpayLinkedAccountId: string
  ): Promise<PayoutAccountDetail>;
  updatePayoutStatus(
    orgId: string,
    actor: AuditActor,
    status: 'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED',
    reason: string
  ): Promise<PayoutAccountDetail>;
}

export class PayoutsService implements IPayoutsService {
  constructor(private repo: IPayoutsRepository = new PayoutsRepository()) {}

  async getPlatformPayoutAccounts(params: PayoutAccountsListQueryParams): Promise<{
    data: PlatformPayoutAccountItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { rows, total } = await this.repo.getPlatformPayoutAccounts(params);

    const data: PlatformPayoutAccountItem[] = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      organizationSlug: r.organizationSlug,
      accountName: r.accountName,
      accountEmail: r.accountEmail,
      contactNumber: r.contactNumber || null,
      status: r.status,
      onboardingMode: r.onboardingMode,
      razorpayLinkedAccountId: r.razorpayLinkedAccountId || null,
      activatedAt: r.activatedAt ? new Date(r.activatedAt).toISOString() : null,
      pendingTransferCount: r.pendingTransferCount || 0,
      lastContactedAt: r.lastContactedAt,
      lastContactNote: r.lastContactNote,
      hasContactInfo: r.hasContactInfo,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getOrganizationPayoutAccount(orgId: string): Promise<OrgPayoutAccountResponse> {
    const org = await this.repo.getOrganizationDetail(orgId);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const rawAccount = await this.repo.getOrganizationPayoutAccount(orgId);
    if (!rawAccount) {
      return {
        hasAccount: false,
        account: null,
        transferSummary: null,
      };
    }

    const transferSummary = await this.repo.getOrganizationTransferSummary(orgId);

    const account: PayoutAccountDetail = {
      id: rawAccount.id,
      organizationId: rawAccount.organizationId,
      accountName: rawAccount.accountName,
      accountEmail: rawAccount.accountEmail,
      contactNumber: rawAccount.contactNumber || null,
      status: rawAccount.status,
      statusReason: rawAccount.statusReason || null,
      onboardingMode: rawAccount.onboardingMode,
      razorpayLinkedAccountId: rawAccount.razorpayLinkedAccountId || null,
      activatedAt: rawAccount.activatedAt ? new Date(rawAccount.activatedAt).toISOString() : null,
      createdAt: new Date(rawAccount.createdAt).toISOString(),
      updatedAt: new Date(rawAccount.updatedAt).toISOString(),
    };

    return {
      hasAccount: true,
      account,
      transferSummary,
    };
  }

  async getOrganizationRouteTransfers(
    orgId: string,
    params: RouteTransfersListQueryParams
  ): Promise<{ data: PaymentRouteTransferItem[]; total: number; page: number; limit: number }> {
    const org = await this.repo.getOrganizationDetail(orgId);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const { rows, total } = await this.repo.getOrganizationRouteTransfers(orgId, params);

    const data: PaymentRouteTransferItem[] = rows.map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      razorpayPaymentId: r.razorpayPaymentId || null,
      razorpayTransferId: r.razorpayTransferId || null,
      contestTitle: r.contestTitle,
      grossAmount: (parseInt(r.grossAmount || '0', 10) / 100),
      platformFeeAmount: (parseInt(r.platformFeeAmount || '0', 10) / 100),
      transferAmount: (parseInt(r.transferAmount || '0', 10) / 100),
      currency: r.currency || 'INR',
      status: r.status,
      failureReason: r.failureReason || null,
      processedAt: r.processedAt ? new Date(r.processedAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getPlatformRouteTransfers(
    params: RouteTransfersListQueryParams
  ): Promise<{ data: PaymentRouteTransferItem[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.getPlatformRouteTransfers(params);

    const data: PaymentRouteTransferItem[] = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      paymentId: r.paymentId,
      razorpayPaymentId: r.razorpayPaymentId || null,
      razorpayTransferId: r.razorpayTransferId || null,
      contestTitle: r.contestTitle,
      grossAmount: (parseInt(r.grossAmount || '0', 10) / 100),
      platformFeeAmount: (parseInt(r.platformFeeAmount || '0', 10) / 100),
      transferAmount: (parseInt(r.transferAmount || '0', 10) / 100),
      currency: r.currency || 'INR',
      status: r.status,
      failureReason: r.failureReason || null,
      processedAt: r.processedAt ? new Date(r.processedAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async attachLinkedAccount(
    orgId: string,
    actor: AuditActor,
    razorpayLinkedAccountId: string
  ): Promise<PayoutAccountDetail> {
    const org = await this.repo.getOrganizationDetail(orgId);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const existingAccount = await this.repo.getOrganizationPayoutAccount(orgId);
    if (!existingAccount) {
      throw new NotFoundError('This organization has not submitted payout account details yet.');
    }

    const updated = await this.repo.attachLinkedAccount(orgId, razorpayLinkedAccountId);

    await writeAuditLogEntry(
      actor,
      'org.payout_account_linked',
      AuditTargetType.PAYMENT,
      orgId,
      org.name,
      {
        razorpayLinkedAccountId,
        status: 'ACTIVE',
        previousStatus: existingAccount.status,
      }
    );

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      accountName: updated.accountName,
      accountEmail: updated.accountEmail,
      contactNumber: updated.contactNumber || null,
      status: updated.status,
      statusReason: updated.statusReason || null,
      onboardingMode: updated.onboardingMode,
      razorpayLinkedAccountId: updated.razorpayLinkedAccountId,
      activatedAt: updated.activatedAt ? new Date(updated.activatedAt).toISOString() : null,
      createdAt: new Date(updated.createdAt).toISOString(),
      updatedAt: new Date(updated.updatedAt).toISOString(),
    };
  }

  async updatePayoutStatus(
    orgId: string,
    actor: AuditActor,
    status: 'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED',
    reason: string
  ): Promise<PayoutAccountDetail> {
    const org = await this.repo.getOrganizationDetail(orgId);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const existingAccount = await this.repo.getOrganizationPayoutAccount(orgId);
    if (!existingAccount) {
      throw new NotFoundError('Payout account not found for this organization');
    }

    const updated = await this.repo.updatePayoutStatus(orgId, status, reason);

    await writeAuditLogEntry(
      actor,
      'org.payout_account_status_changed',
      AuditTargetType.PAYMENT,
      orgId,
      org.name,
      {
        previousStatus: existingAccount.status,
        newStatus: status,
        reason,
      }
    );

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      accountName: updated.accountName,
      accountEmail: updated.accountEmail,
      contactNumber: updated.contactNumber || null,
      status: updated.status,
      statusReason: updated.statusReason || null,
      onboardingMode: updated.onboardingMode,
      razorpayLinkedAccountId: updated.razorpayLinkedAccountId || null,
      activatedAt: updated.activatedAt ? new Date(updated.activatedAt).toISOString() : null,
      createdAt: new Date(updated.createdAt).toISOString(),
      updatedAt: new Date(updated.updatedAt).toISOString(),
    };
  }
}
export default PayoutsService;
