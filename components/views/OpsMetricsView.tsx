'use client';

import React, { useState, useMemo } from 'react';
import {
  Activity,
  Server,
  Cpu,
  Wifi,
  RefreshCw,
  AlertTriangle,
  Users,
  Clock,
  ShieldAlert,
  CircleDot,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useOpsFleetSnapshot, useOpsLiveContests, useOpsContestSnapshot } from '@/lib/hooks/useOpsMetrics';
import { OpsInstanceHeartbeat, OpsLiveParticipantRow } from '@/lib/types';

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'text-primary',
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border/40 rounded-xl p-5 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${accent}`} />
          {label}
        </span>
      </div>
      <span className="text-2xl font-black font-mono text-foreground">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function errMessage(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

function safeAgo(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return 'unknown';
  }
}

function InstanceRow({ instance, nowMs }: { instance: OpsInstanceHeartbeat; nowMs: number }) {
  const stale = (() => {
    try {
      return nowMs - parseISO(instance.reportedAt).getTime() > 30000;
    } catch {
      return false;
    }
  })();

  return (
    <tr className="border-b border-border/30 last:border-0 hover:bg-secondary/20 transition-colors">
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shrink-0 ${stale ? 'bg-muted-foreground/40' : 'bg-emerald-500 animate-pulse'}`} />
          <span className="font-mono text-xs font-semibold text-foreground truncate max-w-[160px]" title={instance.instanceId}>
            {instance.instanceId}
          </span>
        </div>
      </td>
      <td className="py-3 px-3">
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
            instance.role === 'backend' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-500'
          }`}
        >
          {instance.role}
        </span>
      </td>
      <td className="py-3 px-3 text-xs font-mono text-muted-foreground">{Math.round(instance.uptimeSec / 60)}m</td>
      <td className="py-3 px-3">
        {instance.ws ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-foreground">
              {instance.ws.activeConnections.toLocaleString()}
              <span className="text-muted-foreground font-normal"> / {instance.ws.maxConnections.toLocaleString()}</span>
            </span>
            {instance.ws.draining && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">draining</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                instance.memory.heapUsedPct >= 85 ? 'bg-red-500' : instance.memory.heapUsedPct >= 65 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(100, instance.memory.heapUsedPct)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground w-9 text-right">{instance.memory.heapUsedPct}%</span>
        </div>
      </td>
      <td className="py-3 px-3 text-xs font-mono text-muted-foreground">{instance.memory.rssMb} MB</td>
      <td className="py-3 px-3 text-xs font-mono text-muted-foreground">{instance.memory.heapUsedMb} / {instance.memory.heapLimitMb} MB</td>
      <td className="py-3 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{safeAgo(instance.reportedAt)}</td>
    </tr>
  );
}

const PHASE_STYLES: Record<string, string> = {
  AUTHENTICATING: 'bg-secondary text-muted-foreground',
  WAITING: 'bg-amber-500/10 text-amber-500',
  IN_QUIZ: 'bg-emerald-500/10 text-emerald-500',
  SUBMITTED: 'bg-primary/10 text-primary',
  DISCONNECTED: 'bg-red-500/10 text-red-500',
};

function ParticipantRow({ p }: { p: OpsLiveParticipantRow }) {
  return (
    <tr className="border-b border-border/30 last:border-0 hover:bg-secondary/20 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.isAlive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
          <span className="text-xs font-semibold text-foreground truncate max-w-[160px]" title={p.name}>{p.name}</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PHASE_STYLES[p.phase] || 'bg-secondary text-muted-foreground'}`}>
          {p.phase.replace('_', ' ')}
        </span>
      </td>
      <td className="py-2.5 px-3 text-xs font-mono text-muted-foreground">
        {p.currentQuestionIndex} / {p.totalQuestions}
        <span className="text-muted-foreground/60"> ({p.answeredCount} ans)</span>
      </td>
      <td className="py-2.5 px-3">
        {p.violationCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500">
            <ShieldAlert className="h-3 w-3" />
            {p.violationCount}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">0</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs font-mono text-muted-foreground">{p.trustScore}</td>
      <td className="py-2.5 px-3">
        {p.isFlagged && (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">flagged</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{safeAgo(p.lastActivityAt)}</td>
    </tr>
  );
}

export default function OpsMetricsView() {
  const [pollingMs, setPollingMs] = useState(5000);
  const {
    fleet,
    isLoading: isLoadingFleet,
    isError: isFleetError,
    error: fleetError,
    isFetching: isFetchingFleet,
    refetch: refetchFleet,
    dataUpdatedAt: fleetUpdatedAt,
  } = useOpsFleetSnapshot(pollingMs);
  const { contests, isLoading: isLoadingContests } = useOpsLiveContests();
  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const { snapshot, isLoading: isLoadingSnapshot, isError: isSnapshotError, error: snapshotError, isFetching: isFetchingSnapshot } =
    useOpsContestSnapshot(selectedContestId, 3000);

  const backendInstances = useMemo(() => fleet?.instances.filter((i) => i.role === 'backend') ?? [], [fleet]);
  const workerInstances = useMemo(() => fleet?.instances.filter((i) => i.role === 'worker') ?? [], [fleet]);

  const selectedContest = contests.find((c) => c.contestId === selectedContestId);

  return (
    <div className="space-y-8 font-sans max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-primary" />
            Live Operational Metrics
          </h1>
          <p className="text-sm text-muted-foreground">
            Real per-instance and per-contest numbers, read straight from the main app via a shared-Redis heartbeat fan-in — not estimates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            id="ops-metrics-polling-select"
            value={pollingMs}
            onChange={(e) => setPollingMs(Number(e.target.value))}
            className="text-xs font-semibold bg-secondary/30 border border-border/40 rounded-md px-2.5 py-1.5 text-foreground cursor-pointer"
            title="Fleet snapshot poll interval — lower during an active load test, higher otherwise"
          >
            <option value={2000}>Poll: 2s</option>
            <option value={5000}>Poll: 5s</option>
            <option value={10000}>Poll: 10s</option>
            <option value={30000}>Poll: 30s</option>
          </select>
          <button
            id="ops-metrics-refresh-btn"
            onClick={() => refetchFleet()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetchingFleet ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {isFleetError && (
        <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-sm">
          <AlertTriangle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-red-500 block">Could not reach the main app&apos;s metrics endpoint</span>
            <span className="text-xs text-muted-foreground">
              {errMessage(fleetError) || 'Check MAIN_APP_FRONTEND_URL / OPS_METRICS_SECRET in the ops app environment.'}
            </span>
          </div>
        </div>
      )}

      {/* Fleet totals */}
      {isLoadingFleet && !fleet ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-card rounded-xl border border-border/30" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatTile
            icon={Server}
            label="Reporting Instances"
            value={fleet?.reportingInstances ?? 0}
            sub={`${backendInstances.length} backend · ${workerInstances.length} worker`}
          />
          <StatTile
            icon={Wifi}
            label="Active WS Connections"
            value={(fleet?.totals.activeConnections ?? 0).toLocaleString()}
            sub="fleet-wide, summed across backend instances"
            accent="text-emerald-500"
          />
          <StatTile
            icon={Cpu}
            label="Total RSS"
            value={`${(fleet?.totals.rssMb ?? 0).toLocaleString()} MB`}
            sub="resident memory, summed across all processes"
          />
          <StatTile
            icon={Timer}
            label="Total Heap Used"
            value={`${(fleet?.totals.heapUsedMb ?? 0).toLocaleString()} MB`}
            sub="V8 heap, summed across all processes"
          />
        </div>
      )}

      {/* Per-instance table */}
      <div className="bg-card border border-border/40 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Per-Instance Fleet Detail
          </h3>
          <span className="text-[10px] text-muted-foreground font-mono">
            {fleet ? `${fleet.instances.length} heartbeats` : '—'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                <th className="py-2.5 px-3">Instance</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Uptime</th>
                <th className="py-2.5 px-3">WS Connections</th>
                <th className="py-2.5 px-3">Heap Used</th>
                <th className="py-2.5 px-3">RSS</th>
                <th className="py-2.5 px-3">Heap / Limit</th>
                <th className="py-2.5 px-3">Last Report</th>
              </tr>
            </thead>
            <tbody>
              {fleet && fleet.instances.length > 0 ? (
                fleet.instances.map((i) => <InstanceRow key={`${i.instanceId}:${i.role}`} instance={i} nowMs={fleetUpdatedAt} />)
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                    {isLoadingFleet ? 'Loading fleet snapshot…' : 'No instances have reported a heartbeat yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-contest live snapshot */}
      <div className="bg-card border border-border/40 rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border/40">
          <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Per-Contest Live Snapshot
          </h3>
          <select
            id="ops-metrics-contest-select"
            value={selectedContestId ?? ''}
            onChange={(e) => setSelectedContestId(e.target.value || null)}
            className="text-xs font-semibold bg-secondary/30 border border-border/40 rounded-md px-2.5 py-1.5 text-foreground cursor-pointer max-w-full sm:max-w-xs"
          >
            <option value="">{isLoadingContests ? 'Loading contests…' : 'Select a live contest…'}</option>
            {contests.map((c) => (
              <option key={c.contestId} value={c.contestId}>
                {c.title} · {c.status}
              </option>
            ))}
          </select>
        </div>

        {!selectedContestId ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            {contests.length === 0 && !isLoadingContests
              ? 'No contests currently LIVE or REGISTRATION_CLOSED.'
              : 'Pick a contest above to see its real-time Redis participant snapshot.'}
          </div>
        ) : isSnapshotError ? (
          <div className="flex items-start gap-3 p-5 text-sm">
            <AlertTriangle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-red-500 block">Could not load snapshot for this contest</span>
              <span className="text-xs text-muted-foreground">{errMessage(snapshotError) || 'Unknown error.'}</span>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {selectedContest && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono">{selectedContest.contestId}</span>
                <span>·</span>
                <span>Org {selectedContest.organizationId}</span>
                {isFetchingSnapshot && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <RefreshCw className="h-3 w-3 animate-spin" /> updating
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatTile icon={CircleDot} label="Waiting" value={snapshot?.counts.waiting ?? (isLoadingSnapshot ? '—' : 0)} accent="text-amber-500" />
              <StatTile icon={CircleDot} label="Active" value={snapshot?.counts.active ?? (isLoadingSnapshot ? '—' : 0)} accent="text-emerald-500" />
              <StatTile icon={CircleDot} label="Submitted" value={snapshot?.counts.submitted ?? (isLoadingSnapshot ? '—' : 0)} accent="text-primary" />
              <StatTile icon={CircleDot} label="Disconnected" value={snapshot?.counts.disconnected ?? (isLoadingSnapshot ? '—' : 0)} accent="text-red-500" />
            </div>

            <div className="overflow-x-auto border border-border/30 rounded-lg max-h-[420px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                    <th className="py-2.5 px-3">Participant</th>
                    <th className="py-2.5 px-3">Phase</th>
                    <th className="py-2.5 px-3">Progress</th>
                    <th className="py-2.5 px-3">Violations</th>
                    <th className="py-2.5 px-3">Trust</th>
                    <th className="py-2.5 px-3">Flag</th>
                    <th className="py-2.5 px-3">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot && snapshot.participants.length > 0 ? (
                    snapshot.participants.map((p) => <ParticipantRow key={p.participantId} p={p} />)
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                        {isLoadingSnapshot ? 'Loading participants…' : 'No waiting/active/submitted participants right now.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground justify-center">
        <Clock className="h-3 w-3" />
        Fleet snapshot polls every {pollingMs / 1000}s · contest snapshot polls every 3s while a contest is selected
      </div>
    </div>
  );
}
