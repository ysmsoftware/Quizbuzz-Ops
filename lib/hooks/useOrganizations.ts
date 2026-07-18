'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getOrganizations,
  getOrganizationDetail,
  getOrganizationContests,
  suspendOrganization,
  activateOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  bulkSuspendOrganizations,
  addOrganizationNote,
  getOrganizationMembers,
  getOrganizationParticipants,
  getOrganizationPayments,
} from '@/lib/api/organizations';

export function useOrganizations(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  planId?: string;
} = {}) {
  const listQuery = useQuery({
    queryKey: ['organizations', 'list', params],
    queryFn: () => getOrganizations(params),
  });

  return {
    organizations: listQuery.data?.data,
    pagination: {
      total: listQuery.data?.total || 0,
      page: listQuery.data?.page || 1,
      limit: listQuery.data?.limit || 10,
    },
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
  };
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

  const participantsQuery = (contestId?: string) => {
    return useQuery({
      queryKey: ['organizations', 'participants', orgId, { contestId }],
      queryFn: () => getOrganizationParticipants(orgId, contestId),
      enabled: !!orgId,
    });
  };

  const paymentsQuery = useQuery({
    queryKey: ['organizations', 'payments', orgId],
    queryFn: () => getOrganizationPayments(orgId),
    enabled: !!orgId,
  });

  const createOrgMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
      queryClient.invalidateQueries({ queryKey: ['platformStats'] });
    }
  });

  const updateOrgMutation = useMutation({
    mutationFn: (data: { name: string; website: string; logoUrl: string; planId?: string }) => 
      updateOrganization(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    }
  });

  const deleteOrgMutation = useMutation({
    mutationFn: () => deleteOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
      queryClient.invalidateQueries({ queryKey: ['platformStats'] });
    }
  });

  const suspendMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => suspendOrganization(orgId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
      queryClient.invalidateQueries({ queryKey: ['platformStats'] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => activateOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
      queryClient.invalidateQueries({ queryKey: ['platformStats'] });
    },
  });

  const bulkSuspendMutation = useMutation({
    mutationFn: ({ orgIds, reason }: { orgIds: string[]; reason: string }) => 
      bulkSuspendOrganizations(orgIds, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
      queryClient.invalidateQueries({ queryKey: ['platformStats'] });
    }
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: { authorName: string; body: string; tags: string[] }) => 
      addOrganizationNote(orgId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'detail', orgId] });
    }
  });

  return {
    organization: detailQuery.data,
    contests: contestsQuery.data || [],
    members: membersQuery.data || [],
    payments: paymentsQuery.data || [],
    useParticipants: participantsQuery,
    isLoading: detailQuery.isLoading || contestsQuery.isLoading,
    isLoadingDetails: detailQuery.isLoading,
    isLoadingMembers: membersQuery.isLoading,
    isLoadingPayments: paymentsQuery.isLoading,
    isError: detailQuery.isError,
    
    // Mutations
    createOrg: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
    
    updateOrg: updateOrgMutation.mutateAsync,
    isUpdating: updateOrgMutation.isPending,
    
    deleteOrg: deleteOrgMutation.mutateAsync,
    isDeleting: deleteOrgMutation.isPending,
    
    suspendOrg: suspendMutation.mutateAsync,
    isSuspending: suspendMutation.isPending,
    
    activateOrg: activateMutation.mutateAsync,
    isActivating: activateMutation.isPending,
    
    bulkSuspend: bulkSuspendMutation.mutateAsync,
    isBulkSuspending: bulkSuspendMutation.isPending,
    
    addNote: addNoteMutation.mutateAsync,
    isAddingNote: addNoteMutation.isPending,
  };
}
