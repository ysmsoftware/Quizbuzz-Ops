'use client';

import { apiRequest } from '@/lib/api/utils';
import { Payment } from '@/lib/types';
import {
  BillingPaymentsListQueryParams,
  PlatformPaymentItem,
  PlatformBillingSummary,
} from '@/server/features/billing/billing.types';

export async function getPlatformBillingSummary(): Promise<PlatformBillingSummary> {
  return apiRequest<PlatformBillingSummary>('/api/v1/ops/billing/summary');
}

export async function getPlatformPayments(
  params?: Partial<BillingPaymentsListQueryParams>
): Promise<{
  data: PlatformPaymentItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', params.page.toString());
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  if (params?.orgId) query.set('orgId', params.orgId);

  const url = `/api/v1/ops/billing/payments${query.toString() ? `?${query.toString()}` : ''}`;
  return apiRequest<{
    data: PlatformPaymentItem[];
    total: number;
    page: number;
    limit: number;
  }>(url);
}

/**
 * Legacy compatibility wrapper for getPayments()
 */
export async function getPayments(): Promise<Payment[]> {
  const res = await getPlatformPayments({ limit: 100 });
  return res.data.map((p) => ({
    id: p.id,
    organizationId: p.organizationId,
    organizationName: p.organizationName,
    contestId: p.contestId || '',
    contestTitle: p.contestTitle || 'N/A',
    participantName: p.payeeName,
    amount: p.amount,
    currency: p.currency,
    status: p.status as Payment['status'],
    provider: p.provider as Payment['provider'],
    paidAt: p.paidAt,
    refundedAt: null,
    refundReason: null,
    createdAt: p.createdAt,
  }));
}
