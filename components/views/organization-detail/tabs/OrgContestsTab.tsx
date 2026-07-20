'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { Contest, ContestStatus } from '@/lib/types';
import TablePagination from '../TablePagination';

const CONTEST_BADGES: Record<ContestStatus, { label: string; style: string }> = {
  DRAFT: { label: 'Draft', style: 'bg-slate-100 text-slate-700 border-slate-200' },
  PUBLISHED: { label: 'Published', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  REGISTRATION_CLOSED: { label: 'Reg Closed', style: 'bg-amber-50 text-amber-800 border-amber-200' },
  LIVE: { label: 'Live Now', style: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' },
  EVALUATION: { label: 'Evaluating', style: 'bg-purple-50 text-purple-700 border-purple-200' },
  RESULTS_OUT: { label: 'Results Out', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  COMPLETED: { label: 'Completed', style: 'bg-teal-50 text-teal-700 border-teal-200' },
  CANCELLED: { label: 'Cancelled', style: 'bg-red-50 text-red-700 border-red-200' },
};

interface OrgContestsTabProps {
  contests: Contest[];
}

export default function OrgContestsTab({ contests }: OrgContestsTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredContests = contests.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    
    let matchDate = true;
    if (dateFilter !== 'all') {
      const cDate = new Date(c.startTime);
      const now = new Date();
      if (dateFilter === 'upcoming') {
        matchDate = cDate >= now;
      } else if (dateFilter === 'past') {
        matchDate = cDate < now;
      } else if (dateFilter === 'today') {
        matchDate = cDate.toDateString() === now.toDateString();
      }
    }

    return matchSearch && matchStatus && matchDate;
  });

  const paginatedContests = filteredContests.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4 font-sans">
      {/* Search & filters */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-card p-3 border border-border/30 rounded-xl shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search quizzes by title or ID..."
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
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All Quizzes</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="LIVE">Live Now</option>
              <option value="EVALUATION">Evaluating</option>
              <option value="RESULTS_OUT">Results Out</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Timeframe:</span>
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs bg-secondary/35 border border-border/40 rounded outline-none text-foreground cursor-pointer font-medium"
            >
              <option value="all">All Dates</option>
              <option value="upcoming">Upcoming</option>
              <option value="today">Today</option>
              <option value="past">Past</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contests table */}
      <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {filteredContests.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">No contests matching filters.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/10 text-muted-foreground font-semibold">
                  <th className="py-3 px-4">Quiz Title</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Scheduled Date</th>
                  <th className="py-3 px-4 text-center">Duration</th>
                  <th className="py-3 px-4 text-right">Fee</th>
                  <th className="py-3 px-4 text-right">Participants</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/25">
                {paginatedContests.map(c => {
                  const badge = CONTEST_BADGES[c.status] || { label: c.status, style: 'bg-muted' };
                  return (
                    <tr key={c.id} className="hover:bg-secondary/15 transition-all">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        <div className="max-w-[180px] truncate">
                          <span>{c.title}</span>
                          <span className="block text-[10px] font-mono text-muted-foreground uppercase leading-none mt-0.5">ID: {c.id}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${badge.style}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {format(new Date(c.startTime), 'dd MMM yyyy, hh:mm a')}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-muted-foreground">{c.duration} mins</td>
                      <td className="py-3 px-4 text-right font-mono text-foreground/80">₹{c.registrationFee}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground/80">{c.participantCount}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">₹{(c.revenueCollected || 0).toLocaleString('en-IN')}</td>
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
          totalItems={filteredContests.length}
          pageSize={pageSize}
          itemLabel="contests"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
