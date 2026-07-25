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
  gatewayFeeAmount: number;
  gstAmount: number;
  transferAmount: number;
  currency: string;
  status: string;
  failureReason: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface PlatformTransferSummary {
  processedCount: number;
  pendingCount: number;
  failedCount: number;
  totalGrossAmount: number;
  totalCommissionAmount: number;
  totalGatewayFeeAmount: number;
  totalGstAmount: number;
  totalTransferredAmount: number;
  currency: string;
}

export type TimelineEventType =
  | 'PARTICIPANT_REGISTERED'
  | 'NO_PAYMENT_REQUIRED'
  | 'PAYMENT_NOT_STARTED'
  | 'ORDER_CREATED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_AWAITING_CAPTURE'
  | 'TRANSFER_ENQUEUED'
  | 'TRANSFER_PROCESSED'
  | 'TRANSFER_FAILED'
  | 'TRANSFER_AWAITING_ACCOUNT'
  | 'TRANSFER_STUCK'
  | 'TRANSFER_MISSING';

export interface TimelineEvent {
  type: TimelineEventType;
  label: string;
  timestamp: string | null;
  /** 'ok' = completed normally, 'pending' = in progress, 'problem' = needs ops attention */
  severity: 'ok' | 'pending' | 'problem';
  details: Record<string, string | number | null>;
}

export interface TimelineMatchSummary {
  participantId: string;
  organizationName: string;
  contestTitle: string | null;
  participantName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  registrationRef: string;
  registeredAt: string;
  paymentStatus: string | null;
}

export interface PaymentTimelineResponse {
  found: boolean;
  /** Present when the search term matched more than one registration (typically an
   * email or phone search) — the caller should show these and let the admin pick one,
   * rather than guessing which registration was meant. `events` is empty in this case. */
  matches?: TimelineMatchSummary[];
  participantId: string | null;
  paymentId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  contestTitle: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  transferId: string | null;
  transferStatus: string | null;
  canRetry: boolean;
  events: TimelineEvent[];
}

export type NeedsAttentionIssueType = 'MISSING_TRANSFER' | 'STUCK_PENDING';

export interface NeedsAttentionItem {
  issueType: NeedsAttentionIssueType;
  paymentId: string;
  transferId: string | null;
  organizationId: string;
  organizationName: string;
  razorpayPaymentId: string | null;
  grossAmount: number;
  currency: string;
  ageMinutes: number;
  createdAt: string;
}

export interface AttachLinkedAccountInput {
  razorpayLinkedAccountId: string;
}

export interface UpdatePayoutStatusInput {
  status: 'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED';
  reason: string;
}
