'use client';

import { useQuery } from '@tanstack/react-query';
import { getPlatformStats } from '@/lib/api/overview';

export function usePlatformStats() {
  const query = useQuery({
    queryKey: ['platformStats'],
    queryFn: () => getPlatformStats(),
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
