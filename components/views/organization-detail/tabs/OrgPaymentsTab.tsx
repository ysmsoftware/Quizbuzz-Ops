'use client';

import React, { useState } from 'react';
import { Search, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import TablePagination from '../TablePagination';
import { OrgPayment } from '@/lib/api/organizations';

interface OrgPaymentsTabProps {
  payments: OrgPayment[];
  isLoadingPayments: boolean;
  paymentAggregates: {
    collected: number;
    pending: number;
    refunded: number;
  };
}

export default function OrgPaymentsTab({
  payments,
  isLoadingPayments,
  paymentAggregates,
}: OrgPaymentsTabProps) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredPayments = (payments || []).filter(p => {
    const term = search.toLowerCase();
    const matchSearch = 
      p.payeeName.toLowerCase().includes(term) ||
      p.description.toLowerCase().includes(term) ||
      p.referenceId.toLowerCase().includes(term) ||
      p.paymentMethod.toLowerCase().includes(term);

    const matchSource = sourceFilter === 'all' || p.source === sourceFilter;
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;

    return matchSearch && matchSource && matchStatus;
  });

  const paginatedPayments = filteredPayments.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6 font-sans">
      {/* Collected summaries cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-0.5">
            <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">Total Collected</span>
            <h3 className="text-xl font-bold font-mono text-emerald-700 flex items-baseline">
              <span className="text-sm mr-0.5 font-sans">₹</span>
              {paymentAggregates.collected.toLocaleString('en-IN')}
            </h3>
          </div>
          <CheckCircle2 className="h-7 w-7 text-emerald-600/70" />
        </div>

        <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-0.5">
            <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider block">Pending / Unpaid</span>
            <h3 className="text-xl font-bold font-mono text-amber-700 flex items-baseline">
              <span className="text-sm mr-0.5 font-sans">₹</span>
              {paymentAggregates.pending.toLocaleString('en-IN')}
            </h3>
          </div>
          <Clock className="h-7 w-7 text-amber-600/70 animate-pulse" />
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-800 font-bold uppercase tracking-wider block">Refunds Paid</span>
            <h3 className="text-xl font-bold font-mono text-slate-700 flex items-baseline">
              <span className="text-sm mr-0.5 font-sans">₹</span>
              {paymentAggregates.refunded.toLocaleString('en-IN')}
            </h3>
          </div>
          <AlertCircle className="h-7 w-7 text-slate-600/70" />
        </div>
      </div>

      {/* Ledger table */}
      <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border/25 bg-secondary/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-semibold text-sm">Financial Receipts & Ledger</h3>
            <p className="text-[11px] text-muted-foreground">Comprehensive transactional timeline of both subscriptions and quiz tickets.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search payee, TXN ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-8 pr-3 py-1 text-xs bg-secondary/35 focus:bg-card border border-border/40 rounded-md outline-none text-foreground font-sans"
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All Sources</option>
              <option value="subscription">Subscription</option>
              <option value="contest_fee">Quiz Entry Fee</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoadingPayments ? (
            <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Computing financials...</div>
          ) : filteredPayments.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">No payment transactions found.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/5 text-muted-foreground font-semibold">
                  <th className="py-3 px-5">Payee Name</th>
                  <th className="py-3 px-5">Source Item</th>
                  <th className="py-3 px-5">Description</th>
                  <th className="py-3 px-5">Reference ID</th>
                  <th className="py-3 px-5">Gateway</th>
                  <th className="py-3 px-5 text-right">Amount</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Transaction Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/25 font-sans">
                {paginatedPayments.map(p => (
                  <tr key={p.id} className="hover:bg-secondary/15 transition-all">
                    <td className="py-3.5 px-5 font-semibold text-foreground">{p.payeeName}</td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        p.source === 'subscription' 
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {p.source.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-slate-700 font-medium max-w-[180px] truncate">{p.description}</td>
                    <td className="py-3.5 px-5 font-mono text-muted-foreground text-[10px]">{p.referenceId}</td>
                    <td className="py-3.5 px-5 text-muted-foreground">{p.paymentMethod}</td>
                    <td className="py-3.5 px-5 text-right font-mono font-bold text-foreground">₹{p.amount.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${
                        p.status === 'PAID' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : p.status === 'PENDING' 
                          ? 'bg-amber-50 text-amber-700 border-amber-200' 
                          : p.status === 'REFUNDED'
                          ? 'bg-slate-100 text-slate-600 border-slate-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right text-muted-foreground font-mono">
                      {format(new Date(p.date), 'dd MMM yyyy, hh:mm a')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        <TablePagination
          currentPage={page}
          totalItems={filteredPayments.length}
          pageSize={pageSize}
          itemLabel="payment transactions"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
