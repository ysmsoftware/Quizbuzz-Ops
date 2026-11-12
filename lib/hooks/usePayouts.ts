'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPlatformPayoutAccounts,
  getPlatformRouteTransfers,
  getPlatformTransferSummary,
  getOrgPayoutAccount,
  getOrgRouteTransfers,
  attachLinkedAccount,
  updatePayoutStatus,
  getPaymentTimeline,
  getNeedsAttention,
} from '@/lib/api/payouts';
import {
  PayoutAccountsListQueryParams,
  RouteTransfersListQueryParams,
  AttachLinkedAccountInput,
  UpdatePayoutStatusInput,
} from '@/server/features/payouts/payouts.types';

export function usePayoutAccounts(params?: Partial<PayoutAccountsListQueryParams>) {
  return useQuery({
    queryKey: ['payouts', 'accounts', params],
    queryFn: () => getPlatformPayoutAccounts(params),
  });
}

export function useRouteTransfers(params?: Partial<RouteTransfersListQueryParams>) {
  return useQuery({
    queryKey: ['payouts', 'transfers', params],
    queryFn: () => getPlatformRouteTransfers(params),
  });
}

export function usePlatformTransferSummary() {
  return useQuery({
    queryKey: ['payouts', 'summary'],
    queryFn: () => getPlatformTransferSummary(),
    staleTime: 30000,
  });
}

export function useOrgPayoutAccount(orgId: string) {
  return useQuery({
    queryKey: ['payouts', 'orgAccount', orgId],
    queryFn: () => getOrgPayoutAccount(orgId),
    enabled: Boolean(orgId),
  });
}

export function useOrgRouteTransfers(orgId: string, params?: Partial<RouteTransfersListQueryParams>) {
  return useQuery({
    queryKey: ['payouts', 'orgTransfers', orgId, params],
    queryFn: () => getOrgRouteTransfers(orgId, params),
    enabled: Boolean(orgId),
  });
}

export function useAttachLinkedAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, input }: { orgId: string; input: AttachLinkedAccountInput }) =>
      attachLinkedAccount(orgId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', 'detail', variables.orgId] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });
}

export function usePaymentTimeline(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['payouts', 'timeline', search],
    queryFn: () => getPaymentTimeline(search),
    enabled: enabled && search.trim().length >= 3,
    retry: false,
  });
}

export function useNeedsAttention(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['payouts', 'needsAttention', params],
    queryFn: () => getNeedsAttention(params),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

export function useUpdatePayoutStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, input }: { orgId: string; input: UpdatePayoutStatusInput }) =>
      updatePayoutStatus(orgId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', 'detail', variables.orgId] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });
}
