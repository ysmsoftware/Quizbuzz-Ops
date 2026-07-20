'use client';

import React from 'react';
import { Search, Plus, Sparkles, Filter } from 'lucide-react';

interface SubscriptionPlansHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showInactive: boolean;
  onToggleShowInactive: (show: boolean) => void;
  onOpenCreateModal: () => void;
  totalPlans: number;
}

export default function SubscriptionPlansHeader({
  searchQuery,
  onSearchChange,
  showInactive,
  onToggleShowInactive,
  onOpenCreateModal,
  totalPlans,
}: SubscriptionPlansHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
      <div>
        <div className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight">Subscription Tier Plans</h1>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
            {totalPlans} Plans
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Configure subscription limits, pricing, and features. Changes sync across all tenant organizations.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search plans by name/slug..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-background border border-input focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Filter inactive toggle */}
        <button
          type="button"
          onClick={() => onToggleShowInactive(!showInactive)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            showInactive
              ? 'bg-secondary text-secondary-foreground border-secondary-foreground/20'
              : 'bg-background text-muted-foreground border-input hover:text-foreground'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>{showInactive ? 'Showing Inactive' : 'Hide Inactive'}</span>
        </button>

        {/* Create Plan button */}
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Create Plan</span>
        </button>
      </div>
    </div>
  );
}
