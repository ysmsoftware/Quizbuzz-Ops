export interface JobCheckpointListQuery {
  page: number;
  limit: number;
  jobId?: string;
  requestId?: string;
  queue?: string;
  status?: string;
  organizationId?: string;
}

export interface ScheduledJobSummaryResponse {
  id: string;
  organizationId: string;
  contestId: string | null;
  bullJobId: string | null;
  queue: string;
  name: string;
  status: string;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  error: string | null;
  retryCount: number;
  createdAt: string;
  // Derived — null when the relevant timestamp isn't set yet (job still queued/running).
  queueWaitMs: number | null;
  processingMs: number | null;
  totalMs: number | null;
}

export interface ScheduledJobListResult {
  data: ScheduledJobSummaryResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface JobCheckpointStageResponse {
  id: string;
  jobId: string;
  queue: string;
  requestId: string | null;
  entityType: string | null;
  entityId: string | null;
  stage: string;
  status: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  createdAt: string;
}
