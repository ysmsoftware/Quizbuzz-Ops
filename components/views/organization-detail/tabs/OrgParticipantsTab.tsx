'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { Participant, Contest } from '@/lib/types';
import TablePagination from '../TablePagination';

interface OrgParticipantsTabProps {
  participants: Participant[];
  contests: Contest[];
  isLoadingParticipants: boolean;
}

export default function OrgParticipantsTab({
  participants,
  contests,
  isLoadingParticipants,
}: OrgParticipantsTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredParticipants = participants.filter(p => {
    const term = search.toLowerCase();
    const quizTitle = contests.find(c => c.id === p.contestId)?.title || p.contestId;

    const matchName = `${p.firstName} ${p.lastName}`.toLowerCase().includes(term);
    const matchContact = p.email.toLowerCase().includes(term) || p.phone.includes(term);
    const matchQuiz = quizTitle.toLowerCase().includes(term) || p.contestId.toLowerCase().includes(term);
    const matchSearch = matchName || matchContact || matchQuiz;

    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchPayment = paymentFilter === 'all' || p.paymentStatus === paymentFilter;

    return matchSearch && matchStatus && matchPayment;
  });

  const paginatedParticipants = filteredParticipants.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4 font-sans">
      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-card p-3 border border-border/30 rounded-xl shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, email, phone, quiz..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/35 focus:bg-card border border-border/40 rounded-md outline-none text-foreground font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Quiz Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="REGISTERED">Registered</option>
              <option value="IN_QUIZ">In Quiz</option>
              <option value="SUBMITTED">Submitted</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Payment:</span>
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All Payments</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="REFUNDED">Refunded</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {isLoadingParticipants ? (
            <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading registration rolls...</div>
          ) : filteredParticipants.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">No participants found matching details.</div>
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
                {paginatedParticipants.map(p => {
                  const quizTitle = contests.find(c => c.id === p.contestId)?.title || p.contestId;
                  
                  return (
                    <tr key={p.id} className="hover:bg-secondary/15 transition-all">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {p.firstName} {p.lastName}
                      </td>
                      <td className="py-3 px-4 space-y-0.5">
                        <span className="block font-mono text-muted-foreground text-[10px]">{p.email}</span>
                        <span className="block text-muted-foreground/80 font-mono text-[10px]">{p.phone}</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 truncate max-w-[150px]" title={quizTitle}>
                        {quizTitle}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wide ${
                          p.status === 'SUBMITTED' 
                            ? 'bg-teal-50 text-teal-700 border-teal-200' 
                            : p.status === 'IN_QUIZ' 
                            ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' 
                            : p.status === 'REGISTERED' 
                            ? 'bg-blue-50 text-blue-700 border-blue-200' 
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                          p.paymentStatus === 'PAID' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : p.paymentStatus === 'PENDING' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {p.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-foreground/80">₹{p.paymentAmount}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground font-mono">
                        {format(new Date(p.registeredAt), 'dd MMM, hh:mm')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        <TablePagination
          currentPage={page}
          totalItems={filteredParticipants.length}
          pageSize={pageSize}
          itemLabel="participants"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
