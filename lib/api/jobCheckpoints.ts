'use client';

import { ScheduledJobSummary, JobCheckpointStage } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

export interface GetScheduledJobsParams {
  page?: number;
  limit?: number;
  jobId?: string;
  requestId?: string;
  queue?: string;
  status?: string;
  organizationId?: string;
}

export interface PaginatedScheduledJobs {
  data: ScheduledJobSummary[];
  total: number;
  page: number;
  limit: number;
}

export async function getScheduledJobs(
  params: GetScheduledJobsParams = {}
): Promise<PaginatedScheduledJobs> {
  const query = new URLSearchParams();
  query.set('page', String(params.page || 1));
  query.set('limit', String(params.limit || 50));
  if (params.jobId) query.set('jobId', params.jobId);
  if (params.requestId) query.set('requestId', params.requestId);
  if (params.queue) query.set('queue', params.queue);
  if (params.status) query.set('status', params.status);
  if (params.organizationId) query.set('organizationId', params.organizationId);

  return apiRequest<PaginatedScheduledJobs>(`/api/v1/ops/job-checkpoints?${query.toString()}`);
}

export async function getJobTimeline(jobId: string): Promise<JobCheckpointStage[]> {
  return apiRequest<JobCheckpointStage[]>(`/api/v1/ops/job-checkpoints/${encodeURIComponent(jobId)}`);
}
