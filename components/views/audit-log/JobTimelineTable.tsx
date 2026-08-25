'use client';

import React, { useState } from 'react';
import { useScheduledJobs, useJobTimeline } from '@/lib/hooks/useJobCheckpoints';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { format } from 'date-fns';
import {
  Timer,
  Search,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Link2,
  Hash,
  Clock,
} from 'lucide-react';
import { ScheduledJobSummary } from '@/lib/types';

const PAGE_SIZE = 50;

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/10 text-emerald-600',
  FAILED: 'bg-rose-500/10 text-rose-600',
  ACTIVE: 'bg-blue-500/10 text-blue-600',
  WAITING: 'bg-amber-500/10 text-amber-600',
  DELAYED: 'bg-amber-500/10 text-amber-600',
};

/**
 * The "Job Timeline" tab — deliberately separate from the Security Audit
 * Ledger (see AuditLogView.tsx). That ledger is a small, durable, business
 * event trail; this is high-volume, eventually-consistent operational
 * timing data (per-stage checkpoints, batched out of Redis by the main
 * app's checkpoint-drain worker every ~10min, or sooner under load — see
 * Quizbuzz-new/backend/src/workers/checkpoint-drain.worker.ts). Never
 * written synchronously per job, so this view can lag live activity by
 * that window — by design, to keep certificate/quiz workloads unaffected
 * by logging.
 */
export default function JobTimelineTable({ initialRequestId }: { initialRequestId?: string }) {
  const [page, setPage] = useState(1);
  const [jobIdFilter, setJobIdFilter] = useState('');
  const [requestIdFilter, setRequestIdFilter] = useState(initialRequestId ?? '');
  const [queueFilter, setQueueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const debouncedJobId = useDebouncedValue(jobIdFilter, 400);
  const debouncedRequestId = useDebouncedValue(requestIdFilter, 400);
  const debouncedQueue = useDebouncedValue(queueFilter, 400);

  const { jobs, pagination, isLoading, isFetching, isError } = useScheduledJobs({
    page,
    limit: PAGE_SIZE,
    jobId: debouncedJobId || undefined,
    requestId: debouncedRequestId || undefined,
    queue: debouncedQueue || undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const rangeStart = pagination.total === 0 ? 0 : (page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(page * pagination.limit, pagination.total);

  const toggleExpand = (bullJobId: string) => {
    setExpandedJobId((current) => (current === bullJobId ? null : bullJobId));
  };

  const hasActiveFilters = jobIdFilter || requestIdFilter || queueFilter || statusFilter !== 'ALL';
  const clearFilters = () => {
    setJobIdFilter('');
    setRequestIdFilter('');
    setQueueFilter('');
    setStatusFilter('ALL');
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border/40 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">Job Timeline</h3>
            <p className="text-xs text-muted-foreground">
              Per-stage timing for background jobs (certificates, submissions, evaluations, messages) — refreshes every ~10 minutes, kept separate from the audit trail so live workloads are never slowed down by logging.
              {isFetching && !isLoading && (
                <span className="inline-flex items-center gap-1 ml-2 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> refreshing…
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Hash className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={jobIdFilter}
              onChange={(e) => { setJobIdFilter(e.target.value); setPage(1); }}
              placeholder="Job ID..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-mono"
            />
          </div>

          <div className="relative">
            <Link2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={requestIdFilter}
              onChange={(e) => { setRequestIdFilter(e.target.value); setPage(1); }}
              placeholder="Request ID..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-mono"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={queueFilter}
              onChange={(e) => { setQueueFilter(e.target.value); setPage(1); }}
              placeholder="Queue (e.g. certificate-queue)..."
              className="pl-9 h-9 w-52 sm:w-60 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-mono"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-9 px-2 text-[11px] font-sans bg-secondary/10 border border-border/40 rounded-lg focus:outline-none text-muted-foreground"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="WAITING">Waiting</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="h-9 px-3 text-[11px] font-semibold rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-all cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
            Querying job timeline...
          </div>
        ) : isError ? (
          <div className="py-16 text-center">
            <p className="text-xs font-semibold text-rose-500">Failed to load job timing data.</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center">
            <Timer className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">No jobs recorded for the selected query</p>
            <p className="text-[10px] text-muted-foreground/80 mt-0.5">
              Timing data can lag ~10 minutes behind live activity, or up to 15 under load — try a wider search or check back shortly.
            </p>
          </div>
        ) : (
          <div className="max-h-[820px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-secondary/90 backdrop-blur text-muted-foreground border-b border-border/40">
                  <th className="py-3 px-5 font-semibold">Created</th>
                  <th className="py-3 px-5 font-semibold">Queue / Job</th>
                  <th className="py-3 px-5 font-semibold">Status</th>
                  <th className="py-3 px-5 font-semibold">Queue Wait</th>
                  <th className="py-3 px-5 font-semibold">Processing</th>
                  <th className="py-3 px-5 font-semibold">Total</th>
                  <th className="py-3 px-5 font-semibold text-center">Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {jobs.map((job: ScheduledJobSummary) => {
                  const isExpanded = expandedJobId === job.bullJobId;
                  return (
                    <React.Fragment key={job.id}>
                      <tr
                        className={`hover:bg-secondary/10 transition-all cursor-pointer ${isExpanded ? 'bg-secondary/15' : ''}`}
                        onClick={() => job.bullJobId && toggleExpand(job.bullJobId)}
                      >
                        <td className="py-2.5 px-5 font-mono text-[11px] text-muted-foreground shrink-0">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/80" />
                            <span>{format(new Date(job.createdAt), 'dd MMM yyyy, HH:mm:ss')}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-5">
                          <span className="font-semibold text-foreground block">{job.queue}</span>
                          <span className="text-[9px] font-mono text-muted-foreground/80 block mt-0.5">{job.name}</span>
                        </td>
                        <td className="py-2.5 px-5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-tight ${STATUS_STYLE[job.status] ?? 'bg-secondary/40 text-muted-foreground'}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-5 font-mono text-[11px] text-muted-foreground">{formatMs(job.queueWaitMs)}</td>
                        <td className="py-2.5 px-5 font-mono text-[11px] text-muted-foreground">{formatMs(job.processingMs)}</td>
                        <td className="py-2.5 px-5 font-mono text-[11px] font-semibold text-foreground">{formatMs(job.totalMs)}</td>
                        <td className="py-2.5 px-5 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); job.bullJobId && toggleExpand(job.bullJobId); }}
                            className="p-1.5 rounded-md hover:bg-card border border-transparent hover:border-border/40 text-muted-foreground hover:text-foreground transition-all shrink-0 cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && job.bullJobId && (
                        <tr>
                          <td colSpan={7} className="bg-secondary/10 p-5 border-t border-b border-border/40">
                            <JobWaterfall jobId={job.bullJobId} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && !isError && jobs.length > 0 && (
        <div className="p-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground font-mono">
            Showing <span className="text-foreground font-semibold">{rangeStart}-{rangeEnd}</span> of{' '}
            <span className="text-foreground font-semibold">{pagination.total.toLocaleString()}</span> jobs
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev</span>
            </button>
            <span className="text-[11px] font-mono text-muted-foreground px-2">
              Page <span className="text-foreground font-semibold">{page}</span> of{' '}
              <span className="text-foreground font-semibold">{totalPages}</span>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The waterfall — one bar per stage, positioned/sized proportionally to the job's own span. */
function JobWaterfall({ jobId }: { jobId: string }) {
  const { stages, isLoading, isError } = useJobTimeline(jobId);

  if (isLoading) {
    return <div className="text-[11px] text-muted-foreground font-mono py-4 text-center animate-pulse">Loading timeline…</div>;
  }
  if (isError) {
    return <div className="text-[11px] text-rose-500 font-mono py-4 text-center">Failed to load timeline.</div>;
  }
  if (stages.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground font-mono py-4 text-center">
        No per-stage checkpoints recorded yet for this job — either it hasn't reached an instrumented worker step, or the drain worker hasn't flushed it from Redis yet.
      </div>
    );
  }

  const minStart = Math.min(...stages.map((s) => new Date(s.startedAt).getTime()));
  const maxEnd = Math.max(...stages.map((s) => new Date(s.endedAt).getTime()));
  const totalSpan = Math.max(1, maxEnd - minStart);

  return (
    <div className="bg-slate-950 text-slate-200 p-4 rounded-lg border border-border/60 shadow-inner font-mono text-xs space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[10px] text-slate-400">
        <span>JOB {jobId} — {stages.length} stage{stages.length === 1 ? '' : 's'}</span>
        <span>SPAN: {formatMs(totalSpan)}</span>
      </div>

      <div className="space-y-2.5 py-1">
        {stages.map((stage) => {
          const start = new Date(stage.startedAt).getTime();
          const offsetPct = ((start - minStart) / totalSpan) * 100;
          const widthPct = Math.max(0.5, (stage.durationMs / totalSpan) * 100);
          const barColor = stage.status === 'ERROR' ? 'bg-rose-500' : 'bg-indigo-400';

          return (
            <div key={stage.id} className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-300">
                <span className="font-semibold">{stage.stage}</span>
                <span className={stage.status === 'ERROR' ? 'text-rose-400' : 'text-slate-400'}>
                  {formatMs(stage.durationMs)}{stage.status === 'ERROR' ? ' · ERROR' : ''}
                </span>
              </div>
              <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`absolute h-full rounded-full ${barColor}`}
                  style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                  title={`${stage.stage}: ${formatMs(stage.durationMs)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
