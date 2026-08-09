'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInfraStatus, getScalingConfig, getFeatureFlags, toggleFeatureFlag } from '@/lib/api/ops';
import { FeatureFlag } from '@/lib/types';

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
    onMutate: async ({ key, isEnabled }) => {
      await queryClient.cancelQueries({ queryKey: ['ops', 'flags'] });
      const previous = queryClient.getQueryData<FeatureFlag[]>(['ops', 'flags']);
      queryClient.setQueryData<FeatureFlag[]>(['ops', 'flags'], (old) =>
        old?.map((f) => (f.key === key ? { ...f, isEnabled } : f))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['ops', 'flags'], context.previous);
    },
    onSettled: () => {
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
