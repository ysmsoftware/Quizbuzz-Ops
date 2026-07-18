'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlans, updateSubscriptionPlan, createSubscriptionPlan } from '@/lib/api/plans';
import { SubscriptionPlan } from '@/lib/types';

export function usePlans() {
  const queryClient = useQueryClient();

  const plansQuery = useQuery({
    queryKey: ['plans', 'list'],
    queryFn: getPlans,
  });

  const createPlanMutation = useMutation({
    mutationFn: (newPlan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt' | 'priceINR' | 'interval'>) =>
      createSubscriptionPlan(newPlan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ planId, updates }: { planId: string; updates: Partial<SubscriptionPlan> }) =>
      updateSubscriptionPlan(planId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  return {
    plans: plansQuery.data || [],
    isLoading: plansQuery.isLoading,
    isError: plansQuery.isError,
    createPlan: createPlanMutation.mutateAsync,
    isCreating: createPlanMutation.isPending,
    updatePlan: updatePlanMutation.mutateAsync,
    isUpdating: updatePlanMutation.isPending,
  };
}
