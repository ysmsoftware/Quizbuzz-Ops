'use client';

import React from 'react';
import { OrganizationSubscription, SubscriptionPlan } from '@/lib/types';
import { Layers, Calendar, ArrowRight, ShieldCheck, CreditCard } from 'lucide-react';
import { format } from 'date-fns';

interface CurrentPlanCardProps {
  subscription: OrganizationSubscription;
  currentPlan: SubscriptionPlan | undefined;
  onChangePlanClick: () => void;
}

export default function CurrentPlanCard({
  subscription,
  currentPlan,
  onChangePlanClick,
}: CurrentPlanCardProps) {
  const isFree = currentPlan ? currentPlan.price === 0 : true;

  return (
    <div className="p-6 bg-card border border-border/50 rounded-xl flex flex-col justify-between space-y-6 shadow-xs">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <div className="flex items-center space-x-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Subscription</span>
          </div>
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            {subscription.status.toUpperCase()}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
            {currentPlan?.name || 'Assigned Plan'}
          </h2>
          <p className="text-xs text-muted-foreground font-mono">slug: {currentPlan?.slug || 'n/a'}</p>
        </div>

        {/* Price & Billing Cycle */}
        <div className="mt-4 flex items-baseline space-x-2">
          <span className="text-2xl font-black text-foreground">
            {isFree ? 'Free' : `₹${currentPlan?.price.toLocaleString('en-IN')}`}
          </span>
          {!isFree && (
            <span className="text-xs text-muted-foreground font-medium">
              / {currentPlan?.billingCycle === 'annual' ? 'year' : 'month'}
            </span>
          )}
        </div>

        {/* Dates */}
        <div className="mt-4 space-y-2 text-xs text-muted-foreground pt-4 border-t border-border/40">
          {subscription.currentPeriodStart && (
            <div className="flex items-center space-x-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
              <span>Cycle Start: <strong className="text-foreground">{format(new Date(subscription.currentPeriodStart), 'MMM d, yyyy')}</strong></span>
            </div>
          )}
          {subscription.currentPeriodEnd && (
            <div className="flex items-center space-x-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
              <span>Cycle End: <strong className="text-foreground">{format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}</strong></span>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onChangePlanClick}
        className="w-full py-2.5 px-4 text-xs font-semibold rounded-lg bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors flex items-center justify-center space-x-2"
      >
        <span>Change / Upgrade Plan</span>
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
