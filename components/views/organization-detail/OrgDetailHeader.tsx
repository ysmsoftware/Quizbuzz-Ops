'use client';

import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ShieldCheck,
  ShieldAlert,
  Edit3,
  Lock,
  RefreshCw,
  Trash2,
  MessagesSquare,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { Organization } from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';

interface OrgDetailHeaderProps {
  organization: Organization;
  onBackClick: () => void;
  onOpenEdit: () => void;
  onOpenSuspend: () => void;
  onReactivate: () => void;
  onOpenDelete: () => void;
  onRestore: () => void;
  isActivating: boolean;
  isRestoring: boolean;
  /** Super Admin only (matches the API): edit, suspend/reactivate, delete/restore. */
  canManage: boolean;
}

export default function OrgDetailHeader({
  organization,
  onBackClick,
  onOpenEdit,
  onOpenSuspend,
  onReactivate,
  onOpenDelete,
  onRestore,
  isActivating,
  isRestoring,
  canManage,
}: OrgDetailHeaderProps) {
  const router = useRouter();

  return (
    <div className="space-y-6 font-sans">
      {/* Breadcrumb back navigation */}
      <button
        onClick={onBackClick}
        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer hover:translate-x-[-2px] duration-150"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Back to organizations directory</span>
      </button>

      {/* Hero Header Area */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-card border border-border/50 rounded-xl p-6 shadow-sm">
        {/* Org Profile basics */}
        <div className="flex items-center gap-4 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={organization.logoUrl}
            alt={organization.name}
            className="h-16 w-16 rounded bg-background border border-border/30 object-contain p-1 shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="truncate block">{organization.name}</span>
              {organization.status === 'ACTIVE' ? (
                <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0 animate-pulse" />
              )}
              <StatusBadge kind="org" value={organization.status} />
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono text-[11px] uppercase tracking-wider">{organization.slug}</span>
              <span>•</span>
              <span>Joined {format(new Date(organization.createdAt), 'dd MMM yyyy')}</span>
            </div>
          </div>
        </div>

        {/* Operational Admin Actions Bar */}
        <div className="flex flex-wrap items-center gap-2 font-sans w-full lg:w-auto">

          {/* Deep link into the centralized Messaging log, pre-filtered to this org */}
          <button
            onClick={() => router.push(`/dashboard/messaging?organizationId=${organization.id}`)}
            className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-border/50 bg-card hover:bg-secondary/40 text-foreground transition-colors cursor-pointer"
          >
            <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View Messages</span>
          </button>

          {canManage && organization.status !== 'DELETED' && (
            <>
              {/* Edit name / logo */}
              <button
                onClick={onOpenEdit}
                className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-border/50 bg-card hover:bg-secondary/40 text-foreground transition-colors cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Edit Profile</span>
              </button>

              {/* Suspend / Reactivate */}
              {organization.status === 'ACTIVE' ? (
                <button
                  onClick={onOpenSuspend}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Suspend Tenant</span>
                </button>
              ) : (
                <button
                  onClick={onReactivate}
                  disabled={isActivating}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{isActivating ? 'Activating...' : 'Reactivate Tenant'}</span>
                </button>
              )}

              {/* Soft delete */}
              <button
                onClick={onOpenDelete}
                className="p-2 text-muted-foreground hover:text-destructive rounded-lg border border-border/50 bg-card hover:bg-destructive/10 transition-colors cursor-pointer"
                title="Delete organization (soft delete)"
                aria-label="Delete organization"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}

          {canManage && organization.status === 'DELETED' && (
            <button
              onClick={onRestore}
              disabled={isRestoring}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isRestoring ? 'Restoring...' : 'Restore Organization'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Suspension Alert Banner if suspended */}
      {organization.status === 'SUSPENDED' && organization.suspendReason && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-900 text-xs font-sans shadow-sm">
          <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-0.5 min-w-0">
            <h4 className="font-bold text-rose-800">Compliance Suspension Active</h4>
            <p className="text-[11px] leading-relaxed text-rose-700 font-medium">
              Reason: {organization.suspendReason} {organization.suspendedAt ? `• Applied on ${format(new Date(organization.suspendedAt), 'dd MMM yyyy, hh:mm a')}` : ''}
            </p>
          </div>
        </div>
      )}

      {organization.status === 'DELETED' && (
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 flex items-start gap-3 text-slate-800 text-xs font-sans shadow-sm">
          <Trash2 className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <h4 className="font-bold">Deleted organization</h4>
            <p className="text-[11px] leading-relaxed font-medium">
              Hidden from lists; its team can&apos;t sign in and its public pages are off. Nothing was erased and the owner was not notified. Restore it to bring it back.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
