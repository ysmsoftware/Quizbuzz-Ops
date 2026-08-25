import { IJobCheckpointsRepository, JobCheckpointsRepository } from './job-checkpoints.repository';
import {
  JobCheckpointListQuery,
  ScheduledJobListResult,
  ScheduledJobSummaryResponse,
  JobCheckpointStageResponse,
} from './job-checkpoints.types';

export interface IJobCheckpointsService {
  listScheduledJobs(params: JobCheckpointListQuery): Promise<ScheduledJobListResult>;
  getJobTimeline(jobId: string): Promise<JobCheckpointStageResponse[]>;
}

function diffMs(a: string | Date | null, b: string | Date | null): number | null {
  if (!a || !b) return null;
  return new Date(b).getTime() - new Date(a).getTime();
}

export class JobCheckpointsService implements IJobCheckpointsService {
  constructor(private repo: IJobCheckpointsRepository = new JobCheckpointsRepository()) {}

  async listScheduledJobs(params: JobCheckpointListQuery): Promise<ScheduledJobListResult> {
    const { rows, total } = await this.repo.listScheduledJobs(params);

    const data: ScheduledJobSummaryResponse[] = rows.map((r) => {
      const createdAt = r.createdAt ? new Date(r.createdAt).toISOString() : new Date(0).toISOString();
      const startedAt = r.startedAt ? new Date(r.startedAt).toISOString() : null;
      const completedAt = r.completedAt ? new Date(r.completedAt).toISOString() : null;
      const failedAt = r.failedAt ? new Date(r.failedAt).toISOString() : null;
      const terminalAt = completedAt ?? failedAt;

      return {
        id: r.id,
        organizationId: r.organizationId,
        contestId: r.contestId ?? null,
        bullJobId: r.bullJobId ?? null,
        queue: r.queue,
        name: r.name,
        status: r.status,
        scheduledFor: r.scheduledFor ? new Date(r.scheduledFor).toISOString() : null,
        startedAt,
        completedAt,
        failedAt,
        error: r.error ?? null,
        retryCount: r.retryCount ?? 0,
        createdAt,
        // Queue wait = time sitting in the queue before a worker picked it up.
        queueWaitMs: diffMs(createdAt, startedAt),
        // Processing = time actually being worked on, once picked up.
        processingMs: diffMs(startedAt, terminalAt),
        // Total = the whole lifecycle, queue wait + processing.
        totalMs: diffMs(createdAt, terminalAt),
      };
    });

    return { data, total, page: params.page, limit: params.limit };
  }

  async getJobTimeline(jobId: string): Promise<JobCheckpointStageResponse[]> {
    const rows = await this.repo.listCheckpointsForJob(jobId);
    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      queue: r.queue,
      requestId: r.requestId ?? null,
      entityType: r.entityType ?? null,
      entityId: r.entityId ?? null,
      stage: r.stage,
      status: r.status,
      startedAt: new Date(r.startedAt).toISOString(),
      endedAt: new Date(r.endedAt).toISOString(),
      durationMs: r.durationMs,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }
}
export default JobCheckpointsService;
