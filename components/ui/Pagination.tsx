'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '@/lib/format';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  /** Plural noun for the "Showing x to y of N …" caption. */
  itemLabel: string;
  onPageChange: (page: number) => void;
  /** Disables both buttons while a page is being fetched. */
  isLoading?: boolean;
}

/** The single table footer: "Showing x to y of N items" + prev/next. */
export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
  isLoading = false,
}: PaginationProps) {
  if (totalItems === 0) return null;

  const startItem = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage * pageSize < totalItems;
  const buttonClass =
    'p-1.5 rounded-md border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer';

  return (
    <div className="px-4 py-3 bg-secondary/10 border-t border-border/30 flex items-center justify-between text-xs font-sans">
      <span className="text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{formatNumber(startItem)}</span> to{' '}
        <span className="font-semibold text-foreground">{formatNumber(endItem)}</span> of{' '}
        <span className="font-semibold text-foreground">{formatNumber(totalItems)}</span> {itemLabel}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label="Previous page"
          disabled={!hasPrev || isLoading}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          className={buttonClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={!hasNext || isLoading}
          onClick={() => onPageChange(currentPage + 1)}
          className={buttonClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
