'use client';

import React, { useState } from 'react';
import { usePaymentTimeline, useNeedsAttention, useRetryTransfer } from '@/lib/hooks/usePayouts';
import { useToast } from '@/components/ui/Toast';
import { format } from 'date-fns';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  IndianRupee,
  Building2,
  Receipt,
  ShieldAlert,
} from 'lucide-react';

interface PayoutInvestigationPanelProps {
  canEdit: boolean;
}

const severityStyles: Record<string, { dot: string; icon: React.ReactNode; text: string }> = {
  ok: { dot: 'bg-emerald-500', icon: <CheckCircle2 className="h-4 w-4" />, text: 'text-emerald-600' },
  pending: { dot: 'bg-amber-500', icon: <Clock className="h-4 w-4" />, text: 'text-amber-600' },
  problem: { dot: 'bg-rose-500', icon: <AlertTriangle className="h-4 w-4" />, text: 'text-rose-600' },
};

export default function PayoutInvestigationPanel({ canEdit }: PayoutInvestigationPanelProps) {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [needsAttentionPage, setNeedsAttentionPage] = useState(1);

  const { data: timeline, isLoading: isLoadingTimeline, isFetched } = usePaymentTimeline(
    activeSearch,
    activeSearch.trim().length >= 3
  );
  const { data: needsAttention, isLoading: isLoadingNeedsAttention } = useNeedsAttention({
    page: needsAttentionPage,
    limit: 10,
  });
  const retryMutation = useRetryTransfer();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchInput.trim());
  };

  const handleInvestigate = (paymentId: string) => {
    setSearchInput(paymentId);
    setActiveSearch(paymentId);
  };

  const handleRetry = async (paymentId: string) => {
    try {
      await retryMutation.mutateAsync(paymentId);
      toast('Retry Enqueued', 'The transfer will be attempted again shortly. Refresh the timeline in a moment to see the outcome.', 'success');
    } catch (err: any) {
      toast('Retry Failed', err.message || 'Could not enqueue the retry', 'error');
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Needs Attention */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            <h3 className="font-semibold text-foreground text-sm">Needs Attention</h3>
            {needsAttention?.total !== undefined && needsAttention.total > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/15 text-rose-600 font-bold">
                {needsAttention.total}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Payments that succeeded with no transfer record at all, or transfers stuck PENDING with no failure reason,
            past the normal processing window. Click one to see its full chain of events.
          </p>
        </div>

        {isLoadingNeedsAttention ? (
          <div className="py-8 text-center text-xs text-muted-foreground font-mono animate-pulse">Scanning...</div>
        ) : !needsAttention?.data || needsAttention.data.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Nothing needs attention right now.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {needsAttention.data.map((item) => (
              <button
                key={`${item.issueType}-${item.paymentId}`}
                onClick={() => handleInvestigate(item.paymentId)}
                className="w-full text-left px-4 py-3 hover:bg-secondary/15 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.issueType === 'MISSING_TRANSFER'
                        ? 'bg-rose-500/15 text-rose-600'
                        : 'bg-amber-500/15 text-amber-600'
                    }`}
                  >
                    {item.issueType === 'MISSING_TRANSFER' ? 'NO TRANSFER RECORD' : 'STUCK PENDING'}
                  </span>
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate">{item.organizationName}</span>
                  <span className="text-xs font-mono text-muted-foreground truncate">{item.paymentId}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="font-mono font-bold text-foreground flex items-center">
                    <IndianRupee className="h-3 w-3" />
                    {item.grossAmount.toLocaleString('en-IN')}
                  </span>
                  <span className="text-muted-foreground">{item.ageMinutes}m ago</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search / Timeline */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/40">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Trace a Registration or Payment
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Search by registration reference, participant email or phone, or a payment/order ID, to see the full
            chain: registered, order created, payment captured, transfer enqueued, transfer processed or failed.
            This is what a support ticket usually gives you — "participant X registered for contest Y" — not a
            payment ID.
          </p>
          <form onSubmit={handleSearch} className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="QB-2026-00001 / jane@example.com / +91xxxxxxxxxx / pay_xxx / order_xxx"
                className="w-full text-xs font-mono pl-8 pr-3 py-2 rounded-lg border border-border/40 bg-secondary/10 focus:outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              Search
            </button>
          </form>
        </div>

        <div className="p-4">
          {!activeSearch ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Search for a registration or payment, or click an item above, to see its timeline.
            </div>
          ) : isLoadingTimeline ? (
            <div className="py-8 text-center text-xs text-muted-foreground font-mono animate-pulse">
              Tracing...
            </div>
          ) : timeline?.matches && timeline.matches.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground pb-1">
                {timeline.matches.length} registrations match &ldquo;{activeSearch}&rdquo; — pick one:
              </p>
              {timeline.matches.map((m) => (
                <button
                  key={m.participantId}
                  onClick={() => handleInvestigate(m.participantId)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border/40 hover:bg-secondary/15 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground">
                      {m.participantName} <span className="font-normal text-muted-foreground">— {m.contestTitle || 'Unknown contest'}</span>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {m.registrationRef} · {m.organizationName} · {m.contactEmail || m.contactPhone}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
                    {format(new Date(m.registeredAt), 'dd MMM yyyy')}
                  </span>
                </button>
              ))}
            </div>
          ) : isFetched && !timeline?.found ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No registration or payment found matching &ldquo;{activeSearch}&rdquo;.
            </div>
          ) : timeline?.found ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/30">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Building2 className="h-4 w-4 text-primary" />
                    {timeline.organizationName}
                    {timeline.contestTitle && (
                      <span className="text-xs font-normal text-muted-foreground">— {timeline.contestTitle}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    participant: {timeline.participantId}
                    {timeline.paymentId && ` · payment: ${timeline.paymentId}`}
                    {timeline.razorpayOrderId && ` · order: ${timeline.razorpayOrderId}`}
                    {timeline.razorpayPaymentId && ` · rzp payment: ${timeline.razorpayPaymentId}`}
                  </div>
                </div>

                {canEdit && timeline.canRetry && (
                  <button
                    onClick={() => handleRetry(timeline.paymentId!)}
                    disabled={retryMutation.isPending}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {retryMutation.isPending ? 'Retrying...' : 'Retry Transfer'}
                  </button>
                )}
              </div>

              <ol className="space-y-0">
                {timeline.events.map((event, idx) => {
                  const style = severityStyles[event.severity] || severityStyles.ok;
                  const isLast = idx === timeline.events.length - 1;
                  return (
                    <li key={idx} className="flex gap-3 pb-5 relative">
                      {!isLast && (
                        <span className="absolute left-[7px] top-4 bottom-0 w-px bg-border/50" aria-hidden />
                      )}
                      <span className={`shrink-0 h-3.5 w-3.5 rounded-full mt-1 ${style.dot}`} aria-hidden />
                      <div className="flex-1 min-w-0">
                        <div className={`flex items-center gap-1.5 text-xs font-bold ${style.text}`}>
                          {event.label}
                        </div>
                        {event.timestamp && (
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            {format(new Date(event.timestamp), 'dd MMM yyyy, hh:mm:ss a')}
                          </div>
                        )}
                        {Object.keys(event.details).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-foreground/80">
                            {Object.entries(event.details).map(([key, value]) => (
                              <span key={key}>
                                <span className="text-muted-foreground">{key}:</span> {String(value)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
