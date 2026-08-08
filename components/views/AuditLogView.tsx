'use client';

import React, { useEffect, useState } from 'react';
import { useAuditLogs } from '@/lib/hooks/useAuditLogs';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
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
  Lock,
  Clock,
  UserCheck,
  Building2,
  Loader2,
} from 'lucide-react';
import { AuditLogEntry } from '@/lib/types';

// A page fetched from the backend at once. Deliberately larger than what's
// visible on screen (see PAGE_SIZE below) — the table area shows ~20 rows in
// a scrollable viewport, and "Next" advances to a fresh 50-row page from the
// server rather than paging through an already-fetched blob client-side.
const PAGE_SIZE = 50;

// Curated from every writeAuditLogEntry() call site across server/ — kept as
// an explicit list (rather than derived from whatever happens to be on the
// current page) so the filter dropdown doesn't lose options that simply
// aren't present in the most recent 50 rows. Grouped by the domain prefix
// each action is written with (e.g. "org.suspended" -> domain "org") so the
// UI can show a small parent "Operation" list first, then a dependent
// "Action" list scoped to whichever operation is selected — a flat 30-item
// dropdown was unreadable in one shot.
const ACTION_GROUPS: { domain: string; label: string; actions: string[] }[] = [
  { domain: 'admin', label: 'Admin', actions: ['admin.logged_in', 'admin.logged_out', 'admin.otp_generated'] },
  {
    domain: 'org',
    label: 'Organization',
    actions: [
      'org.suspended',
      'org.reactivated',
      'org.note_added',
      'org.message_sent',
      'org.message_retried',
      'org.payout_account_linked',
      'org.payout_account_status_changed',
      'org.payout_transfer_retry_requested',
    ],
  },
  { domain: 'plan', label: 'Plan', actions: ['plan.created', 'plan.updated', 'plan.deactivated'] },
  {
    domain: 'subscription',
    label: 'Subscription',
    actions: [
      'subscription.created',
      'subscription.plan_changed',
      'subscription.expired',
      'subscription.cache_sync_failed',
      'subscription.renewal_reminder_resent',
    ],
  },
  { domain: 'override', label: 'Override', actions: ['override.added', 'override.removed', 'override.expired'] },
  { domain: 'booking', label: 'Booking', actions: ['booking.created', 'booking.status_changed'] },
  { domain: 'pricing_config', label: 'Pricing Config', actions: ['pricing_config.updated'] },
  {
    domain: 'billing_portal',
    label: 'Billing Portal',
    actions: [
      'billing_portal.checkout_started',
      'billing_portal.payment_attempted',
      'billing_portal.payment_succeeded',
      'billing_portal.payment_failed',
      'billing_portal.receipt_resent',
    ],
  },
  { domain: 'system', label: 'System', actions: ['system.cache_reconciled'] },
];

// Human label for a sub-action within its already-known domain, e.g.
// ('org', 'org.payout_account_linked') -> "Payout Account Linked".
function subActionLabel(domain: string, action: string): string {
  return action
    .slice(domain.length + 1)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLogView() {
  const { admin } = useCurrentAdmin();

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
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const debouncedOrgName = useDebouncedValue(orgNameInput, 400);
  const debouncedAdminName = useDebouncedValue(adminNameInput, 400);
  const debouncedOrgId = useDebouncedValue(orgIdFilter, 400);

  const selectedGroup = ACTION_GROUPS.find((g) => g.domain === operationFilter);

  // Any filter change invalidates the current page — jump back to page 1
  // rather than requesting a page that may no longer exist for the new query.
  useEffect(() => {
    setPage(1);
  }, [debouncedOrgName, debouncedAdminName, debouncedOrgId, operationFilter, actionFilter]);

  // Picking a new Operation clears whatever specific Action was selected
  // under the previous one — it's no longer a valid option.
  const handleOperationChange = (domain: string) => {
    setOperationFilter(domain);
    setActionFilter('ALL');
  };

  const { logs, pagination, isLoading, isFetching, isError } = useAuditLogs({
    page,
    limit: PAGE_SIZE,
    targetId: debouncedOrgId || undefined,
    targetLabel: debouncedOrgName || undefined,
    actorName: debouncedAdminName || undefined,
    action: actionFilter !== 'ALL' ? actionFilter : undefined,
    actionPrefix: actionFilter === 'ALL' && operationFilter !== 'ALL' ? operationFilter : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const rangeStart = pagination.total === 0 ? 0 : (page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(page * pagination.limit, pagination.total);

  // Formatting action names for better visual appeal
  const formatActionName = (action: string) => {
    return action
      .replace('org.', 'Org: ')
      .replace('plan.', 'Plan: ')
      .replace('override.', 'Override: ')
      .replace('payment.', 'Payment: ')
      .replace('_', ' ')
      .toUpperCase();
  };

  // Human descriptive text for action types
  const getLogDetailsString = (log: AuditLogEntry) => {
    switch (log.action) {
      case 'org.suspended':
        return `Suspended organization "${log.targetLabel}" due to: ${log.metadata?.reason || 'No reason provided'}`;
      case 'org.activated':
      case 'org.reactivated':
        return `Reactivated organization "${log.targetLabel}"`;
      case 'org.edited':
        return `Updated profile details for organization "${log.targetLabel}"`;
      case 'org.note_added':
        return `Added operational support note to organization "${log.targetLabel}"`;
      case 'plan.created':
        return `Created new subscription plan "${log.targetLabel}"`;
      case 'plan.updated':
        return `Updated features or limits for plan "${log.targetLabel}"`;
      case 'plan.deactivated':
        return `Deactivated subscription plan "${log.targetLabel}"`;
      case 'org.plan_changed':
      case 'subscription.plan_changed':
        return `Changed subscription plan for "${log.targetLabel}" from ${log.metadata?.oldPlanId || log.metadata?.fromPlanId || 'N/A'} to ${log.metadata?.newPlanId || log.metadata?.toPlanId || 'N/A'}`;
      case 'override.added':
        return `Added subscription override for "${log.targetLabel}" (${log.metadata?.field}: ${log.metadata?.value})`;
      case 'override.removed':
        return `Removed subscription override for "${log.targetLabel}" (${log.metadata?.field})`;
      case 'override.expired':
        return `Subscription override for "${log.targetLabel}" expired automatically`;
      case 'payment.refunded':
        return `Issued refund of ₹${log.metadata?.amount || '0'} for participant ${log.metadata?.participantName || ''} on contest "${log.targetLabel}"`;
      case 'org.impersonated':
        return `Initiated impersonation session for organization "${log.targetLabel}"`;
      case 'org.impersonation_ended':
        return `Terminated impersonation session for organization "${log.targetLabel}"`;
      case 'org.payout_account_linked':
        return `Linked Razorpay account ${log.metadata?.razorpayLinkedAccountId || ''} for organization "${log.targetLabel}"`;
      case 'org.payout_account_status_changed':
        return `Changed payout account status for "${log.targetLabel}" from ${log.metadata?.from || 'N/A'} to ${log.metadata?.to || 'N/A'}${log.metadata?.reason ? `: ${log.metadata.reason}` : ''}`;
      case 'org.message_sent':
        return `Sent a message to organization "${log.targetLabel}"`;
      case 'org.message_retried':
        return `Retried a message to organization "${log.targetLabel}"`;
      case 'admin.logged_in':
        return `Administrator signed in`;
      case 'admin.logged_out':
        return `Administrator signed out`;
      case 'booking.created':
        return `Created contest booking "${log.targetLabel}"`;
      case 'booking.status_changed':
        return `Updated booking status for "${log.targetLabel}"`;
      case 'pricing_config.updated':
        return `Updated contest booking pricing configuration`;
      default:
        return `Executed action "${log.action}" on ${log.targetType} "${log.targetLabel}"`;
    }
  };

  // Toggle expanding a log's full payload
  const toggleExpand = (logId: string) => {
    if (expandedLogId === logId) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(logId);
    }
  };

  const hasActiveFilters = orgIdFilter || orgNameInput || adminNameInput || operationFilter !== 'ALL' || actionFilter !== 'ALL';
  const clearFilters = () => {
    setOrgIdFilter('');
    setOrgNameInput('');
    setAdminNameInput('');
    setOperationFilter('ALL');
    setActionFilter('ALL');
  };

  return (
    <div id="audit-logs-view" className="space-y-6 font-sans select-none">

      {/* Header and Immutable Disclaimer */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Security Audit Ledger</h1>
          <p className="text-xs text-muted-foreground">Immutable, cryptographically signed administrative activity trail</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-1.5 text-xs text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg font-medium shadow-sm">
          <Lock className="h-4 w-4 shrink-0" />
          <span>Write-Only Ledger Enforced</span>
        </div>
      </div>

      {/* Role Permission Dashboard Card */}
      <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-primary" /> Active Operator Credentials
            </h3>
            <p className="text-xs text-muted-foreground">Verification status and role-based log access clearance</p>
          </div>
          <div className="flex items-center gap-3 bg-secondary/30 p-2.5 rounded-xl border border-border/40">
            <img
              src={admin?.avatarUrl}
              alt={admin?.name}
              className="h-8 w-8 rounded-full border border-border/60 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="text-xs font-bold text-foreground block leading-none">{admin?.name}</span>
              <span className="text-[9px] font-bold font-mono uppercase text-primary tracking-wide block mt-1">{admin?.role.replace('_', ' ')}</span>
            </div>
          </div>
        </div>

        {/* Roles Breakdown Description */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border/40 mt-4 pt-4 text-xs">
          <div className="p-3 bg-secondary/15 rounded-xl space-y-1">
            <span className="font-bold text-foreground">SUPER ADMIN</span>
            <p className="text-muted-foreground text-[11px] leading-normal">
              Full clearance to inspect all logs, issue reversals, edit tenant parameters, and perform system operations.
            </p>
          </div>
          <div className="p-3 bg-secondary/15 rounded-xl space-y-1">
            <span className="font-bold text-foreground">SUPPORT SPECIALIST</span>
            <p className="text-muted-foreground text-[11px] leading-normal">
              Authorized to verify organization states, append operational notes, and trigger secure impersonation.
            </p>
          </div>
          <div className="p-3 bg-secondary/15 rounded-xl space-y-1">
            <span className="font-bold text-foreground">BILLING ADMIN</span>
            <p className="text-muted-foreground text-[11px] leading-normal">
              Cleared to analyze revenue dashboards, inspect invoice cycles, and execute authorized payment reversals.
            </p>
          </div>
        </div>
      </div>

      {/* Logs Table Card */}
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
                {ACTION_GROUPS.map((g) => (
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
              Querying write-only ledger database...
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
                                    <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Origin Security Signature</span>
                                    <span className="text-slate-400">SHA256_RSA • 2048_BIT</span>
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
    </div>
  );
}
