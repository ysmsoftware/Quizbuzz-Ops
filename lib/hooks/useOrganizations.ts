'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { GetOrganizationsParams, OrgParticipantsParams } from '@/lib/api/organizations';
import {
  getOrganizations,
  getOrganizationDetail,
  getOrganizationContests,
  suspendOrganization,
  activateOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  restoreOrganization,
  bulkSuspendOrganizations,
  addOrganizationNote,
  getOrganizationMembers,
  getOrganizationParticipants,
  getOrganizationNames,
  getOrganizationInstitution,
  getOrganizationFeatures,
  getOrganizationPayments,
  resendPaymentReceipt,
} from '@/lib/api/organizations';

export function useOrganizations({ enabled = true, ...params }: GetOrganizationsParams & { enabled?: boolean } = {}) {
  const listQuery = useQuery({
    queryKey: ['organizations', 'list', params],
    queryFn: () => getOrganizations(params),
    enabled,
    // keep the previous page on screen while the next one loads (no flash to empty)
    placeholderData: (prev) => prev,
  });

  return {
    organizations: listQuery.data?.data,
    pagination: {
      total: listQuery.data?.total || 0,
      page: listQuery.data?.page || 1,
      limit: listQuery.data?.limit || 10,
    },
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isError: listQuery.isError,
    error: listQuery.error as Error | null,
    refetch: listQuery.refetch,
  };
}

const invalidateOrgData = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['organizations'] });
  queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  queryClient.invalidateQueries({ queryKey: ['platformStats'] });
};

/**
 * Org-level actions that don't belong to one loaded organization (create, delete, restore,
 * bulk suspend). The list page uses this instead of instantiating useOrganizationDetail('')
 * three times just to reach a mutation.
 */
export function useOrganizationActions() {
  const queryClient = useQueryClient();
  const onSuccess = () => invalidateOrgData(queryClient);

  const create = useMutation({ mutationFn: createOrganization, onSuccess });
  const remove = useMutation({
    mutationFn: ({ orgId, reason }: { orgId: string; reason: string }) => deleteOrganization(orgId, reason),
    onSuccess,
  });
  const restore = useMutation({
    mutationFn: ({ orgId, reason }: { orgId: string; reason?: string }) => restoreOrganization(orgId, reason),
    onSuccess,
  });
  const bulkSuspend = useMutation({
    mutationFn: ({ orgIds, reason }: { orgIds: string[]; reason: string }) => bulkSuspendOrganizations(orgIds, reason),
    onSuccess,
  });

  return {
    createOrg: create.mutateAsync,
    isCreating: create.isPending,
    deleteOrg: remove.mutateAsync,
    isDeleting: remove.isPending,
    restoreOrg: restore.mutateAsync,
    isRestoring: restore.isPending,
    bulkSuspend: bulkSuspend.mutateAsync,
    isBulkSuspending: bulkSuspend.isPending,
  };
}

/** Institution-mode usage of one org. `enabled` lets a tab fetch only when it is opened. */
export function useOrgInstitution(orgId: string, enabled = true) {
  return useQuery({
    queryKey: ['organizations', 'institution', orgId],
    queryFn: () => getOrganizationInstitution(orgId),
    enabled: !!orgId && enabled,
  });
}

/** What each per-org feature flag does for this organization right now. */
export function useOrgFeatures(orgId: string, enabled = true) {
  return useQuery({
    queryKey: ['organizations', 'features', orgId],
    queryFn: () => getOrganizationFeatures(orgId),
    enabled: !!orgId && enabled,
  });
}

/** One page of an org's participants. `enabled` lets the tab fetch only when it is opened. */
export function useOrgParticipants(orgId: string, params: OrgParticipantsParams = {}, enabled = true) {
  return useQuery({
    queryKey: ['organizations', 'participants', orgId, params],
    queryFn: () => getOrganizationParticipants(orgId, params),
    enabled: !!orgId && enabled,
    placeholderData: (prev) => prev,
  });
}

export function useOrganizationDetail(orgId: string) {
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['organizations', 'detail', orgId],
    queryFn: () => getOrganizationDetail(orgId),
    enabled: !!orgId,
  });

  const contestsQuery = useQuery({
    queryKey: ['organizations', 'contests', orgId],
    queryFn: () => getOrganizationContests(orgId),
    enabled: !!orgId,
  });

  const membersQuery = useQuery({
    queryKey: ['organizations', 'members', orgId],
    queryFn: () => getOrganizationMembers(orgId),
    enabled: !!orgId,
  });

  const paymentsQuery = useQuery({
    queryKey: ['organizations', 'payments', orgId],
    queryFn: () => getOrganizationPayments(orgId),
    enabled: !!orgId,
  });

  const updateOrgMutation = useMutation({
    mutationFn: (data: { name?: string; logoUrl?: string | null }) => updateOrganization(orgId, data),
    onSuccess: () => invalidateOrgData(queryClient),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (reason: string) => deleteOrganization(orgId, reason),
    onSuccess: () => invalidateOrgData(queryClient),
  });

  const restoreOrgMutation = useMutation({
    mutationFn: () => restoreOrganization(orgId),
    onSuccess: () => invalidateOrgData(queryClient),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => suspendOrganization(orgId, reason),
    onSuccess: () => invalidateOrgData(queryClient),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateOrganization(orgId),
    onSuccess: () => invalidateOrgData(queryClient),
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: { authorName: string; body: string; tags: string[] }) =>
      addOrganizationNote(orgId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'detail', orgId] });
    }
  });

  const resendReceiptMutation = useMutation({
    mutationFn: (paymentId: string) => resendPaymentReceipt(orgId, paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  return {
    organization: detailQuery.data,
    contests: contestsQuery.data || [],
    members: membersQuery.data || [],
    payments: paymentsQuery.data || [],
    isLoading: detailQuery.isLoading || contestsQuery.isLoading,
    isLoadingDetails: detailQuery.isLoading,
    isLoadingMembers: membersQuery.isLoading,
    isLoadingPayments: paymentsQuery.isLoading,
    isError: detailQuery.isError,
    
    // Mutations
    updateOrg: updateOrgMutation.mutateAsync,
    isUpdating: updateOrgMutation.isPending,

    deleteOrg: deleteOrgMutation.mutateAsync,
    isDeleting: deleteOrgMutation.isPending,

    restoreOrg: restoreOrgMutation.mutateAsync,
    isRestoring: restoreOrgMutation.isPending,

    suspendOrg: suspendMutation.mutateAsync,
    isSuspending: suspendMutation.isPending,

    activateOrg: activateMutation.mutateAsync,
    isActivating: activateMutation.isPending,

    addNote: addNoteMutation.mutateAsync,
    isAddingNote: addNoteMutation.isPending,

    resendReceipt: resendReceiptMutation.mutateAsync,
    isResendingReceipt: resendReceiptMutation.isPending,
    // Which paymentId is currently in flight — lets the payments table show a
    // per-row spinner instead of disabling every "Resend" button at once.
    resendingReceiptPaymentId: resendReceiptMutation.isPending ? resendReceiptMutation.variables : undefined,
  };
}

/**
 * id → name for whichever organizations are visible on a page, in ONE request
 * (GET /organizations/names). Organizations live in the main DB, so lists of rows that only
 * carry an organizationId (messages, overrides, sync reports) resolve names through this.
 */
export function useOrganizationNames(organizationIds: string[]): Record<string, string> {
  const ids = Array.from(new Set(organizationIds)).filter(Boolean).sort();

  const { data } = useQuery({
    queryKey: ['organizations', 'names', ids],
    queryFn: () => getOrganizationNames(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return data ?? {};
}
