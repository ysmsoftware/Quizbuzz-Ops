'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  CreditCard,
  Search,
  Filter,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Terminal,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { usePaymentDetails } from '@/lib/hooks/usePaymentDetails';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { MainAppPaymentStatus, PaymentDetail } from '@/lib/api/paymentDetails';

const PAGE_SIZE = 50;
const STATUSES: ('all' | MainAppPaymentStatus)[] = ['all', 'SUCCESS', 'FAILED', 'PENDING', 'CREATED', 'CANCELLED', 'REFUNDED'];

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-emerald-500/10 text-emerald-600',
  FAILED: 'bg-rose-500/10 text-rose-600',
  PENDING: 'bg-amber-500/10 text-amber-600',
  CREATED: 'bg-slate-500/10 text-slate-500',
  CANCELLED: 'bg-slate-500/10 text-slate-500',
  REFUNDED: 'bg-indigo-500/10 text-indigo-500',
};

function CopyText({ value, className = '' }: { value: string | null; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground/60">—</span>;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={`inline-flex items-center gap-1 font-mono hover:text-primary cursor-pointer text-left ${className}`}
      title="Copy"
    >
      <span className="break-all">{value}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <Copy className="h-3 w-3 shrink-0 opacity-50" />}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">{label}</span>
      <div className="text-slate-300">{children}</div>
    </div>
  );
}

// Local date (yyyy-mm-dd from <input type="date">) → ISO bound, so "29 Sep" means 29 Sep in the admin's timezone.
const toIso = (date: string, endOfDay: boolean) =>
  date ? new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).toISOString() : undefined;

/**
 * Contest-fee payments from the main app's DB, with every Razorpay field we store —
 * for cross-checking a participant's payment against the Razorpay dashboard.
 */
export default function PaymentDetailsView() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<'all' | MainAppPaymentStatus>('all');
  const [retriedOnly, setRetriedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const search = useDebouncedValue(searchInput.trim(), 400);

  // Any filter change jumps back to page 1.
  const withPageReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const { payments, pagination, isLoading, isFetching, isError } = usePaymentDetails({
    page,
    limit: PAGE_SIZE,
    status,
    search: search || undefined,
    retriedOnly,
    dateFrom: toIso(dateFrom, false),
    dateTo: toIso(dateTo, true),
  });

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const rangeStart = pagination.total === 0 ? 0 : (page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(page * pagination.limit, pagination.total);

  const hasActiveFilters = searchInput || status !== 'all' || retriedOnly || dateFrom || dateTo;
  const clearFilters = () => {
    setSearchInput('');
    setStatus('all');
    setRetriedOnly(false);
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" /> Payments
        </h1>
        <p className="text-xs text-muted-foreground">
          Contest registration payments as stored in the main application database — compare order and payment IDs with the Razorpay dashboard.
        </p>
      </div>

      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border/40 space-y-3">
          <p className="text-xs text-muted-foreground">
            Read-only, cross-database — {PAGE_SIZE} rows per page
            {isFetching && !isLoading && (
              <span className="inline-flex items-center gap-1 ml-2 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> refreshing…
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => withPageReset(setSearchInput)(e.target.value)}
                placeholder="Email, phone, name, order / payment ID…"
                className="pl-9 h-9 w-64 sm:w-80 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
              <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
              <select
                value={status}
                onChange={(e) => withPageReset(setStatus)(e.target.value as typeof status)}
                className="text-[11px] bg-transparent focus:outline-none text-muted-foreground"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/40 bg-secondary/10 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={retriedOnly} onChange={(e) => withPageReset(setRetriedOnly)(e.target.checked)} />
              <RotateCcw className="h-3 w-3" /> Retried orders only
            </label>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => withPageReset(setDateFrom)(e.target.value)}
              aria-label="Created from"
              className="h-9 px-2 text-[11px] rounded-lg border border-border/40 bg-secondary/20 text-muted-foreground"
            />
            <span className="text-[11px] text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => withPageReset(setDateTo)(e.target.value)}
              aria-label="Created to"
              className="h-9 px-2 text-[11px] rounded-lg border border-border/40 bg-secondary/20 text-muted-foreground"
            />

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

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-mono animate-pulse">Querying payments…</div>
          ) : isError ? (
            <div className="py-16 text-center">
              <p className="text-xs font-semibold text-rose-500">Failed to load payments.</p>
            </div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center">
              <CreditCard className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-xs font-semibold text-muted-foreground">No payments match these filters</p>
            </div>
          ) : (
            <div className="max-h-[820px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-secondary/90 backdrop-blur text-muted-foreground border-b border-border/40">
                    <th className="py-3 px-4 font-semibold">Created</th>
                    <th className="py-3 px-4 font-semibold">Payee</th>
                    <th className="py-3 px-4 font-semibold">Contest</th>
                    <th className="py-3 px-4 font-semibold">Amount</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Razorpay Order ID</th>
                    <th className="py-3 px-4 font-semibold">Razorpay Payment ID</th>
                    <th className="py-3 px-4 font-semibold text-center">Attempts</th>
                    <th className="py-3 px-4 font-semibold text-center">Webhook</th>
                    <th className="py-3 px-4 font-semibold text-center">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {payments.map((p: PaymentDetail) => {
                    const isExpanded = expandedId === p.id;
                    const orderReplaced = p.attempts > 1;
                    const toggle = () => setExpandedId((cur) => (cur === p.id ? null : p.id));

                    return (
                      <React.Fragment key={p.id}>
                        <tr
                          className={`hover:bg-secondary/10 transition-all cursor-pointer align-top ${isExpanded ? 'bg-secondary/15' : ''}`}
                          onClick={toggle}
                        >
                          <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(p.createdAt), 'dd MMM yyyy, HH:mm:ss')}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="font-semibold text-foreground block">{p.payeeName}</span>
                            <span className="text-[10px] text-muted-foreground block">{p.email || '—'}</span>
                            <span className="text-[10px] font-mono text-muted-foreground block">{p.phone || '—'}</span>
                          </td>
                          <td className="py-2.5 px-4 max-w-[200px]">
                            <span className="text-foreground block truncate">{p.contestTitle || '—'}</span>
                            <span className="text-[10px] text-muted-foreground block truncate">{p.organizationName}</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono whitespace-nowrap">₹{p.amount.toFixed(2)}</td>
                          <td className="py-2.5 px-4 max-w-[220px]">
                            <span className={`inline-flex px-2 py-0.5 rounded font-mono text-[10px] font-bold ${STATUS_STYLES[p.status] || ''}`}>
                              {p.status}
                            </span>
                            {p.failureReason && (
                              <span className="text-[10px] text-rose-500 block mt-1">{p.failureReason}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-[11px]"><CopyText value={p.razorpayOrderId} /></td>
                          <td className="py-2.5 px-4 text-[11px]"><CopyText value={p.razorpayPaymentId} /></td>
                          <td className="py-2.5 px-4 text-center">
                            <span
                              className={`font-mono ${orderReplaced ? 'text-amber-600 font-bold' : 'text-muted-foreground'}`}
                              title={orderReplaced ? 'Order ID was replaced by a retry — earlier order IDs are not stored' : undefined}
                            >
                              {p.attempts}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {p.webhookConfirmed ? <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" /> : <span className="text-muted-foreground/60">—</span>}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggle(); }}
                              className="p-1.5 rounded-md hover:bg-card border border-transparent hover:border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="bg-secondary/10 p-5 border-t border-b border-border/40">
                              <div className="bg-slate-950 text-slate-200 p-4 rounded-lg border border-border/60 shadow-inner font-mono text-xs space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[10px] text-slate-400">
                                  <span className="flex items-center gap-1.5">
                                    <Terminal className="h-3.5 w-3.5 text-indigo-400" /> PAYMENT INSPECTION
                                  </span>
                                  <span>PAYMENT_ID: {p.id}</span>
                                </div>

                                {orderReplaced && (
                                  <div className="flex gap-2 p-3 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 text-[11px] font-sans">
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                                    <span>
                                      The Razorpay order ID on this row was replaced {p.attempts - 1} time(s) by a retry. Earlier
                                      order IDs are not stored here — search the receipts below in Razorpay → Orders to see
                                      every order created for this participant, and check whether any of them was captured.
                                    </span>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[11px] py-1">
                                  <Field label="Razorpay order ID (current)"><CopyText value={p.razorpayOrderId} /></Field>
                                  <Field label="Razorpay payment ID"><CopyText value={p.razorpayPaymentId} /></Field>
                                  <Field label="Razorpay status">{p.razorpayStatus || '—'}</Field>
                                  <Field label="Receipt (first order)"><CopyText value={p.razorpayReceipts.original} /></Field>
                                  <Field label="Receipt (retry orders)"><CopyText value={p.razorpayReceipts.retry} /></Field>
                                  <Field label="Failure reason">{p.failureReason || '—'}</Field>
                                  <Field label="Participant"><CopyText value={p.participantId} /></Field>
                                  <Field label="Registration ref / status">{p.registrationRef || '—'} · {p.participantStatus || '—'}</Field>
                                  <Field label="Contact">{p.email || '—'} · {p.phone || '—'}</Field>
                                  <Field label="Organization">{p.organizationName} <span className="text-slate-500">({p.organizationId})</span></Field>
                                  <Field label="Contest">{p.contestTitle || '—'} <span className="text-slate-500">({p.contestId})</span></Field>
                                  <Field label="Amount">₹{p.amount.toFixed(2)} {p.currency}</Field>
                                  <Field label="Created">{format(new Date(p.createdAt), 'dd MMM yyyy, HH:mm:ss')}</Field>
                                  <Field label="Last updated">{format(new Date(p.updatedAt), 'dd MMM yyyy, HH:mm:ss')}</Field>
                                  <Field label="Paid at">{p.paidAt ? format(new Date(p.paidAt), 'dd MMM yyyy, HH:mm:ss') : '—'}</Field>
                                </div>

                                <div className="space-y-1.5 border-t border-slate-800 pt-3">
                                  <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">Stored metadata (from payment.captured webhook)</span>
                                  <pre className="p-3 bg-slate-900 rounded border border-slate-800 text-[10px] text-indigo-200 overflow-x-auto leading-normal">
                                    {p.metadata ? JSON.stringify(p.metadata, null, 2) : 'null'}
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

        {!isLoading && !isError && payments.length > 0 && (
          <div className="p-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground font-mono">
              Showing <span className="text-foreground font-semibold">{rangeStart}-{rangeEnd}</span> of{' '}
              <span className="text-foreground font-semibold">{pagination.total.toLocaleString()}</span> payments
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((pg) => Math.max(1, pg - 1))}
                disabled={page <= 1 || isFetching}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> <span>Prev</span>
              </button>
              <span className="text-[11px] font-mono text-muted-foreground px-2">
                Page <span className="text-foreground font-semibold">{page}</span> of{' '}
                <span className="text-foreground font-semibold">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                disabled={page >= totalPages || isFetching}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <span>Next</span> <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
