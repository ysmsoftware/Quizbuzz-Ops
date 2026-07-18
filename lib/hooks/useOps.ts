'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInfraStatus, getScalingConfig, getFeatureFlags, toggleFeatureFlag } from '@/lib/api/ops';

export function useOps() {
  const queryClient = useQueryClient();

  const infraQuery = useQuery({
    queryKey: ['ops', 'infra'],
    queryFn: getInfraStatus,
  });

  const scalingQuery = useQuery({
    queryKey: ['ops', 'scaling'],
    queryFn: getScalingConfig,
  });

  const flagsQuery = useQuery({
    queryKey: ['ops', 'flags'],
    queryFn: getFeatureFlags,
  });

  const toggleFlagMutation = useMutation({
    mutationFn: ({ key, isEnabled }: { key: string; isEnabled: boolean }) =>
      toggleFeatureFlag(key, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops', 'flags'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  return {
    infraStatus: infraQuery.data,
    isLoadingInfra: infraQuery.isLoading,
    scalingConfig: scalingQuery.data,
    isLoadingScaling: scalingQuery.isLoading,
    featureFlags: flagsQuery.data || [],
    isLoadingFlags: flagsQuery.isLoading,
    toggleFlag: toggleFlagMutation.mutateAsync,
    isToggling: toggleFlagMutation.isPending,
  };
}
