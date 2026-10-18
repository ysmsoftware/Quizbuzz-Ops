'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFeatureFlags } from '@/lib/hooks/useFeatureFlags';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import {
  getFlagOrgOverrides,
  setFlagOrgOverride,
  removeFlagOrgOverride,
  getFlagSync,
  repairFlagSync,
} from '@/lib/api/ops';
import { OrganizationCombobox } from '@/components/ui/OrganizationCombobox';
import StatusBadge from '@/components/ui/StatusBadge';
import { useOrganizationNames } from '@/lib/hooks/useOrganizations';
import type { FeatureFlag, FeatureFlagOrgOverride } from '@/lib/types';
import {
  Sliders,
  ShieldAlert,
  Lock,
  User,
  Clock,
  Pause,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { reportFlagOutcome, type ToastFn } from '@/lib/flag-feedback';

interface ConfirmationState {
  isOpen: boolean;
  flagKey: string;
  targetValue: boolean;
  title: string;
  message: string;
  details: string[];
  confirmLabel: string;
  type: 'critical' | 'warning';
}

const CLOSED_CONFIRM: ConfirmationState = {
  isOpen: false,
  flagKey: '',
  targetValue: false,
  title: '',
  message: '',
  details: [],
  confirmLabel: '',
  type: 'warning',
};

// Hand-written confirmation copy for the two original emergency switches. Any other CRITICAL/WARNING
// flag falls through to the generic severity-driven copy.
const CONFIRMATION_COPY: Record<string, { title: string; message: string }> = {
  maintenance_mode: {
    title: 'Activate Platform-Wide Maintenance Mode?',
    message:
      'CRITICAL ACTION: This immediately suspends all active operations, contests, and admin controls across every single tenant organization on the platform. Current users will see a maintenance message.',
  },
  new_registrations_paused: {
    title: 'Pause All Candidate Registrations?',
    message:
      'WARNING: This halts all participant registration queries and operations across all live and upcoming contests platform-wide. Existing registered candidates can still participate.',
  },
};

// Roll-out order for the institution features (portal first: the others need it).
const OPT_IN_ORDER = ['window_contests', 'question_pools', 'participant_portal', 'institution_mode', 'gradebook', 'ambassador_program_enabled'];

const inputClass = 'h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground';

/** Grants an operator can act on: label the verb to match the flag's access model. */
function accessCopy(flag: FeatureFlag) {
  return flag.accessModel === 'OPT_IN'
    ? {
        badge: 'Opt-in per organization',
        // What the big switch means for an opt-in flag — this is NOT "enable for everyone".
        switchHelp: `Master switch. ON = organizations can be granted this feature${
          flag.grantedOrgCount ? ` (${flag.grantedOrgCount} granted now)` : ''
        }. OFF = switched off for every organization immediately, whatever they were granted.`,
        panelLabel: `Granted organizations${flag.grantedOrgCount ? ` (${flag.grantedOrgCount})` : ''}`,
        empty: 'No organization has been granted this feature yet — it is off for everyone.',
        addLabel: 'Grant access',
      }
    : {
        badge: 'On for everyone',
        switchHelp: 'Applies to every organization unless one has its own override.',
        panelLabel: 'Organization overrides',
        empty: 'No overrides — every organization follows the global switch.',
        addLabel: 'Add override',
      };
}

// ─── Sync check: does the main app (which enforces flags) hold what Ops shows? ───
function SyncPanel({ flag, canManage, toast }: { flag: FeatureFlag; canManage: boolean; toast: ToastFn }) {
  const queryClient = useQueryClient();
  const reportQuery = useQuery({
    queryKey: ['ops', 'flags', flag.key, 'sync'],
    queryFn: () => getFlagSync(flag.key),
    staleTime: 0,
  });
  const report = reportQuery.data;
  const names = useOrganizationNames([...(report?.missingInMain ?? []), ...(report?.extraInMain ?? []), ...(report?.mismatched.map((m) => m.organizationId) ?? [])]);
  const label = (id: string) => names[id] ?? id;

  const repair = useMutation({
    mutationFn: (extras: 'keep' | 'adopt' | 'remove') => repairFlagSync(flag.key, extras),
    onSuccess: () => {
      toast('Re-synced', 'The main app now matches Ops for this flag.', 'success');
      queryClient.invalidateQueries({ queryKey: ['ops', 'flags'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
    onError: (err: Error) => toast('Re-sync failed', err.message, 'error'),
  });

  const needsRepair = !!report && (!report.inSync && (report.global.main !== report.global.ops || report.missingInMain.length > 0 || report.mismatched.length > 0));

  return (
    <div className="ml-2 sm:ml-4 p-4 bg-secondary/20 border border-border/30 rounded-lg space-y-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-foreground flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-primary" /> Ops ↔ main app
        </h4>
        <button onClick={() => reportQuery.refetch()} className="flex items-center gap-1 text-primary hover:underline cursor-pointer">
          <RefreshCw className={`h-3 w-3 ${reportQuery.isFetching ? 'animate-spin' : ''}`} /> Re-check
        </button>
      </div>

      {reportQuery.isLoading ? (
        <p className="text-muted-foreground">Comparing…</p>
      ) : reportQuery.isError || !report ? (
        <p className="text-destructive">Couldn&apos;t read the main app&apos;s flag tables: {(reportQuery.error as Error | null)?.message}</p>
      ) : report.inSync ? (
        <p className="flex items-center gap-1.5 text-emerald-600 font-semibold">
          <CheckCircle2 className="h-4 w-4" /> In sync — the main app holds exactly what Ops shows.
        </p>
      ) : (
        <div className="space-y-2">
          {report.global.main !== report.global.ops && (
            <p>
              Global switch: Ops says <b>{report.global.ops ? 'ON' : 'OFF'}</b>, main app has{' '}
              <b>{report.global.main === null ? 'no row' : report.global.main ? 'ON' : 'OFF'}</b>.
            </p>
          )}
          {report.missingInMain.length > 0 && (
            <p>
              <b>{report.missingInMain.length}</b> grant(s) in Ops that the main app doesn&apos;t have (those organizations
              don&apos;t actually get it): {report.missingInMain.map(label).join(', ')}
            </p>
          )}
          {report.mismatched.length > 0 && (
            <p>
              <b>{report.mismatched.length}</b> grant(s) differ in value or expiry: {report.mismatched.map((m) => label(m.organizationId)).join(', ')}
            </p>
          )}
          {report.extraInMain.length > 0 && (
            <p>
              <b>{report.extraInMain.length}</b> grant(s) exist only in the main app (not visible in Ops — e.g. added by a seed script or by
              hand): {report.extraInMain.map(label).join(', ')}. They are left alone unless you choose below.
            </p>
          )}

          {canManage ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {needsRepair && (
                <button
                  onClick={() => repair.mutate('keep')}
                  disabled={repair.isPending}
                  className="h-8 px-3 rounded-md bg-primary text-primary-foreground font-bold cursor-pointer disabled:opacity-50"
                >
                  Re-sync main app from Ops
                </button>
              )}
              {report.extraInMain.length > 0 && (
                <>
                  <button
                    onClick={() => repair.mutate('adopt')}
                    disabled={repair.isPending}
                    className="h-8 px-3 rounded-md border border-border/50 bg-card font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Adopt {report.extraInMain.length} main-only grant(s) into Ops
                  </button>
                  <button
                    onClick={() => repair.mutate('remove')}
                    disabled={repair.isPending}
                    className="h-8 px-3 rounded-md border border-destructive/40 text-destructive font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Remove them from the main app
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Only Super Admins can re-sync.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Per-organization overrides / grants ───
function OrgOverridesPanel({ flag, canManage, toast }: { flag: FeatureFlag; canManage: boolean; toast: ToastFn }) {
  const queryClient = useQueryClient();
  const copy = accessCopy(flag);
  const isOptIn = flag.accessModel === 'OPT_IN';

  const [orgId, setOrgId] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [expiresOn, setExpiresOn] = useState(''); // yyyy-MM-dd, optional
  const [minExpiry] = useState(() => format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');

  const overridesQuery = useQuery({
    queryKey: ['ops', 'flags', flag.key, 'overrides'],
    queryFn: () => getFlagOrgOverrides(flag.key),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'flags'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const setMutation = useMutation({
    mutationFn: () =>
      setFlagOrgOverride(
        flag.key,
        orgId.trim(),
        isOptIn ? true : isEnabled,
        reason.trim(),
        // end of the chosen local day, so "until 30 Oct" includes the 30th
        expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : undefined
      ),
    onSuccess: (outcome) => {
      toast(isOptIn ? 'Access Granted' : 'Override Saved', `"${outcome.override.organizationName ?? orgId}" updated for this flag.`, 'success');
      reportFlagOutcome(toast, outcome);
      setOrgId('');
      setReason('');
      setExpiresOn('');
      setIsEnabled(true);
      invalidate();
    },
    onError: (err: Error) => toast('Failed to Save', err.message || 'Could not set the organization override.', 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (targetOrgId: string) => removeFlagOrgOverride(flag.key, targetOrgId),
    onSuccess: (outcome) => {
      toast(isOptIn ? 'Access Revoked' : 'Override Removed', isOptIn ? 'The organization no longer has this feature.' : 'Organization now follows the global default.', 'success');
      reportFlagOutcome(toast, outcome);
      invalidate();
    },
    onError: (err: Error) => toast('Failed to Remove', err.message || 'Could not remove the organization override.', 'error'),
  });

  const rows: FeatureFlagOrgOverride[] = overridesQuery.data ?? [];

  const status = (o: FeatureFlagOrgOverride) => {
    if (o.isExpired) return <StatusBadge tone="neutral">Expired</StatusBadge>;
    if (isOptIn) return o.isEnabled ? <StatusBadge tone="success">Granted</StatusBadge> : <StatusBadge tone="neutral">Not granted</StatusBadge>;
    return o.isEnabled ? <StatusBadge tone="success">Enabled</StatusBadge> : <StatusBadge tone="danger">Disabled</StatusBadge>;
  };

  return (
    <div className="ml-2 sm:ml-4 p-4 bg-secondary/20 border border-border/30 rounded-lg space-y-4">
      <div className="space-y-2">
        {overridesQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading organizations…</p>
        ) : rows.length ? (
          rows.map((o) => (
            <div
              key={o.id}
              className={`flex items-start justify-between gap-3 p-3 bg-card border border-border/30 rounded-lg ${o.isExpired ? 'opacity-60' : ''}`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{o.organizationName ?? 'Unknown organization'}</span>
                  {status(o)}
                  {o.mirrored === false && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600"
                      title="The main app doesn't hold this exactly. Use Verify sync on this flag."
                    >
                      <AlertTriangle className="h-3 w-3" /> not in main app
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-muted-foreground">{o.organizationId}</p>
                <p className="text-[11px] text-muted-foreground">{o.reason}</p>
                <p className="text-[10px] text-muted-foreground">
                  By {o.createdByName} · {format(parseISO(o.createdAt), 'dd MMM yyyy, hh:mm a')}
                  {o.expiresAt && ` · ${o.isExpired ? 'expired' : 'expires'} ${format(parseISO(o.expiresAt), 'dd MMM yyyy')}`}
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => removeMutation.mutate(o.organizationId)}
                  disabled={removeMutation.isPending}
                  className="shrink-0 p-1.5 rounded-md text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50"
                  title={isOptIn ? 'Revoke access' : 'Remove override'}
                  aria-label={isOptIn ? 'Revoke access' : 'Remove override'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">{copy.empty}</p>
        )}
      </div>

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!orgId.trim() || !reason.trim()) return;
            setMutation.mutate();
          }}
          className="space-y-2 pt-2 border-t border-border/20"
        >
          {flag.requires.length > 0 && (
            <p className="text-[11px] text-amber-600 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                An organization also needs <b>{flag.requires.join(', ')}</b> for this to work — grant that too (you&apos;ll be warned if it&apos;s missing).
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px] space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Organization</label>
              <OrganizationCombobox value={orgId} onChange={setOrgId} />
            </div>
            {!isOptIn && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Value</label>
                <select value={isEnabled ? 'on' : 'off'} onChange={(e) => setIsEnabled(e.target.value === 'on')} className={inputClass}>
                  <option value="on">Enabled</option>
                  <option value="off">Disabled</option>
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Until (optional)</label>
              <input type="date" value={expiresOn} min={minExpiry} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass} />
            </div>
            <div className="flex-[2] min-w-[180px] space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">Reason (required)</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isOptIn ? 'Pilot institution, contract dated…' : 'Add-on purchased per contract dated…'}
                className={`w-full ${inputClass}`}
              />
            </div>
            <button
              type="submit"
              disabled={setMutation.isPending || !orgId.trim() || !reason.trim()}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {setMutation.isPending ? 'Saving…' : copy.addLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── One flag ───
function FlagCard({
  flag,
  labelOf,
  canManage,
  isToggling,
  expanded,
  onExpand,
  onToggle,
  toast,
}: {
  flag: FeatureFlag;
  labelOf: (key: string) => string;
  canManage: boolean;
  isToggling: boolean;
  expanded: 'orgs' | 'sync' | null;
  onExpand: (panel: 'orgs' | 'sync' | null) => void;
  onToggle: () => void;
  toast: ToastFn;
}) {
  const copy = accessCopy(flag);
  const isEmergency = flag.severity !== 'STANDARD';

  return (
    <div className="space-y-2">
      <div
        id={`flag-card-${flag.key}`}
        className={`p-5 sm:p-6 bg-card border rounded-xl shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          flag.isEnabled && isEmergency ? 'border-amber-500/30 bg-amber-500/[0.01]' : 'border-border/40 hover:border-border'
        }`}
      >
        <div className="space-y-2.5 max-w-xl min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-sm sm:text-base text-foreground tracking-tight">{flag.label}</h3>
            <code className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground">{flag.key}</code>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge tone={flag.accessModel === 'OPT_IN' ? 'accent' : 'neutral'}>{copy.badge}</StatusBadge>
            {isEmergency && <StatusBadge tone={flag.severity === 'CRITICAL' ? 'danger' : 'warning'}>{flag.severity}</StatusBadge>}
            {flag.requires.length > 0 && <StatusBadge tone="warning">Needs {flag.requires.map(labelOf).join(' + ')}</StatusBadge>}
            {flag.mirror.state === 'OUT_OF_SYNC' && <StatusBadge tone="danger">Main app out of sync</StatusBadge>}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{flag.description}</p>
          <p className="text-[11px] text-foreground/70 leading-relaxed">{copy.switchHelp}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground font-semibold pt-1 border-t border-border/10">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> By: {flag.updatedByAdminName}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Last changed: {format(parseISO(flag.updatedAt), 'dd MMM yyyy, hh:mm a')}
            </span>
            {flag.supportsOrgOverride && (
              <button
                id={`manage-orgs-btn-${flag.key}`}
                onClick={() => onExpand(expanded === 'orgs' ? null : 'orgs')}
                className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
              >
                <Building2 className="h-3 w-3" />
                {copy.panelLabel}
                {expanded === 'orgs' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
            <button
              onClick={() => onExpand(expanded === 'sync' ? null : 'sync')}
              className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
            >
              <Link2 className="h-3 w-3" /> Verify sync
              {expanded === 'sync' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Toggle */}
        <div className="shrink-0 flex items-center justify-end">
          <div className="relative group/toggle">
            <button
              id={`toggle-btn-${flag.key}`}
              role="switch"
              aria-checked={flag.isEnabled}
              aria-label={`${flag.label} master switch`}
              disabled={!canManage || isToggling}
              onClick={onToggle}
              className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                !canManage ? 'opacity-60 cursor-not-allowed' : ''
              } ${flag.isEnabled ? (isEmergency ? 'bg-amber-500' : 'bg-primary') : 'bg-secondary'}`}
            >
              <span
                className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out ${
                  flag.isEnabled ? 'translate-x-5.5' : 'translate-x-0'
                }`}
              />
            </button>
            {!canManage && (
              <div className="absolute right-0 bottom-full mb-2 hidden group-hover/toggle:block w-52 p-2 bg-popover text-popover-foreground text-[10px] rounded border border-border/50 shadow-md leading-relaxed z-15">
                <Lock className="h-3 w-3 inline mr-1 text-destructive" />
                You don&apos;t have permission to manage feature flags.
              </div>
            )}
          </div>
        </div>
      </div>

      {expanded === 'orgs' && flag.supportsOrgOverride && <OrgOverridesPanel flag={flag} canManage={canManage} toast={toast} />}
      {expanded === 'sync' && <SyncPanel flag={flag} canManage={canManage} toast={toast} />}
    </div>
  );
}

export default function FeatureFlagsView() {
  const { featureFlags, isLoadingFlags, toggleFlag, isToggling } = useFeatureFlags();
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();
  const canManage = hasPermission('FEATURE_FLAG_MANAGE');

  const [confirmState, setConfirmState] = useState<ConfirmationState>(CLOSED_CONFIRM);
  // One expanded panel at a time keeps the list scannable and avoids firing many queries at once.
  const [expanded, setExpanded] = useState<{ key: string; panel: 'orgs' | 'sync' } | null>(null);

  const labelOf = useMemo(() => {
    const map = new Map(featureFlags.map((f) => [f.key, f.label]));
    return (key: string) => map.get(key) ?? key;
  }, [featureFlags]);

  const groups = useMemo(() => {
    const emergency = featureFlags.filter((f) => f.severity !== 'STANDARD');
    const optIn = featureFlags
      .filter((f) => f.severity === 'STANDARD' && f.accessModel === 'OPT_IN')
      .sort((a, b) => (OPT_IN_ORDER.indexOf(a.key) + 1 || 99) - (OPT_IN_ORDER.indexOf(b.key) + 1 || 99));
    const platform = featureFlags.filter((f) => f.severity === 'STANDARD' && f.accessModel === 'GLOBAL');
    return [
      { id: 'safety', title: 'Safety & critical switches', hint: 'Emergency controls and payment gateways. Platform-wide.', flags: emergency },
      {
        id: 'optin',
        title: 'Opt-in features (granted per organization)',
        hint: 'Off for every organization until you grant it. The big switch only makes a feature grantable — and switching it off is a kill switch for all.',
        flags: optIn,
      },
      { id: 'platform', title: 'Platform defaults', hint: 'On for everyone; an organization override carves out an exception.', flags: platform },
    ].filter((g) => g.flags.length > 0);
  }, [featureFlags]);

  if (isLoadingFlags) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        <div className="h-10 w-48 bg-secondary/30 rounded" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border/30" />
          ))}
        </div>
      </div>
    );
  }

  const executeToggle = async (key: string, isEnabled: boolean) => {
    try {
      const outcome = await toggleFlag({ key, isEnabled });
      toast('Feature Flag Updated', `Turned ${isEnabled ? 'ON' : 'OFF'} "${labelOf(key)}".`, 'success');
      reportFlagOutcome(toast, outcome);
    } catch (err: unknown) {
      toast('Operation Failed', err instanceof Error ? err.message : 'Failed to update feature flag.', 'error');
    }
  };

  const handleToggleClick = (flag: FeatureFlag) => {
    if (!canManage) {
      toast('Permission Denied', 'You are not authorized to modify platform feature flags.', 'error');
      return;
    }
    const nextValue = !flag.isEnabled;

    // Turning OFF something that organizations are using (or that other features depend on) is the
    // platform-wide kill switch: make the blast radius explicit first.
    if (!nextValue && (flag.grantedOrgCount > 0 || flag.dependents.length > 0)) {
      const details: string[] = [];
      if (flag.grantedOrgCount > 0) {
        details.push(
          flag.accessModel === 'OPT_IN'
            ? `${flag.grantedOrgCount} organization${flag.grantedOrgCount === 1 ? '' : 's'} currently granted this feature will lose it immediately, even though their grants stay on record.`
            : `${flag.grantedOrgCount} organization override${flag.grantedOrgCount === 1 ? '' : 's'} stay in place, but follow the new global value only where they don't override it.`
        );
      }
      flag.dependents.forEach((d) => details.push(`"${labelOf(d)}" needs this feature, so it stops working for every organization too.`));
      setConfirmState({
        isOpen: true,
        flagKey: flag.key,
        targetValue: false,
        title: `Switch off "${flag.label}" for everyone?`,
        message: 'This takes effect right away, including for contests and portals in use.',
        details,
        confirmLabel: 'Yes, switch it off',
        type: 'critical',
      });
      return;
    }

    // CRITICAL/WARNING flags require confirmation when turning ON.
    if (nextValue && (flag.severity === 'CRITICAL' || flag.severity === 'WARNING')) {
      const copy = CONFIRMATION_COPY[flag.key] ?? {
        title: `${flag.severity === 'CRITICAL' ? 'Activate' : 'Enable'} "${flag.label}"?`,
        message:
          flag.severity === 'CRITICAL'
            ? `CRITICAL ACTION: This is a platform-wide, high-impact change. Confirm you want to turn "${flag.label}" ON.`
            : `WARNING: This is a platform-wide change with user-facing impact. Confirm you want to turn "${flag.label}" ON.`,
      };
      setConfirmState({
        isOpen: true,
        flagKey: flag.key,
        targetValue: true,
        title: copy.title,
        message: copy.message,
        details: [],
        confirmLabel: 'Yes, commit global change',
        type: flag.severity === 'CRITICAL' ? 'critical' : 'warning',
      });
      return;
    }

    void executeToggle(flag.key, nextValue);
  };

  const handleConfirmAction = () => {
    void executeToggle(confirmState.flagKey, confirmState.targetValue);
    setConfirmState(CLOSED_CONFIRM);
  };

  const registrationsPaused = featureFlags.find((f) => f.key === 'new_registrations_paused')?.isEnabled;
  const outOfSync = featureFlags.filter((f) => f.mirror.state === 'OUT_OF_SYNC');

  return (
    <div className="space-y-8 font-sans max-w-4xl mx-auto pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Sliders className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Ops Workspace</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Feature Flags</h1>
          <p className="text-xs text-muted-foreground max-w-xl">
            Control what the platform and each organization can use. Every change is written to the audit trail and mirrored to the main app, which is
            what actually enforces it.
          </p>
        </div>

        {registrationsPaused && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse self-start sm:self-center">
            <Pause className="h-3.5 w-3.5" />
            Registrations paused
          </span>
        )}
      </div>

      {!canManage && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold">Read-Only Access</h4>
            <p className="leading-relaxed opacity-90">
              Toggling global flags and per-organization overrides is limited to <strong>SUPER_ADMIN</strong>.
            </p>
          </div>
        </div>
      )}

      {outOfSync.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-xs">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-foreground">The main app disagrees with Ops on {outOfSync.length} flag{outOfSync.length === 1 ? '' : 's'}</h4>
            <p className="text-muted-foreground">
              {outOfSync.map((f) => f.label).join(', ')}. Open <b>Verify sync</b> on each to see the difference and re-sync.
            </p>
          </div>
        </div>
      )}

      {/* GROUPS */}
      {groups.map((group) => (
        <section key={group.id} className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">{group.title}</h2>
            <p className="text-[11px] text-muted-foreground max-w-2xl">{group.hint}</p>
          </div>
          {group.flags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              labelOf={labelOf}
              canManage={canManage}
              isToggling={isToggling}
              expanded={expanded?.key === flag.key ? expanded.panel : null}
              onExpand={(panel) => setExpanded(panel ? { key: flag.key, panel } : null)}
              onToggle={() => handleToggleClick(flag)}
              toast={toast}
            />
          ))}
        </section>
      ))}

      {/* CONFIRMATION */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setConfirmState(CLOSED_CONFIRM)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmState.title}
            className="relative bg-card border border-border/60 rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4"
          >
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
                <h2 className="text-base font-black text-foreground tracking-tight leading-tight">{confirmState.title}</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">{confirmState.message}</p>
                {confirmState.details.length > 0 && (
                  <ul className="list-disc pl-4 space-y-1 text-xs text-foreground/80">
                    {confirmState.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmState(CLOSED_CONFIRM)}
                className="h-9 px-4 rounded-md hover:bg-secondary/60 text-foreground font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-flag-toggle-btn"
                onClick={handleConfirmAction}
                className={`h-9 px-4 rounded-md text-white font-extrabold text-xs transition-colors cursor-pointer ${
                  confirmState.type === 'critical' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
