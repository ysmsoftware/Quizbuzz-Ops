'use client';

import React, { useEffect, useState } from 'react';
import { useMainAppAuditLogs } from '@/lib/hooks/useMainAppAuditLogs';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { format } from 'date-fns';
import {
  ShieldCheck,
  Search,
  Filter,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Terminal,
  Clock,
  UserCheck,
  Building2,
  Loader2,
  Link2,
  Timer,
} from 'lucide-react';
import { MainAppAuditLogEntry } from '@/lib/types';

const PAGE_SIZE = 50;

// Curated from every logAudit() call site instrumented in Quizbuzz-new/backend
// so far (src/common/audit-log.ts callers) — same rationale as
// OpsAuditLogTable's ACTION_GROUPS: an explicit list so the dropdown doesn't
// lose options that aren't on the current page. Extend this list as more
// call sites get instrumented.
const ACTION_GROUPS: { domain: string; label: string; actions: string[] }[] = [
  { domain: 'auth', label: 'Auth', actions: ['auth.admin_login', 'auth.admin_logout', 'auth.admin_email_verified', 'auth.participant_login'] },
  { domain: 'organization', label: 'Organization', actions: ['organization.created', 'organization.member_invited', 'organization.member_role_changed', 'organization.member_removed'] },
  { domain: 'contest', label: 'Contest', actions: ['contest.created', 'contest.published', 'contest.cancelled', 'contest.results_declared'] },
  { domain: 'participant', label: 'Participant', actions: ['participant.disqualified'] },
  { domain: 'payment', label: 'Payment', actions: ['payment.captured'] },
  { domain: 'payout', label: 'Payout', actions: ['payout.route_transfer_processed'] },
  { domain: 'submission', label: 'Submission', actions: ['submission.submitted', 'submission.evaluated', 'submission.invalidated'] },
  { domain: 'certificate', label: 'Certificate', actions: ['certificate.issue_triggered', 'certificate.generated', 'certificate.failed'] },
  { domain: 'question', label: 'Question', actions: ['question.bulk_imported'] },
  { domain: 'message', label: 'Message', actions: ['message.sent', 'message.retried', 'message.failed'] },
  { domain: 'system', label: 'System', actions: ['system.contest_reconciliation_fired', 'system.job_retries_exhausted'] },
];

function subActionLabel(domain: string, action: string): string {
  return action
    .slice(domain.length + 1)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface MainAppAuditLogTableProps {
  /** Set by AuditLogView — jumps to a fresh "Job Timeline" tab mount, pre-filtered to this requestId. */
  onViewJobTimeline?: (requestId: string) => void;
}

/** Main app's own audit trail — reads audit_logs cross-DB via queryMainDb. See AuditLogView.tsx for the tab shell. */
export default function MainAppAuditLogTable({ onViewJobTimeline }: MainAppAuditLogTableProps) {
  const [page, setPage] = useState(1);
  const [orgIdFilter, setOrgIdFilter] = useState('');
  const [targetIdFilter, setTargetIdFilter] = useState('');
  const [actorNameInput, setActorNameInput] = useState('');
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const [operationFilter, setOperationFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const debouncedActorName = useDebouncedValue(actorNameInput, 400);
  const debouncedOrgId = useDebouncedValue(orgIdFilter, 400);
  const debouncedTargetId = useDebouncedValue(targetIdFilter, 400);
  const debouncedRequestId = useDebouncedValue(requestIdFilter, 400);

  const selectedGroup = ACTION_GROUPS.find((g) => g.domain === operationFilter);

  useEffect(() => {
    setPage(1);
  }, [debouncedActorName, debouncedOrgId, debouncedTargetId, debouncedRequestId, operationFilter, actionFilter]);

  const handleOperationChange = (domain: string) => {
    setOperationFilter(domain);
    setActionFilter('ALL');
  };

  const { logs, pagination, isLoading, isFetching, isError } = useMainAppAuditLogs({
    page,
    limit: PAGE_SIZE,
    organizationId: debouncedOrgId || undefined,
    targetId: debouncedTargetId || undefined,
    actorName: debouncedActorName || undefined,
    requestId: debouncedRequestId || undefined,
    action: actionFilter !== 'ALL' ? actionFilter : undefined,
    actionPrefix: actionFilter === 'ALL' && operationFilter !== 'ALL' ? operationFilter : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const rangeStart = pagination.total === 0 ? 0 : (page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(page * pagination.limit, pagination.total);

  const formatActionName = (action: string) => action.replace('.', ': ').replace(/_/g, ' ').toUpperCase();

  const toggleExpand = (logId: string) => {
    setExpandedLogId((current) => (current === logId ? null : logId));
  };

  // Re-filter the current view to a requestId/targetId in one click — the
  // "chain of trail" view described in the audit-logging proposal: requestId
  // groups everything one execution fanned out into, targetId groups
  // everything that ever happened to one entity across many requests.
  const filterByRequestId = (id: string) => {
    setRequestIdFilter(id);
    setTargetIdFilter('');
  };
  const filterByTargetId = (id: string) => {
    setTargetIdFilter(id);
    setRequestIdFilter('');
  };

  const hasActiveFilters = orgIdFilter || targetIdFilter || actorNameInput || requestIdFilter || operationFilter !== 'ALL' || actionFilter !== 'ALL';
  const clearFilters = () => {
    setOrgIdFilter('');
    setTargetIdFilter('');
    setActorNameInput('');
    setRequestIdFilter('');
    setOperationFilter('ALL');
    setActionFilter('ALL');
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border/40 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">Main Application Ledger</h3>
            <p className="text-xs text-muted-foreground">
              Read-only, cross-database — {PAGE_SIZE} rows fetched per page
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
            <Building2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={orgIdFilter}
              onChange={(e) => setOrgIdFilter(e.target.value)}
              placeholder="Organization ID..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-mono"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={targetIdFilter}
              onChange={(e) => setTargetIdFilter(e.target.value)}
              placeholder="Target ID..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-mono"
            />
          </div>

          <div className="relative">
            <UserCheck className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={actorNameInput}
              onChange={(e) => setActorNameInput(e.target.value)}
              placeholder="Actor name..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-sans"
            />
          </div>

          <div className="relative">
            <Link2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={requestIdFilter}
              onChange={(e) => setRequestIdFilter(e.target.value)}
              placeholder="Request ID..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-mono"
            />
          </div>

          <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
            <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
            <select
              value={operationFilter}
              onChange={(e) => handleOperationChange(e.target.value)}
              className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground max-w-[140px]"
            >
              <option value="ALL">All Operations</option>
              {ACTION_GROUPS.map((g) => (
                <option key={g.domain} value={g.domain}>{g.label}</option>
              ))}
            </select>
          </div>

          <div className={`flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9 ${!selectedGroup ? 'opacity-50' : ''}`}>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              disabled={!selectedGroup}
              className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground max-w-[160px] disabled:cursor-not-allowed"
            >
              <option value="ALL">{selectedGroup ? `All ${selectedGroup.label} Actions` : 'Select an operation first'}</option>
              {selectedGroup?.actions.map((action) => (
                <option key={action} value={action}>{subActionLabel(selectedGroup.domain, action)}</option>
              ))}
            </select>
          </div>

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
            Querying main application ledger...
          </div>
        ) : isError ? (
          <div className="py-16 text-center">
            <p className="text-xs font-semibold text-rose-500">Failed to load the main application ledger.</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">No operations recorded for the selected query</p>
            <p className="text-[10px] text-muted-foreground/80 mt-0.5">Try widening your search keywords or operation filter</p>
          </div>
        ) : (
          <div className="max-h-[820px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-secondary/90 backdrop-blur text-muted-foreground border-b border-border/40">
                  <th className="py-3 px-5 font-semibold">Timestamp</th>
                  <th className="py-3 px-5 font-semibold">Actor</th>
                  <th className="py-3 px-5 font-semibold">Action Class</th>
                  <th className="py-3 px-5 font-semibold">Target</th>
                  <th className="py-3 px-5 font-semibold">Request</th>
                  <th className="py-3 px-5 font-semibold text-center">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {logs.map((log: MainAppAuditLogEntry) => {
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`hover:bg-secondary/10 transition-all cursor-pointer ${isExpanded ? 'bg-secondary/15' : ''}`}
                        onClick={() => toggleExpand(log.id)}
                      >
                        <td className="py-2.5 px-5 font-mono text-[11px] text-muted-foreground shrink-0">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/80" />
                            <span>{format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm:ss')}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-5">
                          <div>
                            <span className="font-semibold text-foreground block">{log.actorLabel}</span>
                            <span className="text-[9px] font-mono text-muted-foreground/80 block mt-0.5">{log.actorType}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-tight ${
                            log.action.includes('captured') ? 'bg-emerald-500/10 text-emerald-600' :
                            log.action.includes('published') ? 'bg-blue-500/10 text-blue-600' :
                            log.action.includes('login') ? 'bg-amber-500/10 text-amber-600' :
                            log.action.includes('failed') || log.action.includes('exhausted') || log.action.includes('cancelled') || log.action.includes('invalidated') ? 'bg-rose-500/10 text-rose-600' :
                            'bg-indigo-500/10 text-indigo-500'
                          }`}>
                            {formatActionName(log.action)}
                          </span>
                        </td>

                        <td className="py-2.5 px-5 max-w-[240px] truncate font-sans text-muted-foreground text-[11px]">
                          <button
                            onClick={(e) => { e.stopPropagation(); filterByTargetId(log.targetId); }}
                            className="hover:text-primary hover:underline cursor-pointer text-left"
                            title="Filter to this target's full history"
                          >
                            {log.targetType}: {log.targetLabel}
                          </button>
                        </td>

                        <td className="py-2.5 px-5 font-mono text-muted-foreground/80 text-[11px]">
                          {log.requestId ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); filterByRequestId(log.requestId!); }}
                                className="hover:text-primary hover:underline cursor-pointer"
                                title="Filter to everything this request did"
                              >
                                {log.requestId.slice(0, 8)}…
                              </button>
                              {onViewJobTimeline && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onViewJobTimeline(log.requestId!); }}
                                  className="p-1 rounded hover:bg-secondary/30 text-muted-foreground/70 hover:text-primary transition-all cursor-pointer"
                                  title="View this request's per-stage job timeline"
                                >
                                  <Timer className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ) : '—'}
                        </td>

                        <td className="py-2.5 px-5 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(log.id);
                            }}
                            className="p-1.5 rounded-md hover:bg-card border border-transparent hover:border-border/40 text-muted-foreground hover:text-foreground transition-all shrink-0 cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-secondary/10 p-5 border-t border-b border-border/40">
                            <div className="bg-slate-950 text-slate-200 p-4 rounded-lg border border-border/60 shadow-inner font-mono text-xs space-y-3">

                              <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[10px] text-slate-400">
                                <span className="flex items-center gap-1.5">
                                  <Terminal className="h-3.5 w-3.5 text-indigo-400" /> MAIN APPLICATION LOG INSPECTION
                                </span>
                                <span>LOG_ID: {log.id}</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] py-1">
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Action</span>
                                  <span className="text-emerald-400 font-bold">{log.action}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Target</span>
                                  <span className="text-slate-300">{log.targetType}: {log.targetLabel} ({log.targetId})</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Actor</span>
                                  <span className="text-indigo-300 font-bold">{log.actorLabel} ({log.actorType})</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Organization</span>
                                  <span className="text-slate-300">{log.organizationId || '—'}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Request ID</span>
                                  <span className="text-slate-300">{log.requestId || '—'}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Network</span>
                                  <span className="text-slate-300">{log.ipAddress || '—'}</span>
                                </div>
                              </div>

                              <div className="space-y-1.5 border-t border-slate-800 pt-3">
                                <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Metadata Payload JSON</span>
                                <pre className="p-3 bg-slate-900 rounded border border-slate-800 text-[10px] text-indigo-200 overflow-x-auto leading-normal">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>

                            </div>
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

      {!isLoading && !isError && logs.length > 0 && (
        <div className="p-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground font-mono">
            Showing <span className="text-foreground font-semibold">{rangeStart}-{rangeEnd}</span> of{' '}
            <span className="text-foreground font-semibold">{pagination.total.toLocaleString()}</span> logs
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
