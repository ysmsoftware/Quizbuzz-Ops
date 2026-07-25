'use client';

import { apiRequest } from '@/lib/api/utils';
import {
  PayoutAccountsListQueryParams,
  RouteTransfersListQueryParams,
  PlatformPayoutAccountItem,
  OrgPayoutAccountResponse,
  PaymentRouteTransferItem,
  PayoutAccountDetail,
  AttachLinkedAccountInput,
  UpdatePayoutStatusInput,
  PlatformTransferSummary,
  PaymentTimelineResponse,
  NeedsAttentionItem,
} from '@/server/features/payouts/payouts.types';

export interface QueueHealthData {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export async function getPlatformTransferSummary(): Promise<PlatformTransferSummary> {
  return apiRequest<PlatformTransferSummary>('/api/v1/ops/payouts/summary');
}

export async function getRouteTransferQueueHealth(): Promise<QueueHealthData> {
  return apiRequest<QueueHealthData>('/api/v1/ops/payouts/queue-health');
}

export async function getPlatformPayoutAccounts(params?: Partial<PayoutAccountsListQueryParams>): Promise<{
  data: PlatformPayoutAccountItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', params.page.toString());
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.search) query.set('search', params.search);

  const url = `/api/v1/ops/payouts/accounts${query.toString() ? `?${query.toString()}` : ''}`;
  return apiRequest<{
    data: PlatformPayoutAccountItem[];
    total: number;
    page: number;
    limit: number;
  }>(url);
}

export async function getPlatformRouteTransfers(params?: Partial<RouteTransfersListQueryParams>): Promise<{
  data: PaymentRouteTransferItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', params.page.toString());
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.reason) query.set('reason', params.reason);

  const url = `/api/v1/ops/payouts/transfers${query.toString() ? `?${query.toString()}` : ''}`;
  return apiRequest<{
    data: PaymentRouteTransferItem[];
    total: number;
    page: number;
    limit: number;
  }>(url);
}

export async function getOrgPayoutAccount(orgId: string): Promise<OrgPayoutAccountResponse> {
  return apiRequest<OrgPayoutAccountResponse>(`/api/v1/ops/organizations/${orgId}/payout-account`);
}

export async function getOrgRouteTransfers(
  orgId: string,
  params?: Partial<RouteTransfersListQueryParams>
): Promise<{
  data: PaymentRouteTransferItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', params.page.toString());
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.status && params.status !== 'all') query.set('status', params.status);

  const url = `/api/v1/ops/organizations/${orgId}/payout-account/transfers${query.toString() ? `?${query.toString()}` : ''}`;
  return apiRequest<{
    data: PaymentRouteTransferItem[];
    total: number;
    page: number;
    limit: number;
  }>(url);
}

export async function attachLinkedAccount(
  orgId: string,
  input: AttachLinkedAccountInput
): Promise<PayoutAccountDetail> {
  return apiRequest<PayoutAccountDetail>(`/api/v1/ops/organizations/${orgId}/payout-account/link`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getPaymentTimeline(search: string): Promise<PaymentTimelineResponse> {
  return apiRequest<PaymentTimelineResponse>(`/api/v1/ops/payouts/timeline?search=${encodeURIComponent(search)}`);
}

export async function getNeedsAttention(params?: { page?: number; limit?: number }): Promise<{
  data: NeedsAttentionItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', params.page.toString());
  if (params?.limit) query.set('limit', params.limit.toString());

  const url = `/api/v1/ops/payouts/needs-attention${query.toString() ? `?${query.toString()}` : ''}`;
  return apiRequest<{
    data: NeedsAttentionItem[];
    total: number;
    page: number;
    limit: number;
  }>(url);
}

export async function retryTransfer(paymentId: string): Promise<{ jobId: string }> {
  return apiRequest<{ jobId: string }>(`/api/v1/ops/payouts/transfers/${paymentId}/retry`, {
    method: 'POST',
  });
}

export async function updatePayoutStatus(
  orgId: string,
  input: UpdatePayoutStatusInput
): Promise<PayoutAccountDetail> {
  return apiRequest<PayoutAccountDetail>(`/api/v1/ops/organizations/${orgId}/payout-account/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
