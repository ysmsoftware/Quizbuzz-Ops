'use client';

import React, { useState } from 'react';
import { OrganizationSubscription, SubscriptionPlan } from '@/lib/types';
import { OrgPayment } from '@/lib/api/organizations';
import { Layers, Calendar, ArrowRight, ShieldCheck, CreditCard, Receipt, ChevronDown, ChevronUp, BellRing, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface CurrentPlanCardProps {
  subscription: OrganizationSubscription;
  currentPlan: SubscriptionPlan | undefined;
  onChangePlanClick: () => void;
  /** Subscription-source payments for this org, newest first is not required — sorted here. */
  payments?: OrgPayment[];
  /** Resends the SUBSCRIPTION_RENEWAL_REMINDER email — only meaningful for an active subscription with a future period end. */
  onResendReminder?: () => Promise<{ sent: boolean }>;
  isResendingReminder?: boolean;
}

export default function CurrentPlanCard({
  subscription,
  currentPlan,
  onChangePlanClick,
  payments = [],
  onResendReminder,
  isResendingReminder,
}: CurrentPlanCardProps) {
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const canResendReminder =
    subscription.status === 'active' &&
    !!subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > new Date();
  const cycle = subscription.billingCycle || 'MONTHLY';
  const displayPrice = currentPlan
    ? cycle === 'ANNUAL'
      ? currentPlan.annualPrice
      : currentPlan.monthlyPrice
    : null;
  const isFree = displayPrice === 0 || displayPrice === null;

  const paidPayments = payments
    .filter((p) => p.status === 'PAID')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastPayment = paidPayments[0];

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
            {displayPrice === null ? '—' : isFree ? 'Free' : `₹${displayPrice.toLocaleString('en-IN')}`}
          </span>
          {!isFree && displayPrice !== null && (
            <span className="text-xs text-muted-foreground font-medium">
              / {cycle === 'ANNUAL' ? 'year' : 'month'}
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span>Cycle End: <strong className="text-foreground">{format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}</strong></span>
              </div>
              {canResendReminder && onResendReminder && (
                <button
                  type="button"
                  onClick={onResendReminder}
                  disabled={isResendingReminder}
                  title="Resend the renewal reminder email to the organization owner"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isResendingReminder ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />}
                  Resend Reminder
                </button>
              )}
            </div>
          )}
        </div>

        {/* Payment Receipt — our own record of the last successful charge,
            independent of the receipt Razorpay emails the payer directly. */}
        {lastPayment && (
          <div className="mt-4 pt-4 border-t border-border/40">
            <button
              type="button"
              onClick={() => setIsReceiptOpen((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold text-foreground hover:text-primary transition-colors"
            >
              <span className="flex items-center space-x-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Last Payment Receipt</span>
              </span>
              {isReceiptOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {isReceiptOpen && (
              <div className="mt-3 p-3 bg-secondary/20 border border-border/40 rounded-lg space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Amount</span>
                  <span className="font-mono text-foreground">
                    {lastPayment.baseAmount != null ? `₹${lastPayment.baseAmount.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gateway Fee (2%)</span>
                  <span className="font-mono text-foreground">
                    {lastPayment.gatewayFeeAmount != null ? `₹${lastPayment.gatewayFeeAmount.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST (18% on fee)</span>
                  <span className="font-mono text-foreground">
                    {lastPayment.gstAmount != null ? `₹${lastPayment.gstAmount.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-border/40">
                  <span className="font-semibold text-foreground">Total Paid</span>
                  <span className="font-mono font-bold text-foreground">₹{lastPayment.amount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-border/40 text-muted-foreground">
                  <span>Paid On</span>
                  <span className="font-mono">{format(new Date(lastPayment.date), 'MMM d, yyyy, hh:mm a')}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Reference ID</span>
                  <span className="font-mono truncate max-w-[140px]" title={lastPayment.referenceId}>
                    {lastPayment.referenceId}
                  </span>
                </div>
                {paidPayments.length > 1 && (
                  <p className="pt-1 text-[10px] text-muted-foreground italic">
                    +{paidPayments.length - 1} earlier payment{paidPayments.length - 1 === 1 ? '' : 's'} — see the Payments tab for the full ledger.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
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
