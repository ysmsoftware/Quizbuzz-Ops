export type PayoutAccountStatus = 'all' | 'PENDING' | 'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED';
export type RouteTransferStatus = 'all' | 'PENDING' | 'PROCESSED' | 'FAILED' | 'REVERSED';

export interface PayoutAccountsListQueryParams {
  page: number;
  limit: number;
  status: PayoutAccountStatus;
  search?: string;
}

export interface RouteTransfersListQueryParams {
  page: number;
  limit: number;
  status: RouteTransferStatus;
  reason?: string;
  orgId?: string;
}

export interface PlatformPayoutAccountItem {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  accountName: string;
  accountEmail: string;
  contactNumber: string | null;
  status: string;
  onboardingMode: string;
  razorpayLinkedAccountId: string | null;
  activatedAt: string | null;
  pendingTransferCount: number;
  lastContactedAt: string | null;
  lastContactNote: string | null;
  hasContactInfo: boolean;
  createdAt: string;
}

export interface PayoutAccountDetail {
  id: string;
  organizationId: string;
  accountName: string;
  accountEmail: string;
  contactNumber: string | null;
  status: string;
  statusReason?: string | null;
  onboardingMode: string;
  razorpayLinkedAccountId: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferSummary {
  processed: number;
  failed: number;
  pendingNoAccount: number;
  totalTransferredAllTime: number;
  currency: string;
}

export interface OrgPayoutAccountResponse {
  hasAccount: boolean;
  account: PayoutAccountDetail | null;
  transferSummary: TransferSummary | null;
}

export interface PaymentRouteTransferItem {
  id: string;
  organizationId?: string;
  organizationName?: string;
  paymentId: string;
  razorpayPaymentId: string | null;
  razorpayTransferId: string | null;
  contestTitle: string;
  grossAmount: number;
  platformFeeAmount: number;
  transferAmount: number;
  currency: string;
  status: string;
  failureReason: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface AttachLinkedAccountInput {
  razorpayLinkedAccountId: string;
}

export interface UpdatePayoutStatusInput {
  status: 'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED';
  reason: string;
}
