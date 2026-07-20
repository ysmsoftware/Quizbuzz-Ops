'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}

export default function TablePagination({
  currentPage,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
}: TablePaginationProps) {
  if (totalItems === 0) return null;

  const startItem = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const hasNext = currentPage * pageSize < totalItems;
  const hasPrev = currentPage > 1;

  return (
    <div className="px-4 py-3 bg-secondary/10 border-t border-border/30 flex items-center justify-between text-xs font-sans">
      <span className="text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{startItem}</span> to{' '}
        <span className="font-semibold text-foreground">{endItem}</span> of{' '}
        <span className="font-semibold text-foreground">{totalItems}</span> {itemLabel}
      </span>
      <div className="flex gap-1.5">
        <button
          disabled={!hasPrev}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          className="p-1.5 rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          disabled={!hasNext}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-1.5 rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
