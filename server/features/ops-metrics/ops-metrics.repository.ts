import { env } from '../../config/env';
import { AppError } from '../../http/errors';
import { FleetSnapshot, LiveContestSummary, ContestLiveSnapshot } from './ops-metrics.types';

/**
 * Server-to-server HTTP client for the main app's /api/v1/ops/metrics/*
 * endpoints, mirroring the shared-secret pattern the main app's own
 * ops-metrics-auth.middleware.ts implements (x-ops-metrics-secret header,
 * not a query param, so it never lands in access logs). This is the FIRST
 * HTTP-based main-app integration in this codebase — every other
 * "read main app data" feature (audit-log-main-app, job-checkpoints) reads
 * the main app's Postgres directly over queryMainDb(). That path doesn't
 * work here: per-instance ASG process metrics (heap, active WS
 * connections, drain state) only exist in each running Node process's own
 * memory / the shared Redis fan-in the main app aggregates — there's no
 * table for it. Hence a real fetch() to the main app's own aggregation
 * endpoint instead.
 */
class OpsMetricsFetchError extends AppError {
  constructor(message: string, status = 502) {
    super(message, 'OPS_METRICS_UPSTREAM_ERROR', status);
  }
}

async function callMainApp<T>(path: string): Promise<T> {
  if (!env.OPS_METRICS_SECRET) {
    throw new OpsMetricsFetchError('OPS_METRICS_SECRET is not configured on this deployment', 500);
  }

  const url = `${env.MAIN_APP_FRONTEND_URL.replace(/\/$/, '')}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'x-ops-metrics-secret': env.OPS_METRICS_SECRET },
      // Live fleet/contest state — never serve a stale cached copy.
      cache: 'no-store',
    });
  } catch (err) {
    throw new OpsMetricsFetchError(
      `Could not reach main app metrics endpoint (${url}): ${err instanceof Error ? err.message : 'network error'}`
    );
  }

  const body: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new OpsMetricsFetchError(
      `Main app metrics endpoint returned ${response.status}: ${body?.message || response.statusText}`,
      response.status === 401 || response.status === 403 ? 502 : response.status
    );
  }

  if (body?.success === false) {
    throw new OpsMetricsFetchError(body?.message || 'Main app metrics endpoint reported failure');
  }

  return (body?.success ? body.data : body) as T;
}

export interface IOpsMetricsRepository {
  getFleetSnapshot(): Promise<FleetSnapshot>;
  listLiveContests(): Promise<LiveContestSummary[]>;
  getContestSnapshot(contestId: string): Promise<ContestLiveSnapshot>;
}

export class OpsMetricsRepository implements IOpsMetricsRepository {
  getFleetSnapshot(): Promise<FleetSnapshot> {
    return callMainApp<FleetSnapshot>('/api/v1/ops/metrics/fleet');
  }

  listLiveContests(): Promise<LiveContestSummary[]> {
    return callMainApp<LiveContestSummary[]>('/api/v1/ops/metrics/contests');
  }

  getContestSnapshot(contestId: string): Promise<ContestLiveSnapshot> {
    return callMainApp<ContestLiveSnapshot>(`/api/v1/ops/metrics/contests/${encodeURIComponent(contestId)}`);
  }
}
export default OpsMetricsRepository;
