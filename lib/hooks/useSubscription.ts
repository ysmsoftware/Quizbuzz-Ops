'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getOrganizationSubscription,
  changeOrganizationPlan,
  addSubscriptionOverride,
  removeSubscriptionOverride,
  getPlanChangeHistory,
  getUsageSnapshot
} from '@/lib/api/organizations';
import { SubscriptionOverride } from '@/lib/types';

export function useSubscription(orgId: string) {
  const queryClient = useQueryClient();

  const subQuery = useQuery({
    queryKey: ['organizations', 'subscription', orgId],
    queryFn: () => getOrganizationSubscription(orgId),
    enabled: !!orgId,
  });

  const historyQuery = useQuery({
    queryKey: ['organizations', 'history', orgId],
    queryFn: () => getPlanChangeHistory(orgId),
    enabled: !!orgId,
  });

  const usageQuery = useQuery({
    queryKey: ['organizations', 'usage', orgId, subQuery.data?.id],
    queryFn: () => getUsageSnapshot(orgId, subQuery.data!),
    enabled: !!orgId && !!subQuery.data,
  });

  const changePlanMutation = useMutation({
    mutationFn: ({ planId, adminName }: { planId: string; adminName: string }) =>
      changeOrganizationPlan(orgId, planId, adminName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    }
  });

  const addOverrideMutation = useMutation({
    mutationFn: (override: Omit<SubscriptionOverride, 'id' | 'createdAt'>) =>
      addSubscriptionOverride(orgId, override),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'subscription', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organizations', 'usage', orgId] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    }
  });

  const removeOverrideMutation = useMutation({
    mutationFn: ({ overrideId, reason, adminName }: { overrideId: string; reason: string; adminName: string }) =>
      removeSubscriptionOverride(orgId, overrideId, reason, adminName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'subscription', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organizations', 'usage', orgId] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    }
  });

  return {
    subscription: subQuery.data || null,
    isSubLoading: subQuery.isLoading,
    history: historyQuery.data || [],
    isHistoryLoading: historyQuery.isLoading,
    usage: usageQuery.data || null,
    isUsageLoading: usageQuery.isLoading,

    changePlan: changePlanMutation.mutateAsync,
    isChangingPlan: changePlanMutation.isPending,

    addOverride: addOverrideMutation.mutateAsync,
    isAddingOverride: addOverrideMutation.isPending,

    removeOverride: removeOverrideMutation.mutateAsync,
    isRemovingOverride: removeOverrideMutation.isPending,
  };
}
