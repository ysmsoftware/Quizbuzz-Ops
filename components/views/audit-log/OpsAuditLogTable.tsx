'use client';

import React, { useState } from 'react';
import { useAuditLogs, useOpsAuditActionGroups } from '@/lib/hooks/useAuditLogs';
import { subActionLabel } from '@/lib/constants/audit-actions';
import { dayRangeToIso } from '@/lib/dates';
import DateRangePicker, { DateRangeValue } from '@/components/ui/DateRangePicker';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { format } from 'date-fns';
import {
  ShieldCheck,
  Search,
  Filter,
  ChevronUp,
  Eye,
  Terminal,
  Clock,
  UserCheck,
  Building2,
  Loader2,
} from 'lucide-react';
import {  } from '@/lib/types';
import { describeAuditEntry, formatActionName as formatAction } from '@/lib/audit-describe';
import Pagination from '@/components/ui/Pagination';
import { useResetOnChange } from '@/lib/hooks/useResetOnChange';

// A page fetched from the backend at once. Deliberately larger than what's
// visible on screen (see PAGE_SIZE below) — the table area shows ~20 rows in
// a scrollable viewport, and "Next" advances to a fresh 50-row page from the
// server rather than paging through an already-fetched blob client-side.
const PAGE_SIZE = 50;

/** Ops Dashboard's own audit trail — reads PlatformAuditLog. See AuditLogView.tsx for the tab shell. */
export default function OpsAuditLogTable() {
  // Query-based filters — every change here goes to the backend as a query
  // param (page resets to 1 whenever a filter changes), not a client-side
  // slice of an already-fetched list.
  const [page, setPage] = useState(1);
  const [orgIdFilter, setOrgIdFilter] = useState('');
  const [orgNameInput, setOrgNameInput] = useState('');
  const [adminNameInput, setAdminNameInput] = useState('');
  // Parent "Operation" (domain, e.g. "org") and dependent "Action"
  // (sub-action, e.g. "org.suspended") — Action is scoped to whichever
  // Operation is selected and resets whenever Operation changes.
  const [operationFilter, setOperationFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const debouncedOrgName = useDebouncedValue(orgNameInput, 400);
  const debouncedAdminName = useDebouncedValue(adminNameInput, 400);
  const debouncedOrgId = useDebouncedValue(orgIdFilter, 400);

  const actionGroups = useOpsAuditActionGroups();
  const selectedGroup = actionGroups.find((g) => g.domain === operationFilter);

  // Any filter change invalidates the current page — jump back to page 1
  // rather than requesting a page that may no longer exist for the new query.
  useResetOnChange(`${debouncedOrgName}|${debouncedAdminName}|${debouncedOrgId}|${operationFilter}|${actionFilter}|${dateRange?.start}|${dateRange?.end}`, () => setPage(1));

  // Picking a new Operation clears whatever specific Action was selected
  // under the previous one — it's no longer a valid option.
  const handleOperationChange = (domain: string) => {
    setOperationFilter(domain);
    setActionFilter('ALL');
  };

  const { logs, pagination, isLoading, isFetching, isError } = useAuditLogs({
    page,
    limit: PAGE_SIZE,
    organizationId: debouncedOrgId || undefined,
    targetLabel: debouncedOrgName || undefined,
    actorName: debouncedAdminName || undefined,
    ...dayRangeToIso(dateRange),
    action: actionFilter !== 'ALL' ? actionFilter : undefined,
    actionPrefix: actionFilter === 'ALL' && operationFilter !== 'ALL' ? operationFilter : undefined,
  });

  const formatActionName = formatAction;
  const getLogDetailsString = describeAuditEntry;

  // Toggle expanding a log's full payload
  const toggleExpand = (logId: string) => {
    if (expandedLogId === logId) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(logId);
    }
  };

  const hasActiveFilters = orgIdFilter || orgNameInput || adminNameInput || operationFilter !== 'ALL' || actionFilter !== 'ALL' || dateRange;
  const clearFilters = () => {
    setOrgIdFilter('');
    setOrgNameInput('');
    setAdminNameInput('');
    setOperationFilter('ALL');
    setActionFilter('ALL');
    setDateRange(null);
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border/40 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">System Security Ledger</h3>
            <p className="text-xs text-muted-foreground">
              Server-paginated — {PAGE_SIZE} rows fetched per page from the backend
              {isFetching && !isLoading && (
                <span className="inline-flex items-center gap-1 ml-2 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> refreshing…
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Query-based filter row — every field here maps directly to a backend query param */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Organization ID */}
          <div className="relative">
            <Building2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={orgIdFilter}
              onChange={(e) => setOrgIdFilter(e.target.value)}
              placeholder="Organization ID..."
              title="Matches the organization's own events and events about it filed under another target, e.g. feature grants"
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-mono"
            />
          </div>

          {/* Organization Name */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={orgNameInput}
              onChange={(e) => setOrgNameInput(e.target.value)}
              placeholder="Organization name..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-sans"
            />
          </div>

          {/* Admin / Actor Name */}
          <div className="relative">
            <UserCheck className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={adminNameInput}
              onChange={(e) => setAdminNameInput(e.target.value)}
              placeholder="Admin name..."
              className="pl-9 h-9 w-40 sm:w-48 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-sans"
            />
          </div>

          {/* Operation Filter (parent domain, e.g. "Organization") */}
          <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
            <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
            <select
              value={operationFilter}
              onChange={(e) => handleOperationChange(e.target.value)}
              className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground max-w-[140px]"
            >
              <option value="ALL">All Operations</option>
              {actionGroups.map((g) => (
                <option key={g.domain} value={g.domain}>{g.label}</option>
              ))}
            </select>
          </div>

          {/* Action Filter — dependent on Operation; disabled until an Operation is picked */}
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

          <DateRangePicker value={dateRange} onChange={setDateRange} />

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

      {/* Ledger Table — fetches PAGE_SIZE (50) rows per page, but the
          viewport only shows ~20 at a time; the rest scroll within this
          container instead of growing the page. */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
            Loading the audit ledger...
          </div>
        ) : isError ? (
          <div className="py-16 text-center">
            <p className="text-xs font-semibold text-rose-500">Failed to load the audit ledger.</p>
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
                  <th className="py-3 px-5 font-semibold">Administrator (Actor)</th>
                  <th className="py-3 px-5 font-semibold">Action Class</th>
                  <th className="py-3 px-5 font-semibold">Security Payload Details</th>
                  <th className="py-3 px-5 font-semibold">Network IP</th>
                  <th className="py-3 px-5 font-semibold text-center">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`hover:bg-secondary/10 transition-all cursor-pointer ${
                          isExpanded ? 'bg-secondary/15' : ''
                        }`}
                        onClick={() => toggleExpand(log.id)}
                      >
                        {/* Timestamp */}
                        <td className="py-2.5 px-5 font-mono text-[11px] text-muted-foreground shrink-0">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/80" />
                            <span>{format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm:ss')}</span>
                          </div>
                        </td>

                        {/* Actor */}
                        <td className="py-2.5 px-5">
                          <div>
                            <span className="font-semibold text-foreground block">{log.actorAdminName}</span>
                            <span className="text-[9px] font-mono text-muted-foreground/80 block mt-0.5">{log.actorAdminRole}</span>
                          </div>
                        </td>

                        {/* Action Class */}
                        <td className="py-2.5 px-5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-tight ${
                            log.action.includes('suspend') ? 'bg-rose-500/10 text-rose-600' :
                            log.action.includes('created') ? 'bg-emerald-500/10 text-emerald-600' :
                            log.action.includes('impersonate') ? 'bg-amber-500/10 text-amber-600' :
                            log.action.includes('refunded') ? 'bg-blue-500/10 text-blue-600' :
                            'bg-indigo-500/10 text-indigo-500'
                          }`}>
                            {formatActionName(log.action)}
                          </span>
                        </td>

                        {/* Details */}
                        <td className="py-2.5 px-5 max-w-[280px] truncate font-sans text-muted-foreground text-[11px]">
                          {getLogDetailsString(log)}
                        </td>

                        {/* IP Address */}
                        <td className="py-2.5 px-5 font-mono text-muted-foreground/80 text-[11px]">
                          {log.metadata?.ipAddress || '—'}
                        </td>

                        {/* Expand Button */}
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

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-secondary/10 p-5 border-t border-b border-border/40">
                            <div className="bg-slate-950 text-slate-200 p-4 rounded-lg border border-border/60 shadow-inner font-mono text-xs space-y-3">

                              <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[10px] text-slate-400">
                                <span className="flex items-center gap-1.5">
                                  <Terminal className="h-3.5 w-3.5 text-indigo-400" /> SYSTEM CONSOLE DATA INSPECTION
                                </span>
                                <span>LOG_ID: {log.id}</span>
                              </div>

                              {/* Grid representation */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] py-1">
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Transaction Action</span>
                                  <span className="text-emerald-400 font-bold">{log.action}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Registered Target</span>
                                  <span className="text-slate-300">{log.targetType.toUpperCase()}: {log.targetLabel} ({log.targetId})</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Operator Session</span>
                                  <span className="text-indigo-300 font-bold">{log.actorAdminName} ({log.actorAdminRole})</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Request ID</span>
                                  <span className="text-slate-400">{log.requestId ?? '—'}</span>
                                </div>
                              </div>

                              {/* Full JSON metadata */}
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

      {/* Pagination Footer — real backend pagination; "Next" requests a
          fresh 50-row page from the server rather than slicing client-side. */}
      {!isLoading && !isError && (
        <Pagination currentPage={page} totalItems={pagination.total} pageSize={pagination.limit} itemLabel="logs" onPageChange={setPage} isLoading={isFetching} />
      )}
    </div>
  );
}
