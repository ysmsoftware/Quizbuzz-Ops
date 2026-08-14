'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOps } from '@/lib/hooks/useOps';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { getFlagOrgOverrides, setFlagOrgOverride, removeFlagOrgOverride } from '@/lib/api/ops';
import { OrganizationCombobox } from '@/components/ui/OrganizationCombobox';
import { useOrganizations } from '@/lib/hooks/useOrganizations';
import {
  Sliders,
  HelpCircle,
  AlertOctagon,
  User,
  Clock,
  ShieldAlert,
  Lock,
  Unlock,
  Play,
  Pause,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ConfirmationState {
  isOpen: boolean;
  flagKey: string;
  flagLabel: string;
  targetValue: boolean;
  title: string;
  message: string;
  type: 'critical' | 'warning';
}

type ToastFn = (title: string, description?: string, type?: 'success' | 'warning' | 'error' | 'info') => void;

// Per-org override management for one flag — only rendered for flags with
// supportsOrgOverride: true. Read-open (any admin can see who has an
// override); every mutating control is gated by canManage.
function OrgOverridesPanel({ flagKey, canManage, toast }: { flagKey: string; canManage: boolean; toast: ToastFn }) {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [reason, setReason] = useState('');

  const overridesQuery = useQuery({
    queryKey: ['ops', 'flags', flagKey, 'overrides'],
    queryFn: () => getFlagOrgOverrides(flagKey),
  });

  // Resolve raw organizationId -> name/owner for display only — the override
  // rows themselves and every mutation still key off the plain id.
  const { organizations } = useOrganizations({ limit: 500 });
  const orgById = new Map((organizations ?? []).map((o) => [o.id, o]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'flags', flagKey, 'overrides'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const setMutation = useMutation({
    mutationFn: () => setFlagOrgOverride(flagKey, orgId.trim(), isEnabled, reason.trim()),
    onSuccess: () => {
      const orgName = orgById.get(orgId.trim())?.name ?? orgId.trim();
      toast('Override Saved', `"${orgName}" now has an override for this flag.`, 'success');
      setOrgId('');
      setReason('');
      setIsEnabled(true);
      invalidate();
    },
    onError: (err: any) => {
      toast('Failed to Save Override', err?.message || 'Could not set the organization override.', 'error');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (targetOrgId: string) => removeFlagOrgOverride(flagKey, targetOrgId),
    onSuccess: () => {
      toast('Override Removed', 'Organization now follows the global default.', 'success');
      invalidate();
    },
    onError: (err: any) => {
      toast('Failed to Remove Override', err?.message || 'Could not remove the organization override.', 'error');
    },
  });

  return (
    <div className="ml-2 sm:ml-4 p-4 bg-secondary/20 border border-border/30 rounded-lg space-y-4">
      <div className="space-y-2">
        {overridesQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading organization overrides…</p>
        ) : overridesQuery.data?.length ? (
          overridesQuery.data.map((override) => {
            const org = orgById.get(override.organizationId);
            return (
            <div
              key={override.id}
              className="flex items-start justify-between gap-3 p-3 bg-card border border-border/30 rounded-lg"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">
                    {org?.name ?? 'Unknown organization'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      override.isEnabled ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {override.isEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {org?.ownerName ?? org?.ownerEmail ?? override.organizationId}
                </p>
                <p className="text-[11px] text-muted-foreground">{override.reason}</p>
                <p className="text-[10px] text-muted-foreground">
                  By {override.createdByName} · {format(parseISO(override.createdAt), 'dd MMM yyyy, hh:mm a')}
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => removeMutation.mutate(override.organizationId)}
                  disabled={removeMutation.isPending}
                  className="shrink-0 p-1.5 rounded-md text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50"
                  title="Remove override"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground">No organizations have an override — all follow the global default.</p>
        )}
      </div>

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!orgId.trim() || !reason.trim()) return;
            setMutation.mutate();
          }}
          className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/20"
        >
          <div className="flex-1 min-w-[220px] space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Organization</label>
            <OrganizationCombobox value={orgId} onChange={setOrgId} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Value</label>
            <select
              value={isEnabled ? 'on' : 'off'}
              onChange={(e) => setIsEnabled(e.target.value === 'on')}
              className="h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
            >
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
          </div>
          <div className="flex-[2] min-w-[180px] space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Reason (required)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add-on purchased per contract dated…"
              className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground"
            />
          </div>
          <button
            type="submit"
            disabled={setMutation.isPending || !orgId.trim() || !reason.trim()}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {setMutation.isPending ? 'Saving…' : 'Add Override'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function FeatureFlagsView() {
  const { featureFlags, isLoadingFlags, toggleFlag, isToggling } = useOps();
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();

  // Modal dialog confirmation state
  const [confirmState, setConfirmState] = useState<ConfirmationState>({
    isOpen: false,
    flagKey: '',
    flagLabel: '',
    targetValue: false,
    title: '',
    message: '',
    type: 'warning',
  });

  const canManage = hasPermission('FEATURE_FLAG_MANAGE');

  // Only one flag's org-override panel open at a time — keeps the list
  // scannable and avoids firing N override queries at once.
  const [expandedFlagKey, setExpandedFlagKey] = useState<string | null>(null);

  if (isLoadingFlags) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        <div className="h-10 w-48 bg-secondary/30 rounded" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border/30" />
          ))}
        </div>
      </div>
    );
  }

  // Copy overrides for the two flags whose confirmation text was
  // hand-written before severity became data-driven. Any other CRITICAL/
  // WARNING flag (e.g. a future disable_paid_contest_publishing) falls
  // through to the generic severity-driven copy below instead of requiring
  // a new if-branch here — see finding 1.5.
  const CONFIRMATION_COPY: Record<string, { title: string; message: string }> = {
    maintenance_mode: {
      title: 'Activate Platform-Wide Maintenance Mode?',
      message: 'CRITICAL ACTION: This immediately suspends all active operations, contests, and admin controls across every single tenant organization on the platform. Current users will see a maintenance message.',
    },
    new_registrations_paused: {
      title: 'Pause All Candidate Registrations?',
      message: 'WARNING: This halts all participant registration queries and operations across all live and upcoming contests platform-wide. Existing registered candidates can still participate.',
    },
  };

  const handleToggleClick = (flagKey: string, flagLabel: string, currentValue: boolean, severity: string) => {
    if (!canManage) {
      toast('Permission Denied', 'You are not authorized to modify platform feature flags.', 'error');
      return;
    }

    const nextValue = !currentValue;

    // CRITICAL/WARNING flags require confirmation when turning ON.
    if (nextValue === true && (severity === 'CRITICAL' || severity === 'WARNING')) {
      const copy = CONFIRMATION_COPY[flagKey] ?? {
        title: `${severity === 'CRITICAL' ? 'Activate' : 'Enable'} "${flagLabel}"?`,
        message:
          severity === 'CRITICAL'
            ? `CRITICAL ACTION: This is a platform-wide, high-impact change. Confirm you want to turn "${flagLabel}" ON.`
            : `WARNING: This is a platform-wide change with user-facing impact. Confirm you want to turn "${flagLabel}" ON.`,
      };
      setConfirmState({
        isOpen: true,
        flagKey,
        flagLabel,
        targetValue: nextValue,
        title: copy.title,
        message: copy.message,
        type: severity === 'CRITICAL' ? 'critical' : 'warning',
      });
      return;
    }

    // Direct toggle for all other cases
    executeToggle(flagKey, nextValue);
  };

  const executeToggle = async (key: string, isEnabled: boolean) => {
    try {
      await toggleFlag({ key, isEnabled });
      toast(
        'Feature Flag Updated', 
        `Successfully turned ${isEnabled ? 'ON' : 'OFF'} the "${key}" feature flag.`, 
        'success'
      );
      // Dispatch a custom event to tell the app shell to immediately update the maintenance banner
      window.dispatchEvent(new CustomEvent('quizbuzz_flag_updated', { detail: { key, isEnabled } }));
    } catch (err: any) {
      toast('Operation Failed', err?.message || 'Failed to update feature flag.', 'error');
    }
  };

  const handleConfirmAction = () => {
    executeToggle(confirmState.flagKey, confirmState.targetValue);
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="space-y-8 font-sans max-w-4xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Sliders className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Ops Workspace</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Platform-Wide Feature Flags
          </h1>
          <p className="text-xs text-muted-foreground max-w-xl">
            Toggle global configurations to manage traffic spikes, deploy hotfixes, or activate emergency lockouts. All operations write directly to the persistent platform audit trail.
          </p>
        </div>

        {/* Live Registrations Status Badge */}
        {featureFlags.find(f => f.key === 'new_registrations_paused')?.isEnabled && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse self-start sm:self-center">
            <Pause className="h-3.5 w-3.5" />
            Registrations paused
          </span>
        )}
      </div>

      {/* READ-ONLY ROLE WARNING BANNER */}
      {!canManage && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold">Read-Only Access</h4>
            <p className="leading-relaxed opacity-90">
              You don&apos;t have permission to manage feature flags. Toggling global configuration flags and per-organization overrides is limited to <strong>SUPER_ADMIN</strong>.
            </p>
          </div>
        </div>
      )}

      {/* FEATURE FLAGS LIST */}
      <div className="space-y-4">
        {featureFlags.map(flag => {
          const isEmergency = flag.severity !== 'STANDARD';
          const isExpanded = expandedFlagKey === flag.key;

          return (
            <div key={flag.id} className="space-y-2">
              <div
                id={`flag-card-${flag.key}`}
                className={`p-5 sm:p-6 bg-card border rounded-xl shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative group ${
                  flag.isEnabled && isEmergency
                    ? 'border-amber-500/30 bg-amber-500/[0.01]'
                    : 'border-border/40 hover:border-border'
                }`}
              >
                <div className="space-y-2.5 max-w-xl">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm sm:text-base text-foreground tracking-tight">
                      {flag.label}
                    </h3>
                    <code className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground">
                      {flag.key}
                    </code>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {flag.description}
                  </p>

                  {/* Meta details changed log */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground font-semibold pt-1 border-t border-border/10">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      By: {flag.updatedByAdminName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Last changed: {format(parseISO(flag.updatedAt), 'dd MMM yyyy, hh:mm a')}
                    </span>
                    {flag.supportsOrgOverride && (
                      <button
                        id={`manage-orgs-btn-${flag.key}`}
                        onClick={() => setExpandedFlagKey(isExpanded ? null : flag.key)}
                        className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                      >
                        <Building2 className="h-3 w-3" />
                        Manage organizations
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Toggle Switch Component with read-only clearance tooltip */}
                <div className="shrink-0 flex items-center justify-end">
                  <div className="relative group/toggle">
                    <button
                      id={`toggle-btn-${flag.key}`}
                      disabled={!canManage || isToggling}
                      onClick={() => handleToggleClick(flag.key, flag.label, flag.isEnabled, flag.severity)}
                      className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        !canManage ? 'opacity-60 cursor-not-allowed' : ''
                      } ${
                        flag.isEnabled
                          ? (isEmergency ? 'bg-amber-500' : 'bg-primary')
                          : 'bg-secondary'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out ${
                          flag.isEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* Explanatory Tooltip when hovering a disabled flag switch */}
                    {!canManage && (
                      <div className="absolute right-0 bottom-full mb-2 hidden group-hover/toggle:block w-52 p-2 bg-popover text-popover-foreground text-[10px] rounded border border-border/50 shadow-md leading-relaxed z-15">
                        <Lock className="h-3 w-3 inline mr-1 text-destructive" />
                        You don&apos;t have permission to manage feature flags.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && flag.supportsOrgOverride && (
                <OrgOverridesPanel flagKey={flag.key} canManage={canManage} toast={toast} />
              )}
            </div>
          );
        })}
      </div>

      {/* CONFIRMATION OVERLAY MODAL */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop scrim */}
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm" 
            onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
          />
          
          {/* Modal Container */}
          <div className="relative bg-card border border-border/60 rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              {confirmState.type === 'critical' ? (
                <div className="p-2.5 bg-red-500/10 text-red-500 rounded-lg shrink-0">
                  <ShieldAlert className="h-6 w-6" />
                </div>
              ) : (
                <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-lg shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              )}

              <div className="space-y-1.5 min-w-0">
                <h2 className="text-base font-black text-foreground tracking-tight leading-none">
                  {confirmState.title}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {confirmState.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                className="h-9 px-4 rounded-md hover:bg-secondary/60 text-foreground font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-flag-toggle-btn"
                onClick={handleConfirmAction}
                className={`h-9 px-4 rounded-md text-white font-extrabold text-xs transition-colors cursor-pointer ${
                  confirmState.type === 'critical' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                Yes, Commit Global Override
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
