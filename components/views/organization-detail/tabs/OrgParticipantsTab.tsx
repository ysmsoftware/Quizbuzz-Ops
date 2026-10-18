'use client';

import React from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Contest } from '@/lib/types';
import Pagination from '@/components/ui/Pagination';
import StatusBadge from '@/components/ui/StatusBadge';
import { statusOptions } from '@/lib/constants/status';
import { formatInr } from '@/lib/format';
import { useTableQuery } from '@/lib/hooks/useTableQuery';
import { useOrgParticipants } from '@/lib/hooks/useOrganizations';

interface OrgParticipantsTabProps {
  orgId: string;
  /** For the contest filter. */
  contests: Contest[];
}

const PAGE_SIZE = 10;

// SUCCESS is shown as "Paid"; FREE = no payment row (free or assigned contest).
const paymentFilterOptions = statusOptions('payment', 'All payments').filter(
  (o) => !['CREATED', 'CANCELLED'].includes(o.value)
);

const selectClass =
  'px-2 py-1.5 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium max-w-[180px]';
const labelClass = 'text-[10px] font-bold text-muted-foreground uppercase tracking-wide';

/**
 * Participants of one organization. Filtering, searching and paging run on the server, so an org
 * with tens of thousands of registrations loads one page of 10 — not the whole register.
 */
export default function OrgParticipantsTab({ orgId, contests }: OrgParticipantsTabProps) {
  const query = useTableQuery(
    { search: '', contest: 'all', status: 'all', payment: 'all' },
    { debounce: ['search'] }
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useOrgParticipants(orgId, {
    page: query.page,
    limit: PAGE_SIZE,
    search: query.params.search,
    contestId: query.params.contest,
    status: query.params.status,
    paymentStatus: query.params.payment,
  });

  const participants = data?.data ?? [];

  return (
    <div className="space-y-4 font-sans">
      {/* Search & Filters */}
      <div className="flex flex-col lg:flex-row gap-3 justify-between items-center bg-card p-3 border border-border/30 rounded-xl shadow-sm">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, email, phone, ref, quiz..."
            value={query.filters.search}
            onChange={(e) => query.setFilter('search', e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/35 focus:bg-card border border-border/40 rounded-md outline-none text-foreground font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0 w-full lg:w-auto">
          <label className="flex items-center gap-1.5">
            <span className={labelClass}>Quiz:</span>
            <select value={query.filters.contest} onChange={(e) => query.setFilter('contest', e.target.value)} className={selectClass}>
              <option value="all">All quizzes</option>
              {contests.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className={labelClass}>Status:</span>
            <select value={query.filters.status} onChange={(e) => query.setFilter('status', e.target.value)} className={selectClass}>
              {statusOptions('participant', 'All statuses').map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className={labelClass}>Payment:</span>
            <select value={query.filters.payment} onChange={(e) => query.setFilter('payment', e.target.value)} className={selectClass}>
              {paymentFilterOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          {query.hasActiveFilters && (
            <button
              onClick={query.reset}
              className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/40 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className={`bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm transition-opacity ${isFetching && !isLoading ? 'opacity-70' : ''}`}>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading registration rolls...</div>
          ) : isError ? (
            <div className="p-12 text-center text-xs space-y-2">
              <AlertTriangle className="h-6 w-6 text-destructive/70 mx-auto" />
              <p className="font-semibold text-foreground">Couldn&apos;t load participants</p>
              <p className="text-muted-foreground">{error?.message}</p>
              <button onClick={() => refetch()} className="px-3 py-1.5 font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary cursor-pointer">
                Retry
              </button>
            </div>
          ) : participants.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              {query.hasActiveFilters ? 'No participants match these filters.' : 'This organization has no participants yet.'}
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/10 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Contest Quiz</th>
                  <th className="py-3 px-4">Quiz Status</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Fee Paid</th>
                  <th className="py-3 px-4 text-right">Registered Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/25 font-sans">
                {participants.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/15 transition-all">
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {p.firstName} {p.lastName}
                      {p.registrationRef && <span className="block font-mono text-[10px] font-normal text-muted-foreground">{p.registrationRef}</span>}
                    </td>
                    <td className="py-3 px-4 space-y-0.5">
                      <span className="block font-mono text-muted-foreground text-[10px]">{p.email}</span>
                      <span className="block text-muted-foreground/80 font-mono text-[10px]">{p.phone}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground/80 truncate max-w-[180px]" title={p.contestTitle}>
                      {p.contestTitle}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge kind="participant" value={p.status} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge kind="payment" value={p.paymentStatus} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-foreground/80">{formatInr(p.paymentAmount)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">{format(new Date(p.registeredAt), 'dd MMM, hh:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          currentPage={query.page}
          totalItems={data?.total ?? 0}
          pageSize={PAGE_SIZE}
          itemLabel="participants"
          onPageChange={query.setPage}
          isLoading={isFetching}
        />
      </div>
    </div>
  );
}
