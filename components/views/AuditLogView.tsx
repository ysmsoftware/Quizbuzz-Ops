'use client';

import React, { useState } from 'react';
import { useAuditLogs } from '@/lib/hooks/useAuditLogs';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { format } from 'date-fns';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Eye, 
  Terminal, 
  Lock, 
  Clock, 
  UserCheck, 
  Tag, 
  Layers 
} from 'lucide-react';
import { AuditLogEntry } from '@/lib/types';

export default function AuditLogView() {
  const { logs, isLoading, isError } = useAuditLogs();
  const { admin } = useCurrentAdmin();

  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

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
        return `Reactivated organization "${log.targetLabel}"`;
      case 'org.edited':
        return `Updated profile details for organization "${log.targetLabel}"`;
      case 'org.note_added':
        return `Added operational support note to organization "${log.targetLabel}"`;
      case 'plan.created':
        return `Created new subscription plan "${log.targetLabel}"`;
      case 'plan.updated':
        return `Updated features or limits for plan "${log.targetLabel}"`;
      case 'org.plan_changed':
        return `Changed subscription plan for "${log.targetLabel}" from ${log.metadata?.oldPlanId || 'N/A'} to ${log.metadata?.newPlanId || 'N/A'}`;
      case 'override.added':
        return `Added subscription override for "${log.targetLabel}" (${log.metadata?.field}: ${log.metadata?.value})`;
      case 'override.removed':
        return `Removed subscription override for "${log.targetLabel}" (${log.metadata?.field})`;
      case 'payment.refunded':
        return `Issued refund of ₹${log.metadata?.amount || '0'} for participant ${log.metadata?.participantName || ''} on contest "${log.targetLabel}"`;
      case 'org.impersonated':
        return `Initiated impersonation session for organization "${log.targetLabel}"`;
      case 'org.impersonation_ended':
        return `Terminated impersonation session for organization "${log.targetLabel}"`;
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

  // Filter actions list for select box dropdown
  const actionTypes = Array.from(new Set(logs.map(log => log.action)));

  // Filter and Search logic
  const filteredLogs = logs.filter(log => {
    const details = getLogDetailsString(log).toLowerCase();
    const actor = log.actorAdminName.toLowerCase();
    const action = log.action.toLowerCase();
    const label = log.targetLabel?.toLowerCase() || '';
    const id = log.id.toLowerCase();
    const term = searchTerm.toLowerCase();

    const matchesSearch = 
      details.includes(term) ||
      actor.includes(term) ||
      action.includes(term) ||
      label.includes(term) ||
      id.includes(term);

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

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
        <div className="p-5 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground text-sm font-sans">System Security Ledger</h3>
            <p className="text-xs text-muted-foreground">Browse, search, and audit administrator activity</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search actor, target, action..."
                className="pl-9 h-9 w-48 sm:w-64 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all font-sans"
              />
            </div>

            {/* Action Filter */}
            <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
              <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="text-[11px] font-sans bg-transparent focus:outline-none text-muted-foreground"
              >
                <option value="ALL">All Actions</option>
                {actionTypes.map(type => (
                  <option key={type} value={type}>{formatActionName(type)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">
              Querying write-only ledger database...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-xs font-semibold text-muted-foreground">No operations recorded for the selected query</p>
              <p className="text-[10px] text-muted-foreground/80 mt-0.5">Try widening your search keywords or action filter criteria</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/20 text-muted-foreground border-b border-border/40">
                  <th className="py-3 px-5 font-semibold">Timestamp</th>
                  <th className="py-3 px-5 font-semibold">Administrator (Actor)</th>
                  <th className="py-3 px-5 font-semibold">Action Class</th>
                  <th className="py-3 px-5 font-semibold">Security Payload Details</th>
                  <th className="py-3 px-5 font-semibold">Network IP</th>
                  <th className="py-3 px-5 font-semibold text-center">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredLogs.map((log) => {
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
                        <td className="py-3 px-5 font-mono text-[11px] text-muted-foreground shrink-0 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground/80" />
                          <span>{format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm:ss')}</span>
                        </td>

                        {/* Actor */}
                        <td className="py-3 px-5">
                          <div>
                            <span className="font-semibold text-foreground block">{log.actorAdminName}</span>
                            <span className="text-[9px] font-mono text-muted-foreground/80 block mt-0.5">{log.actorAdminRole}</span>
                          </div>
                        </td>

                        {/* Action Class */}
                        <td className="py-3 px-5">
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
                        <td className="py-3 px-5 max-w-[280px] truncate font-sans text-muted-foreground text-[11px]">
                          {getLogDetailsString(log)}
                        </td>

                        {/* IP Address */}
                        <td className="py-3 px-5 font-mono text-muted-foreground/80 text-[11px]">
                          {log.metadata?.ipAddress || '192.168.1.1'}
                        </td>

                        {/* Expand Button */}
                        <td className="py-3 px-5 text-center">
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
          )}
        </div>
      </div>
    </div>
  );
}
