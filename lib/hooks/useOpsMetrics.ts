'use client';

import { useQuery } from '@tanstack/react-query';
import { getOpsFleetSnapshot, getOpsLiveContests, getOpsContestSnapshot } from '@/lib/api/opsMetrics';

/**
 * Fleet-wide heartbeat rollup (every reporting backend/worker instance,
 * idle admin box or ASG fleet alike). Polled aggressively — this is the
 * view meant to be left open on a second monitor while a load test runs.
 */
export function useOpsFleetSnapshot(pollingMs: number = 5000) {
  const query = useQuery({
    queryKey: ['opsMetrics', 'fleet'],
    queryFn: getOpsFleetSnapshot,
    refetchInterval: pollingMs,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });

  return {
    fleet: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // Timestamp of the last successful fetch — a stable value to compare
    // instance.reportedAt against for "is this instance's heartbeat stale"
    // instead of calling Date.now() during render (React Compiler flags
    // that as an impure render, see components/views/OpsMetricsView.tsx).
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

/** Contests currently LIVE / REGISTRATION_CLOSED — the picker for the per-contest view below. Low churn, polled gently. */
export function useOpsLiveContests() {
  const query = useQuery({
    queryKey: ['opsMetrics', 'contests'],
    queryFn: getOpsLiveContests,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });

  return {
    contests: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Per-contest live Redis snapshot (counts + participant rows). Only polls while a contestId is selected. */
export function useOpsContestSnapshot(contestId: string | null, pollingMs: number = 3000) {
  const query = useQuery({
    queryKey: ['opsMetrics', 'contest', contestId],
    queryFn: () => getOpsContestSnapshot(contestId as string),
    enabled: !!contestId,
    refetchInterval: contestId ? pollingMs : false,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });

  return {
    snapshot: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}
