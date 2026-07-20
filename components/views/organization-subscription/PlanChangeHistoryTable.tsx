'use client';

import React, { useState, useMemo } from 'react';
import { PlanChangeEvent, SubscriptionPlan } from '@/lib/types';
import { History, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface PlanChangeHistoryTableProps {
  history: PlanChangeEvent[];
  plans: SubscriptionPlan[];
}

const HISTORY_PER_PAGE = 5;

export default function PlanChangeHistoryTable({ history, plans }: PlanChangeHistoryTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(history.length / HISTORY_PER_PAGE) || 1;
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * HISTORY_PER_PAGE;
    return history.slice(start, start + HISTORY_PER_PAGE);
  }, [history, currentPage]);

  const getPlanName = (planId: string | null) => {
    if (!planId) return 'None';
    const found = plans.find((p) => p.id === planId || p.slug === planId);
    return found ? found.name : planId;
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Plan Migration History</h3>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
            {history.length} Events
          </span>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="py-8 text-center border border-dashed rounded-lg bg-muted/20 text-xs text-muted-foreground">
          No subscription plan change history recorded for this tenant.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold border-b">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">From Plan</th>
                  <th className="py-2.5 px-3">To Plan</th>
                  <th className="py-2.5 px-3">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {paginatedHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="py-2.5 px-3 text-muted-foreground font-mono">
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(item.date), 'MMM d, yyyy HH:mm')}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{getPlanName(item.fromPlanId)}</td>
                    <td className="py-2.5 px-3 font-semibold text-foreground">{getPlanName(item.toPlanId)}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{item.adminName || 'Platform Operator'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs">
              <span className="text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded border bg-background hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded border bg-background hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
