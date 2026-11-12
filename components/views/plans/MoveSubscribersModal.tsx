'use client';

import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Users, X } from 'lucide-react';
import { SubscriptionPlan } from '@/lib/types';
import { migratePlanSubscribers, MigratePreview } from '@/lib/api/organizations';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';

const METHOD: Record<string, string> = { AUTO_DEBIT: 'auto-debit', PAY_ONLINE: 'pay online', OFFLINE: 'offline', COMPLIMENTARY: 'complimentary' };

/** Moves everyone on one plan to another, usually a new version. Shows who it touches before it does anything. */
export default function MoveSubscribersModal({ plan, plans, onClose }: { plan: SubscriptionPlan; plans: SubscriptionPlan[]; onClose: () => void }) {
  const targets = plans.filter((p) => p.id !== plan.id && p.isActive && !p.organizationId);
  const [toPlanId, setToPlanId] = useState(targets[0]?.id ?? '');
  const [when, setWhen] = useState<'renewal' | 'now'>('renewal');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<MigratePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toPlanId) return;
    let live = true;
    migratePlanSubscribers(plan.id, { toPlanId, when, dryRun: true, reason: 'preview' })
      .then((p) => live && setPreview(p))
      .catch((err) => live && toast('Could not count them', errorMessage(err), 'error'));
    return () => { live = false; };
  }, [plan.id, toPlanId, when, toast]);

  const run = async () => {
    setBusy(true);
    try {
      const result = await migratePlanSubscribers(plan.id, { toPlanId, when, dryRun: false, reason: reason.trim() });
      toast('Done', when === 'renewal' ? `${result.moved} organizations move at their renewal.` : `${result.moved} organizations moved.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onClose();
    } catch (err) {
      toast('Could not move them', errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border border-border/80 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border/50 bg-muted/20">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Move subscribers of {plan.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4 text-xs">
          <div>
            <label htmlFor="mv-to" className="block font-semibold mb-1">Move them to</label>
            <select id="mv-to" value={toPlanId} onChange={(e) => setToPlanId(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-input">
              {targets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>)}
            </select>
          </div>
          <fieldset className="space-y-1">
            <legend className="block font-semibold mb-1">When</legend>
            <label className="flex items-center gap-2"><input type="radio" name="mv-when" checked={when === 'renewal'} onChange={() => setWhen('renewal')} /> At each one&apos;s renewal: prepaid time keeps its price</label>
            <label className="flex items-center gap-2"><input type="radio" name="mv-when" checked={when === 'now'} onChange={() => setWhen('now')} /> Now, keeping their dates</label>
          </fieldset>
          {preview && (
            <div className="rounded-lg bg-muted/30 p-3 space-y-1">
              <p><strong>{preview.movable}</strong> of {preview.total} organizations will move{preview.skipped > 0 && <>; {preview.skipped} are on a cycle the new plan doesn&apos;t offer and are left for you</>}.</p>
              {Object.keys(preview.byMethod).length > 0 && (
                <p className="text-muted-foreground">{Object.entries(preview.byMethod).map(([m, n]) => `${n} ${METHOD[m] ?? m}`).join(', ')}</p>
              )}
              {preview.autoDebitNeedingApproval > 0 && (
                <p className="text-amber-600">{preview.autoDebitNeedingApproval} pay by auto-debit. If the price differs, their mandate keeps charging the old price until they approve a new one; they&apos;re emailed.</p>
              )}
            </div>
          )}
          <div>
            <label htmlFor="mv-reason" className="block font-semibold mb-1">Reason (required, shown in their history)</label>
            <input id="mv-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-input" />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
            <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-md border border-input bg-background hover:bg-muted">Cancel</button>
            <button type="button" onClick={run} disabled={busy || !toPlanId || !reason.trim() || !preview?.movable} className="px-3.5 py-1.5 font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              {busy ? 'Moving...' : `Move ${preview?.movable ?? ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
