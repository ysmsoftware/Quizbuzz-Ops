'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/api/utils';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';

interface TopUp { id: string; credits: number; invoiceId: string | null; reason: string | null; expiresAt: string; createdAt: string }

/** The plan's monthly AI allowance, plus one-time packs (bought, or given by ops). The AI module spends them. */
export default function AiCreditsCard({ organizationId, perMonth, canGrant }: { organizationId: string; perMonth: number | null; canGrant: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = ['organizations', 'ai-credits', organizationId];
  const { data: topUps = [] } = useQuery({ queryKey: key, queryFn: () => apiRequest<TopUp[]>(`/api/v1/ops/organizations/${organizationId}/ai-credits`) });
  const [credits, setCredits] = useState('500');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const live = topUps.filter((t) => new Date(t.expiresAt) > new Date());

  const grant = async () => {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/ops/organizations/${organizationId}/ai-credits`, { method: 'POST', body: JSON.stringify({ credits: Number(credits), months: 12, reason: reason.trim() }) });
      toast('Credits added', `${credits} AI credits, valid 12 months.`, 'success');
      setReason('');
      queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast('Could not add them', errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-6 bg-card border border-border/50 rounded-xl space-y-3 text-xs">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> AI credits</h3>
      <p className="text-muted-foreground">
        {perMonth == null ? 'Unlimited' : perMonth.toLocaleString('en-IN')} a month from the plan, plus{' '}
        <strong className="text-foreground">{live.reduce((s, t) => s + t.credits, 0).toLocaleString('en-IN')}</strong> from top-ups.
      </p>
      {topUps.length > 0 && (
        <ul className="space-y-1">
          {topUps.map((t) => (
            <li key={t.id} className={new Date(t.expiresAt) <= new Date() ? 'text-muted-foreground line-through' : ''}>
              {t.credits.toLocaleString('en-IN')} · {t.invoiceId ? 'bought' : `given: ${t.reason}`} · expires {format(new Date(t.expiresAt), 'MMM d, yyyy')}
            </li>
          ))}
        </ul>
      )}
      {canGrant && (
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/40">
          <label className="flex flex-col gap-1">Credits<input type="number" min="1" value={credits} onChange={(e) => setCredits(e.target.value)} className="w-24 px-2 py-1 rounded-md border border-input bg-background" /></label>
          <label className="flex flex-col gap-1 flex-1 min-w-40">Reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pilot, goodwill…" className="px-2 py-1 rounded-md border border-input bg-background" /></label>
          <button type="button" disabled={busy || !reason.trim() || !(Number(credits) > 0)} onClick={grant} className="px-3 py-1.5 font-semibold rounded-md bg-primary text-primary-foreground disabled:opacity-50">Give credits</button>
        </div>
      )}
    </section>
  );
}
