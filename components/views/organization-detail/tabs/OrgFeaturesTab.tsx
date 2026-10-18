'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Trash2, KeyRound, ExternalLink } from 'lucide-react';
import { useOrgFeatures } from '@/lib/hooks/useOrganizations';
import { useToast } from '@/components/ui/Toast';
import StatusBadge from '@/components/ui/StatusBadge';
import { setFlagOrgOverride, removeFlagOrgOverride } from '@/lib/api/ops';
import { reportFlagOutcome } from '@/lib/flag-feedback';
import { INSTITUTION_FLAG_KEYS } from '@/lib/constants/institution';
import type { OrgFeatureAccess } from '@/server/features/feature-flags/feature-flags.types';

const inputClass = 'h-8 px-2 text-xs rounded-md bg-background border border-border/40 text-foreground';

/** Plain-language state of one feature for this organization. */
function describeState(f: OrgFeatureAccess): { badge: React.ReactNode; detail: string } {
  if (f.usable) return { badge: <StatusBadge tone="success">Has it</StatusBadge>, detail: f.effective.reason === 'override' ? 'Granted to this organization.' : 'On for every organization.' };
  if (f.effective.value && f.blockedBy.length > 0) {
    return { badge: <StatusBadge tone="warning">Granted, but blocked</StatusBadge>, detail: 'It will not appear until the prerequisite below is also on for this organization.' };
  }
  switch (f.effective.reason) {
    case 'kill_switch':
      return { badge: <StatusBadge tone="danger">Off for everyone</StatusBadge>, detail: 'Switched off globally (kill switch). Any grant is ignored until the global switch is back on.' };
    case 'not_granted':
      return { badge: <StatusBadge tone="neutral">Not granted</StatusBadge>, detail: 'Opt-in feature this organization has not been granted.' };
    case 'override':
      return { badge: <StatusBadge tone="danger">Disabled for this org</StatusBadge>, detail: 'An override turns it off for this organization only.' };
    default:
      return { badge: <StatusBadge tone="danger">Off</StatusBadge>, detail: 'Switched off globally.' };
  }
}

function FeatureRow({ f, labelOf, canManage, onGrant, onRevoke, busy }: {
  f: OrgFeatureAccess;
  labelOf: (key: string) => string;
  canManage: boolean;
  onGrant: (key: string, reason: string, until?: string) => Promise<void>;
  onRevoke: (key: string) => void;
  busy: boolean;
}) {
  const [granting, setGranting] = useState(false);
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  // earliest end date (tomorrow), captured when the form opens so render stays pure
  const [minDate, setMinDate] = useState('');
  const state = describeState(f);
  const isOptIn = f.accessModel === 'OPT_IN';
  const hasLiveGrant = !!f.override && f.override.isEnabled && !f.override.isExpired;

  return (
    <div className="p-4 border border-border/30 rounded-xl bg-card space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 max-w-xl">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-sm text-foreground">{f.label}</h4>
            {state.badge}
            {f.inSync === false && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600" title="Ops and the main app give different answers. Run Verify sync on the Feature Flags page.">
                <AlertTriangle className="h-3 w-3" /> main app differs
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{f.description}</p>
          <p className="text-[11px] text-foreground/80">{state.detail}</p>
          {f.blockedBy.length > 0 && (
            <p className="text-[11px] text-amber-600 flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> Needs <b>{f.blockedBy.map(labelOf).join(', ')}</b> for this organization.
            </p>
          )}
          {f.override && (
            <p className="text-[10px] text-muted-foreground">
              Override: {f.override.isEnabled ? 'granted' : 'disabled'} by {f.override.createdByName} — “{f.override.reason}”
              {f.override.expiresAt && ` · ${f.override.isExpired ? 'expired' : 'until'} ${format(parseISO(f.override.expiresAt), 'dd MMM yyyy')}`}
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {isOptIn && canManage && hasLiveGrant && (
            <button
              onClick={() => onRevoke(f.key)}
              disabled={busy}
              className="flex items-center gap-1 h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Revoke
            </button>
          )}
          {isOptIn && canManage && !hasLiveGrant && !granting && (
            <button
              onClick={() => {
                setMinDate(format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
                setGranting(true);
              }}
              className="flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5" /> Grant access
            </button>
          )}
          {!isOptIn && (
            <Link href="/dashboard/flags" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
              Manage on Feature Flags <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {granting && (
        <form
          className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/20"
          onSubmit={async (e) => {
            e.preventDefault();
            await onGrant(f.key, reason.trim(), until || undefined);
            setGranting(false);
            setReason('');
            setUntil('');
          }}
        >
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Reason (required)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pilot institution, contract dated…" className={`w-full ${inputClass}`} autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Until (optional)</label>
            <input type="date" value={until} min={minDate} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" disabled={busy || !reason.trim()} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-50">
            {busy ? 'Saving…' : 'Grant'}
          </button>
          <button type="button" onClick={() => setGranting(false)} className="h-8 px-3 rounded-md border border-border/50 text-xs font-semibold text-muted-foreground cursor-pointer">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

/** What this organization can actually use, why, and one-click grant / revoke for opt-in features. */
export default function OrgFeaturesTab({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useOrgFeatures(orgId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['organizations'] });
    queryClient.invalidateQueries({ queryKey: ['ops', 'flags'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    queryClient.invalidateQueries({ queryKey: ['platformStats'] });
  };

  const grant = useMutation({
    mutationFn: ({ key, reason, until }: { key: string; reason: string; until?: string }) =>
      setFlagOrgOverride(key, orgId, true, reason, until ? new Date(`${until}T23:59:59`).toISOString() : undefined),
    onSuccess: (outcome) => {
      toast('Access Granted', 'The feature is now granted to this organization.', 'success');
      reportFlagOutcome(toast, outcome);
      invalidate();
    },
    onError: (err: Error) => toast('Failed to grant', err.message, 'error'),
  });

  const revoke = useMutation({
    mutationFn: (key: string) => removeFlagOrgOverride(key, orgId),
    onSuccess: (outcome) => {
      toast('Access Revoked', 'This organization no longer has the feature.', 'success');
      reportFlagOutcome(toast, outcome);
      invalidate();
    },
    onError: (err: Error) => toast('Failed to revoke', err.message, 'error'),
  });

  if (isLoading) return <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading feature access...</div>;
  if (isError || !data) {
    return (
      <div className="p-12 text-center text-xs space-y-2">
        <AlertTriangle className="h-6 w-6 text-destructive/70 mx-auto" />
        <p className="font-semibold text-foreground">Couldn&apos;t load feature access</p>
        <p className="text-muted-foreground">{(error as Error | null)?.message}</p>
        <button onClick={() => refetch()} className="px-3 py-1.5 font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary cursor-pointer">Retry</button>
      </div>
    );
  }

  const labels = new Map(data.map((f) => [f.key, f.label]));
  const labelOf = (key: string) => labels.get(key) ?? key;
  const institution = INSTITUTION_FLAG_KEYS.map((k) => data.find((f) => f.key === k)).filter((f): f is OrgFeatureAccess => !!f);
  const others = data.filter((f) => !(INSTITUTION_FLAG_KEYS as readonly string[]).includes(f.key));

  const rows = (list: OrgFeatureAccess[]) =>
    list.map((f) => (
      <FeatureRow
        key={f.key}
        f={f}
        labelOf={labelOf}
        canManage={canManage}
        busy={grant.isPending || revoke.isPending}
        onGrant={async (key, reason, until) => {
          await grant.mutateAsync({ key, reason, until }).catch(() => undefined);
        }}
        onRevoke={(key) => revoke.mutate(key)}
      />
    ));

  return (
    <div className="space-y-6 font-sans">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Institution features</h3>
          <p className="text-[11px] text-muted-foreground">Opt-in per organization. The answer shown is what the main app will actually enforce.</p>
        </div>
        {rows(institution)}
      </section>

      {others.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Other features</h3>
            <p className="text-[11px] text-muted-foreground">Platform defaults and other opt-in features that can be overridden per organization.</p>
          </div>
          {rows(others)}
        </section>
      )}
    </div>
  );
}
