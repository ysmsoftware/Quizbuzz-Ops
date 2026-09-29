'use client';

import { apiRequest } from '@/lib/api/utils';

export type MainAppPaymentStatus = 'CREATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface PaymentOrder {
  razorpayOrderId: string;
  status: MainAppPaymentStatus;
  razorpayPaymentId: string | null;
  method: string | null;
  failureReason: string | null;
  errorCode: string | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors server/features/payment-details/payment-details.types.ts. */
export interface PaymentDetail {
  id: string;
  organizationId: string;
  organizationName: string;
  contestId: string;
  contestTitle: string | null;
  participantId: string;
  registrationRef: string | null;
  participantStatus: string | null;
  payeeName: string;
  email: string | null;
  phone: string | null;
  amount: number;
  currency: string;
  status: MainAppPaymentStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpayStatus: string | null;
  failureReason: string | null;
  attempts: number;
  webhookConfirmed: boolean;
  razorpayReceipts: { original: string; retry: string };
  /** Every Razorpay order for this payment, oldest first. null = history not readable on this environment. */
  orders: PaymentOrder[] | null;
  metadata: unknown;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetPaymentDetailsParams {
  page?: number;
  limit?: number;
  status?: 'all' | MainAppPaymentStatus;
  /** Email, name, phone (digits), order/payment/participant ID, registration ref, contest or org name. */
  search?: string;
  organizationId?: string;
  /** Only rows whose Razorpay order ID was replaced by a retry at least once. */
  retriedOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedPaymentDetails {
  data: PaymentDetail[];
  total: number;
  page: number;
  limit: number;
}

export async function getPaymentDetails(params: GetPaymentDetailsParams = {}): Promise<PaginatedPaymentDetails> {
  const query = new URLSearchParams();
  query.set('page', String(params.page || 1));
  query.set('limit', String(params.limit || 50));
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.organizationId) query.set('organizationId', params.organizationId);
  if (params.retriedOnly) query.set('retriedOnly', '1');
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);

  return apiRequest<PaginatedPaymentDetails>(`/api/v1/ops/payment-details?${query.toString()}`);
}
