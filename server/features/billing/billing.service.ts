import { IBillingRepository, BillingRepository } from './billing.repository';
import {
  BillingPaymentsListQueryParams,
  PlatformPaymentItem,
  PlatformBillingSummary,
} from './billing.types';

export interface IBillingService {
  getPaymentsList(
    params: BillingPaymentsListQueryParams
  ): Promise<{ data: PlatformPaymentItem[]; total: number; page: number; limit: number }>;
  getBillingSummary(): Promise<PlatformBillingSummary>;
}

export class BillingService implements IBillingService {
  constructor(private repo: IBillingRepository = new BillingRepository()) {}

  async getPaymentsList(
    params: BillingPaymentsListQueryParams
  ): Promise<{ data: PlatformPaymentItem[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.getPlatformPayments(params);

    const data: PlatformPaymentItem[] = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      organizationSlug: r.organizationSlug,
      contestId: r.contestId || null,
      contestTitle: r.contestTitle || null,
      payeeName: r.payeeName,
      payeeEmail: r.payeeEmail,
      amount: parseInt(r.amount || '0', 10) / 100,
      currency: 'INR',
      status: r.status,
      provider: r.provider || 'RAZORPAY',
      razorpayPaymentId: r.razorpayPaymentId || null,
      paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getBillingSummary(): Promise<PlatformBillingSummary> {
    const revenueRollup = await this.repo.getRevenueRollup();
    const paymentsByStatusRaw = await this.repo.getPaymentsByStatusBreakdown();
    const topOrgs = await this.repo.getTopOrganizationsByRevenue(5);
    const activeSubscriptions = await this.repo.getActiveSubscriptionsWithPlans();

    let mrr = 0;
    for (const sub of activeSubscriptions) {
      if (sub.plan && sub.plan.price) {
        mrr += Number(sub.plan.price);
      }
    }

    const paymentsByStatus = {
      SUCCESS: paymentsByStatusRaw.SUCCESS || 0,
      FAILED: paymentsByStatusRaw.FAILED || 0,
      PENDING: paymentsByStatusRaw.PENDING || 0,
      REFUNDED: paymentsByStatusRaw.REFUNDED || 0,
    };

    return {
      totalRevenueAllTime: revenueRollup.allTime,
      totalRevenueThisMonth: revenueRollup.thisMonth,
      mrr,
      activeSubscriptionCount: activeSubscriptions.length,
      paymentsByStatus,
      topOrganizationsByRevenue: topOrgs,
      currency: 'INR',
    };
  }
}

export default BillingService;
