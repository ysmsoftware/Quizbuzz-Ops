export type PlatformPaymentStatus = 'all' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUNDED';

export interface BillingPaymentsListQueryParams {
  page: number;
  limit: number;
  status: PlatformPaymentStatus;
  search?: string;
  orgId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PlatformPaymentItem {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  contestId: string | null;
  contestTitle: string | null;
  payeeName: string;
  payeeEmail: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentsByStatusBreakdown {
  SUCCESS: number;
  FAILED: number;
  PENDING: number;
  REFUNDED: number;
}

export interface TopRevenueOrg {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  totalRevenue: number;
  paymentCount: number;
}

export interface PlatformBillingSummary {
  totalRevenueAllTime: number;
  totalRevenueThisMonth: number;
  mrr: number;
  activeSubscriptionCount: number;
  paymentsByStatus: PaymentsByStatusBreakdown;
  topOrganizationsByRevenue: TopRevenueOrg[];
  currency: string;
}
