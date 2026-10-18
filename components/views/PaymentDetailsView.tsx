'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  CreditCard,
  Search,
  Filter,
  ChevronUp,
  Eye,
  Terminal,
  Loader2,
  AlertTriangle,
  Check,
  RotateCcw,
} from 'lucide-react';
import { usePaymentDetails } from '@/lib/hooks/usePaymentDetails';
import { useTableQuery } from '@/lib/hooks/useTableQuery';
import CopyText from '@/components/ui/CopyText';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import { statusOptions } from '@/lib/constants/status';
import { dayRangeToIso } from '@/lib/dates';
import DateRangePicker, { DateRangeValue } from '@/components/ui/DateRangePicker';
import { MainAppPaymentStatus, PaymentDetail } from '@/lib/api/paymentDetails';
import { formatInr  } from '@/lib/format';

const PAGE_SIZE = 50;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">{label}</span>
      <div className="text-slate-300">{children}</div>
    </div>
  );
}

/**
 * Contest-fee payments from the main app's DB, with every Razorpay field we store —
 * for cross-checking a participant's payment against the Razorpay dashboard.
 */
export default function PaymentDetailsView() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null);
  const query = useTableQuery(
    { search: '', status: 'all', retriedOnly: false },
    { debounce: ['search'] }
  );
  const { page, setPage } = query;

  const { payments, pagination, isLoading, isFetching, isError } = usePaymentDetails({
    page,
    limit: PAGE_SIZE,
    status: (query.params.status ?? 'all') as 'all' | MainAppPaymentStatus,
    search: query.params.search?.trim() || undefined,
    retriedOnly: !!query.params.retriedOnly,
    ...dayRangeToIso(dateRange),
  });

  const hasActiveFilters = query.hasActiveFilters || !!dateRange;
  const clearFilters = () => {
    query.reset();
    setDateRange(null);
  };
  const changeDateRange = (range: DateRangeValue | null) => {
    setDateRange(range);
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
                value={query.filters.search}
                onChange={(e) => query.setFilter('search', e.target.value)}
                placeholder="Email, phone, name, order / payment ID…"
                className="pl-9 h-9 w-64 sm:w-80 text-xs rounded-lg border border-border/40 bg-secondary/20 focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="flex items-center gap-1 bg-secondary/10 border border-border/40 rounded-lg px-2 h-9">
              <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
              <select
                value={query.filters.status}
                onChange={(e) => query.setFilter('status', e.target.value)}
                className="text-[11px] bg-transparent focus:outline-none text-muted-foreground"
              >
                {statusOptions('payment', 'All statuses').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/40 bg-secondary/10 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={query.filters.retriedOnly} onChange={(e) => query.setFilter('retriedOnly', e.target.checked)} />
              <RotateCcw className="h-3 w-3" /> Retried orders only
            </label>

            <DateRangePicker value={dateRange} onChange={changeDateRange} />

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
                    // Orders created before the main app started keeping history (or an
                    // environment without the payment_orders grant) aren't listed.
                    const historyIncomplete = p.orders === null || p.orders.length < p.attempts;
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
                          <td className="py-2.5 px-4 font-mono whitespace-nowrap">{formatInr(p.amount, { fixed: 2 })}</td>
                          <td className="py-2.5 px-4 max-w-[220px]">
                            <StatusBadge kind="payment" value={p.status} />
                            {p.failureReason && (
                              <span className="text-[10px] text-rose-500 block mt-1">{p.failureReason}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-[11px]"><CopyText value={p.razorpayOrderId} /></td>
                          <td className="py-2.5 px-4 text-[11px]"><CopyText value={p.razorpayPaymentId} /></td>
                          <td className="py-2.5 px-4 text-center">
                            <span
                              className={`font-mono ${orderReplaced ? 'text-amber-600 font-bold' : 'text-muted-foreground'}`}
                              title={orderReplaced ? `${p.attempts} Razorpay orders created for this registration` : undefined}
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

                                {historyIncomplete && orderReplaced && (
                                  <div className="flex gap-2 p-3 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 text-[11px] font-sans">
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                                    <span>
                                      {p.attempts} Razorpay orders were created for this registration but only{' '}
                                      {p.orders?.length ?? 0} are in our order history (older ones predate it). Search the receipts
                                      below in Razorpay → Orders to see all of them and check whether any was captured.
                                    </span>
                                  </div>
                                )}

                                {p.orders && p.orders.length > 0 && (
                                  <div className="space-y-1.5">
                                    <span className="text-slate-500 uppercase block text-[9px] font-sans font-bold">
                                      Razorpay orders ({p.orders.length}) — newest first
                                    </span>
                                    <div className="overflow-x-auto rounded border border-slate-800">
                                      <table className="w-full text-[10px]">
                                        <thead className="bg-slate-900 text-slate-500">
                                          <tr>
                                            <th className="text-left px-2 py-1.5 font-semibold">Order</th>
                                            <th className="text-left px-2 py-1.5 font-semibold">Status</th>
                                            <th className="text-left px-2 py-1.5 font-semibold">Last payment attempt</th>
                                            <th className="text-left px-2 py-1.5 font-semibold">Reason</th>
                                            <th className="text-left px-2 py-1.5 font-semibold">Created</th>
                                            <th className="text-left px-2 py-1.5 font-semibold">Updated</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                          {p.orders.map((o) => (
                                            <tr key={o.razorpayOrderId}>
                                              <td className="px-2 py-1.5">
                                                <CopyText value={o.razorpayOrderId} />
                                                {o.razorpayOrderId === p.razorpayOrderId && <span className="ml-1 text-indigo-400">(current)</span>}
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <StatusBadge kind="payment" value={o.status} />
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <CopyText value={o.razorpayPaymentId} />
                                                {o.method && <span className="text-slate-500 ml-1">{o.method}</span>}
                                              </td>
                                              <td className="px-2 py-1.5 text-rose-300 font-sans">
                                                {o.status === 'SUCCESS' ? '—' : o.failureReason || '—'}
                                                {o.errorReason && o.status !== 'SUCCESS' && <span className="text-slate-500"> ({o.errorReason})</span>}
                                              </td>
                                              <td className="px-2 py-1.5 whitespace-nowrap">{format(new Date(o.createdAt), 'dd MMM, HH:mm:ss')}</td>
                                              <td className="px-2 py-1.5 whitespace-nowrap">{format(new Date(o.updatedAt), 'dd MMM, HH:mm:ss')}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
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
                                  <Field label="Amount">{formatInr(p.amount, { fixed: 2 })} {p.currency}</Field>
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

        {!isLoading && !isError && (
          <Pagination currentPage={page} totalItems={pagination.total} pageSize={pagination.limit} itemLabel="payments" onPageChange={setPage} isLoading={isFetching} />
        )}
      </div>
    </div>
  );
}
