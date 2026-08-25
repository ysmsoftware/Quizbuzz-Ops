import { queryMainDb } from '../../db/main-db-pool';
import { JobCheckpointListQuery } from './job-checkpoints.types';

export interface IJobCheckpointsRepository {
  listScheduledJobs(params: JobCheckpointListQuery): Promise<{ rows: any[]; total: number }>;
  listCheckpointsForJob(jobId: string): Promise<any[]>;
}

/**
 * Read-only — queries the main app's own `scheduled_jobs` and
 * `job_checkpoints` tables over the existing cross-DB pool (queryMainDb),
 * same pattern audit-log-main-app.repository.ts already uses. This app
 * never writes to either table — both are populated by the main app's
 * checkpoint-drain worker (Quizbuzz-new/backend/src/workers/checkpoint-drain.worker.ts),
 * batched out of Redis, not written per-event.
 *
 * scheduled_jobs has no requestId column (it's a per-job SUMMARY row) — the
 * requestId filter goes through job_checkpoints via a subquery, since that's
 * where requestId actually lives, one row per stage.
 */
export class JobCheckpointsRepository implements IJobCheckpointsRepository {
  async listScheduledJobs(params: JobCheckpointListQuery) {
    const { page, limit, jobId, requestId, queue, status, organizationId } = params;

    const conditions: string[] = ['1=1'];
    const sqlParams: any[] = [];
    const addParam = (value: any) => {
      sqlParams.push(value);
      return `$${sqlParams.length}`;
    };

    if (jobId) conditions.push(`"bullJobId" = ${addParam(jobId)}`);
    if (queue) conditions.push(`"queue" = ${addParam(queue)}`);
    if (status) conditions.push(`"status" = ${addParam(status)}::"JobStatus"`);
    if (organizationId) conditions.push(`"organizationId" = ${addParam(organizationId)}`);
    if (requestId) {
      conditions.push(
        `"bullJobId" IN (SELECT DISTINCT "jobId" FROM job_checkpoints WHERE "requestId" = ${addParam(requestId)})`
      );
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `SELECT COUNT(*)::int as count FROM scheduled_jobs WHERE ${whereClause}`;
    const dataQuery = `
      SELECT id, "organizationId", "contestId", "bullJobId", queue, name, status,
        "scheduledFor", "startedAt", "completedAt", "failedAt", error, "retryCount", "createdAt"
      FROM scheduled_jobs
      WHERE ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    const [countResult, dataResult] = await Promise.all([
      queryMainDb(countQuery, sqlParams),
      queryMainDb(dataQuery, sqlParams),
    ]);

    return { rows: dataResult, total: countResult[0]?.count || 0 };
  }

  async listCheckpointsForJob(jobId: string) {
    return queryMainDb(
      `SELECT id, "jobId", queue, "requestId", "entityType", "entityId", stage, status,
        "startedAt", "endedAt", "durationMs", "createdAt"
       FROM job_checkpoints
       WHERE "jobId" = $1
       ORDER BY "startedAt" ASC`,
      [jobId]
    );
  }
}
export default JobCheckpointsRepository;
