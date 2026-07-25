import { IPayoutsRepository, PayoutsRepository } from './payouts.repository';
import { NotFoundError } from '../../http/errors';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { cache } from '../../cache/cache';
import { env } from '../../config/env';
import {
  getRouteTransferQueueHealth as fetchQueueHealth,
  RouteTransferQueueHealth,
  enqueueForceRetryTransfer,
} from './payouts-queue.service';
import {
  PayoutAccountsListQueryParams,
  RouteTransfersListQueryParams,
  PlatformPayoutAccountItem,
  OrgPayoutAccountResponse,
  PaymentRouteTransferItem,
  PayoutAccountDetail,
  PlatformTransferSummary,
  PaymentTimelineResponse,
  TimelineEvent,
  NeedsAttentionItem,
} from './payouts.types';
import { ConflictError } from '../../http/errors';

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
  getPlatformTransferSummary(): Promise<PlatformTransferSummary>;
  getRouteTransferQueueHealth(): Promise<RouteTransferQueueHealth>;
  getPaymentTimeline(search: string): Promise<PaymentTimelineResponse>;
  getNeedsAttention(params: { page: number; limit: number }): Promise<{
    data: NeedsAttentionItem[];
    total: number;
    page: number;
    limit: number;
  }>;
  retryTransfer(paymentId: string, actor: AuditActor): Promise<{ jobId: string }>;
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
      gatewayFeeAmount: (parseInt(r.gatewayFeeAmount || '0', 10) / 100),
      gstAmount: (parseInt(r.gstAmount || '0', 10) / 100),
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
      gatewayFeeAmount: (parseInt(r.gatewayFeeAmount || '0', 10) / 100),
      gstAmount: (parseInt(r.gstAmount || '0', 10) / 100),
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

  async getPlatformTransferSummary(): Promise<PlatformTransferSummary> {
    const cacheKey = 'payouts:platform-transfer-summary';
    const cached = await cache.get<PlatformTransferSummary>(cacheKey);
    if (cached) {
      return cached;
    }

    const raw = await this.repo.getPlatformTransferSummary();
    const summary: PlatformTransferSummary = {
      processedCount: Number(raw.processedCount || 0),
      pendingCount: Number(raw.pendingCount || 0),
      failedCount: Number(raw.failedCount || 0),
      totalGrossAmount: Number(raw.totalGrossPaise || 0) / 100,
      totalCommissionAmount: Number(raw.totalCommissionPaise || 0) / 100,
      totalGatewayFeeAmount: Number(raw.totalGatewayFeePaise || 0) / 100,
      totalGstAmount: Number(raw.totalGstPaise || 0) / 100,
      totalTransferredAmount: Number(raw.totalTransferredPaise || 0) / 100,
      currency: 'INR',
    };

    await cache.set(cacheKey, summary, env.PAYOUTS_SUMMARY_CACHE_TTL_SECONDS);
    return summary;
  }

  async getRouteTransferQueueHealth(): Promise<RouteTransferQueueHealth> {
    return fetchQueueHealth();
  }

  /**
   * Assembles the full chain of events for one registration — participant registered,
   * order created, payment captured (or failed), transfer enqueued, transfer
   * processed/failed — from a single combined row (Participant LEFT JOIN its Payment
   * LEFT JOIN its PaymentRouteTransfer, either of which may not exist yet). This is
   * what turns "a participant says they registered but the org never got paid" from a
   * log-grepping exercise into something an ops admin can look at directly.
   *
   * The search itself is participant-anchored (id, registration reference, contact
   * email/phone), not payment-anchored — a support ticket is far more likely to name
   * a person or a registration reference than an internal payment id, so payment/order
   * ids are matched too but aren't the primary key here. Email/phone can match more
   * than one registration (the same contact can register for multiple contests); when
   * that happens this returns a pick-list instead of guessing which one was meant.
   */
  async getPaymentTimeline(search: string): Promise<PaymentTimelineResponse> {
    const rows = await this.repo.findRegistrationsForTimeline(search.trim());

    if (rows.length === 0) {
      return {
        found: false,
        participantId: null,
        paymentId: null,
        organizationId: null,
        organizationName: null,
        contestTitle: null,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        transferId: null,
        transferStatus: null,
        canRetry: false,
        events: [],
      };
    }

    if (rows.length > 1) {
      return {
        found: false,
        matches: rows.map((r) => ({
          participantId: r.participantId,
          organizationName: r.organizationName,
          contestTitle: r.contestTitle || null,
          participantName: [r.firstName, r.lastName].filter(Boolean).join(' ') || '(no name on file)',
          contactEmail: r.contactEmail || null,
          contactPhone: r.contactPhone || null,
          registrationRef: r.registrationRef,
          registeredAt: new Date(r.participantCreatedAt).toISOString(),
          paymentStatus: r.paymentStatus || null,
        })),
        participantId: null,
        paymentId: null,
        organizationId: null,
        organizationName: null,
        contestTitle: null,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        transferId: null,
        transferStatus: null,
        canRetry: false,
        events: [],
      };
    }

    const row = rows[0];
    const events: TimelineEvent[] = [];
    const rupees = (paise: string | number | null) => (paise ? Number(paise) / 100 : 0);

    // 1. Participant registered — always present, this is the true first step. A
    // complaint almost always starts here ("X registered for Y"), before any payment
    // may even exist.
    events.push({
      type: 'PARTICIPANT_REGISTERED',
      label: 'Participant registered',
      timestamp: row.participantCreatedAt ? new Date(row.participantCreatedAt).toISOString() : null,
      severity: 'ok',
      details: {
        registrationRef: row.registrationRef,
        name: [row.firstName, row.lastName].filter(Boolean).join(' ') || '(no name on file)',
        email: row.contactEmail || null,
        phone: row.contactPhone || null,
        currentStatus: row.participantStatus,
      },
    });

    // 2. No payment exists yet — either this contest doesn't take payment, or it does
    // and the participant never got as far as creating an order (registered, then
    // dropped off before checkout — the "registration failed halfway" case).
    if (!row.paymentId) {
      if (!row.paymentEnabled) {
        events.push({
          type: 'NO_PAYMENT_REQUIRED',
          label: 'No payment required — free contest',
          timestamp: null,
          severity: 'ok',
          details: {},
        });
      } else {
        events.push({
          type: 'PAYMENT_NOT_STARTED',
          label: 'Payment not yet initiated',
          timestamp: null,
          severity: row.participantStatus === 'PENDING_PAYMENT' ? 'problem' : 'pending',
          details: {
            note:
              row.participantStatus === 'PENDING_PAYMENT'
                ? 'Registered but never reached checkout, or the order-create step failed silently on their end.'
                : 'Participant has not attempted payment yet.',
          },
        });
      }

      return {
        found: true,
        participantId: row.participantId,
        paymentId: null,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        contestTitle: row.contestTitle || null,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        transferId: null,
        transferStatus: null,
        canRetry: false,
        events,
      };
    }

    // 3. Order created
    events.push({
      type: 'ORDER_CREATED',
      label: 'Order created',
      timestamp: row.paymentCreatedAt ? new Date(row.paymentCreatedAt).toISOString() : null,
      severity: 'ok',
      details: {
        razorpayOrderId: row.razorpayOrderId || null,
        amount: rupees(row.grossAmount),
        currency: row.currency || 'INR',
      },
    });

    // 4. Payment outcome
    if (row.paymentStatus === 'SUCCESS') {
      events.push({
        type: 'PAYMENT_CAPTURED',
        label: 'Payment captured (webhook confirmed)',
        timestamp: row.paidAt ? new Date(row.paidAt).toISOString() : null,
        severity: 'ok',
        details: {
          razorpayPaymentId: row.razorpayPaymentId || null,
          amount: rupees(row.grossAmount),
          webhookConfirmed: row.webhookConfirmed ? 'yes' : 'no',
        },
      });
    } else if (row.paymentStatus === 'FAILED') {
      events.push({
        type: 'PAYMENT_FAILED',
        label: 'Payment failed',
        timestamp: row.paymentUpdatedAt ? new Date(row.paymentUpdatedAt).toISOString() : null,
        severity: 'problem',
        details: { reason: row.paymentFailureReason || 'Unknown' },
      });
    } else {
      // CREATED or PENDING — participant hasn't completed payment, or the webhook
      // hasn't landed yet. Not necessarily a problem (could just be mid-checkout).
      events.push({
        type: 'PAYMENT_AWAITING_CAPTURE',
        label: `Awaiting payment confirmation (currently ${row.paymentStatus})`,
        timestamp: row.paymentUpdatedAt ? new Date(row.paymentUpdatedAt).toISOString() : null,
        severity: 'pending',
        details: {},
      });
    }

    // 3. Transfer chain — only reachable once payment succeeded.
    let canRetry = false;
    if (row.paymentStatus === 'SUCCESS') {
      if (!row.transferId) {
        // The gap 4.1 in the audit describes: SUCCESS with no transfer row at all.
        events.push({
          type: 'TRANSFER_MISSING',
          label: 'No transfer record exists for this payment yet',
          timestamp: null,
          severity: 'problem',
          details: {
            note: 'Either still within the safety delay before the transfer is queued, or the enqueue itself never happened. The reconciliation sweep picks this up automatically after the grace period — retry is also available once you confirm the org has an active payout account.',
          },
        });
        canRetry = true;
      } else {
        events.push({
          type: 'TRANSFER_ENQUEUED',
          label: 'Transfer created',
          timestamp: row.transferCreatedAt ? new Date(row.transferCreatedAt).toISOString() : null,
          severity: 'ok',
          details: {
            grossAmount: rupees(row.transferGrossAmount),
            commission: rupees(row.platformFeeAmount),
            gatewayFee: rupees(row.gatewayFeeAmount),
            gst: rupees(row.gstAmount),
            netAmount: rupees(row.transferAmount),
          },
        });

        if (row.transferStatus === 'PROCESSED') {
          events.push({
            type: 'TRANSFER_PROCESSED',
            label: 'Transfer completed — funds sent to organization',
            timestamp: row.transferProcessedAt ? new Date(row.transferProcessedAt).toISOString() : null,
            severity: 'ok',
            details: {
              razorpayTransferId: row.razorpayTransferId || null,
              netAmount: rupees(row.transferAmount),
            },
          });
        } else if (row.transferStatus === 'FAILED') {
          events.push({
            type: 'TRANSFER_FAILED',
            label: 'Transfer failed',
            timestamp: row.transferUpdatedAt ? new Date(row.transferUpdatedAt).toISOString() : null,
            severity: 'problem',
            details: { reason: row.transferFailureReason || 'Unknown Razorpay API error' },
          });
          canRetry = true;
        } else if (row.transferStatus === 'PENDING') {
          if (row.transferFailureReason === 'no_active_payout_account') {
            events.push({
              type: 'TRANSFER_AWAITING_ACCOUNT',
              label: "Waiting — organization doesn't have an active payout account linked",
              timestamp: row.transferUpdatedAt ? new Date(row.transferUpdatedAt).toISOString() : null,
              severity: 'pending',
              details: { note: 'Will resume automatically once the account is linked and activated.' },
            });
          } else {
            const ageMs = Date.now() - new Date(row.transferCreatedAt).getTime();
            const stuck = ageMs > env.PAYOUT_STUCK_TRANSFER_GRACE_MINUTES * 60 * 1000;
            events.push({
              type: 'TRANSFER_STUCK',
              label: stuck ? 'Transfer appears stuck — no failure reason, past the normal processing window' : 'Transfer in progress',
              timestamp: row.transferCreatedAt ? new Date(row.transferCreatedAt).toISOString() : null,
              severity: stuck ? 'problem' : 'pending',
              details: { ageMinutes: Math.round(ageMs / 60000) },
            });
            canRetry = stuck;
          }
        }
      }
    }

    return {
      found: true,
      participantId: row.participantId,
      paymentId: row.paymentId,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      contestTitle: row.contestTitle || null,
      razorpayOrderId: row.razorpayOrderId || null,
      razorpayPaymentId: row.razorpayPaymentId || null,
      transferId: row.transferId || null,
      transferStatus: row.transferStatus || null,
      canRetry,
      events,
    };
  }

  async getNeedsAttention(params: { page: number; limit: number }): Promise<{
    data: NeedsAttentionItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { rows, total } = await this.repo.getNeedsAttention({
      page: params.page,
      limit: params.limit,
      missingTransferGraceMinutes: env.PAYOUT_MISSING_TRANSFER_GRACE_MINUTES,
      stuckTransferGraceMinutes: env.PAYOUT_STUCK_TRANSFER_GRACE_MINUTES,
    });

    const data: NeedsAttentionItem[] = rows.map((r) => ({
      issueType: r.issueType,
      paymentId: r.paymentId,
      transferId: r.transferId || null,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      razorpayPaymentId: r.razorpayPaymentId || null,
      grossAmount: Number(r.grossAmount || 0) / 100,
      currency: r.currency || 'INR',
      ageMinutes: Math.round((Date.now() - new Date(r.createdAt).getTime()) / 60000),
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return { data, total, page: params.page, limit: params.limit };
  }

  /**
   * Ops-triggered manual retry — the action behind "I looked at the chain of events,
   * this is fixable, send it again". Refuses outright for an already-PROCESSED
   * transfer (would double-pay the org) and requires an org+payment be found. The
   * actual retry logic (fee recompute, Razorpay call, idempotent row reuse) lives in
   * the main app's PayoutService — this only asks for it, via forceRetry: true on the
   * job payload, and records who asked.
   */
  async retryTransfer(paymentId: string, actor: AuditActor): Promise<{ jobId: string }> {
    // paymentId is an exact primary-key match, so this can only ever return 0 or 1 row.
    const rows = await this.repo.findRegistrationsForTimeline(paymentId);
    const row = rows[0];
    if (!row || !row.paymentId) {
      throw new NotFoundError('Payment not found');
    }
    if (!row.razorpayPaymentId) {
      throw new ConflictError('This payment has no Razorpay payment id yet — nothing to transfer.');
    }
    if (row.transferStatus === 'PROCESSED') {
      throw new ConflictError('This transfer already completed — retrying would risk paying the organization twice.');
    }

    const jobId = await enqueueForceRetryTransfer({
      paymentId: row.paymentId,
      organizationId: row.organizationId,
      amount: Number(row.grossAmount),
      razorpayPaymentId: row.razorpayPaymentId,
      currency: row.currency || 'INR',
    });

    await writeAuditLogEntry(
      actor,
      'org.payout_transfer_retry_requested',
      AuditTargetType.PAYMENT,
      row.organizationId,
      row.organizationName,
      {
        paymentId: row.paymentId,
        transferId: row.transferId || null,
        previousTransferStatus: row.transferStatus || 'none',
        jobId,
      }
    );

    return { jobId };
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
