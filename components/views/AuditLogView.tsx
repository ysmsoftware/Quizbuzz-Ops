'use client';

import { useState } from 'react';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { Lock, UserCheck } from 'lucide-react';
import OpsAuditLogTable from './audit-log/OpsAuditLogTable';
import MainAppAuditLogTable from './audit-log/MainAppAuditLogTable';

type AuditLogTab = 'ops' | 'main-app';

export default function AuditLogView() {
  const { admin } = useCurrentAdmin();
  const [tab, setTab] = useState<AuditLogTab>('ops');

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

      {/* Tab switcher — Ops Dashboard reads PlatformAuditLog (this app's own
          actions); Main Application reads the main app's own audit_logs
          table, read-only, cross-database via queryMainDb. */}
      <div className="flex items-center gap-1 border-b border-border/40">
        <button
          onClick={() => setTab('ops')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            tab === 'ops'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Ops Dashboard
        </button>
        <button
          onClick={() => setTab('main-app')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            tab === 'main-app'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Main Application
        </button>
      </div>

      {tab === 'ops' ? <OpsAuditLogTable /> : <MainAppAuditLogTable />}
    </div>
  );
}
