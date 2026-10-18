'use client';

import { useQuery } from '@tanstack/react-query';
import { getInfraStatus, getScalingConfig } from '@/lib/api/ops';

/**
 * Infra & Cost page data only (currently mock, see lib/data/mock-infra.ts). Feature flags live in
 * useFeatureFlags — the app shell used to call this hook and so loaded the mock infra data
 * on every page just to read one flag.
 */
export function useOps() {
  const infraQuery = useQuery({ queryKey: ['ops', 'infra'], queryFn: getInfraStatus });
  const scalingQuery = useQuery({ queryKey: ['ops', 'scaling'], queryFn: getScalingConfig });

  return {
    infraStatus: infraQuery.data,
    isLoadingInfra: infraQuery.isLoading,
    scalingConfig: scalingQuery.data,
    isLoadingScaling: scalingQuery.isLoading,
  };
}
