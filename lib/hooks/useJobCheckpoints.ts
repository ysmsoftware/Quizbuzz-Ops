'use client';

import { useQuery } from '@tanstack/react-query';
import { getScheduledJobs, GetScheduledJobsParams, getJobTimeline } from '@/lib/api/jobCheckpoints';

/** Mirrors useMainAppAuditLogs.ts — same shape, backs the "Job Timeline" tab's summary list. */
export function useScheduledJobs(filters: GetScheduledJobsParams = {}) {
  const query = useQuery({
    queryKey: ['scheduledJobs', 'list', filters],
    queryFn: () => getScheduledJobs(filters),
    placeholderData: (prev) => prev,
  });

  return {
    jobs: query.data?.data || [],
    pagination: {
      total: query.data?.total || 0,
      page: query.data?.page || filters.page || 1,
      limit: query.data?.limit || filters.limit || 50,
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** The per-stage waterfall behind one ScheduledJobSummary row. Only fetched when expanded. */
export function useJobTimeline(jobId: string | null) {
  const query = useQuery({
    queryKey: ['scheduledJobs', 'timeline', jobId],
    queryFn: () => getJobTimeline(jobId as string),
    enabled: !!jobId,
  });

  return {
    stages: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
