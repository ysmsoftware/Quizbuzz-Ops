'use client';

import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import {
  getMessages,
  getMessageTemplates,
  sendMessage,
  retryMessage,
  retryFailedMessages,
  GetMessagesParams,
  SendMessageParams,
} from '@/lib/api/messaging';
import { getOrganizationDetail } from '@/lib/api/organizations';

/**
 * Backs the centralized Messaging dashboard page. `filters` should be a
 * stable object (from useState) so react-query's key comparison re-fetches
 * only when a filter actually changes.
 */
export function useMessages(filters: GetMessagesParams) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['messages', 'list', filters],
    queryFn: () => getMessages(filters),
    placeholderData: (prev) => prev, // keep the table populated while paging/filtering instead of flashing empty
    // Live status updates without a manual reload: poll while anything on the
    // current page is still QUEUED/PROCESSING (i.e. the worker could still
    // move it), and stop automatically once everything visible is terminal
    // (SENT/DELIVERED/FAILED) so an idle Messaging tab doesn't poll forever.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 4000;
      const hasInFlight = data.data.some((m) => m.status === 'QUEUED' || m.status === 'PROCESSING');
      return hasInFlight ? 4000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const templatesQuery = useQuery({
    queryKey: ['messages', 'templates'],
    queryFn: getMessageTemplates,
    staleTime: 5 * 60 * 1000, // template catalog changes rarely
  });

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['messages', 'list'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const sendMutation = useMutation({
    mutationFn: (payload: SendMessageParams) => sendMessage(payload),
    onSuccess: invalidateList,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryMessage(id),
    onSuccess: invalidateList,
  });

  const retryFailedMutation = useMutation({
    mutationFn: (organizationId: string) => retryFailedMessages(organizationId),
    onSuccess: invalidateList,
  });

  return {
    messages: listQuery.data?.data || [],
    pagination: {
      total: listQuery.data?.total || 0,
      page: listQuery.data?.page || 1,
      limit: listQuery.data?.limit || 20,
      totalPages: listQuery.data?.totalPages || 1,
    },
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isError: listQuery.isError,
    refetch: listQuery.refetch,

    templates: templatesQuery.data || [],
    isLoadingTemplates: templatesQuery.isLoading,

    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,

    retryMessage: retryMutation.mutateAsync,
    isRetrying: retryMutation.isPending,
    retryingMessageId: retryMutation.isPending ? retryMutation.variables : undefined,

    retryFailed: retryFailedMutation.mutateAsync,
    isRetryingFailed: retryFailedMutation.isPending,
  };
}

/**
 * The message log only stores organizationId (it lives in the ops DB;
 * organizations live in the main app's DB — there's no cheap server-side
 * join across the two). This resolves display names for whichever org IDs
 * are visible on the current page, one cached lookup per ID, so paging
 * through the same organizations' messages doesn't refetch their names.
 */
export function useOrganizationNames(organizationIds: string[]) {
  const uniqueIds = Array.from(new Set(organizationIds)).filter(Boolean);

  const results = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['organizations', 'detail', id],
      queryFn: () => getOrganizationDetail(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const namesById: Record<string, string> = {};
  uniqueIds.forEach((id, index) => {
    const org = results[index]?.data;
    if (org) namesById[id] = org.name;
  });

  return namesById;
}
