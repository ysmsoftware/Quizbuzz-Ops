'use client';

import React, { useState } from 'react';
import { SubscriptionPlan } from '@/lib/types';
import { Layers, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatInr } from '@/lib/format';

interface ChangePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { planId: string; reason: string; when: 'now' | 'period_end'; billingCycle?: 'MONTHLY' | 'HALF_YEARLY' | 'ANNUAL' }) => Promise<void>;
  /** Set when the org has paid time left, so the change can wait for it. */
  periodEnd?: string | null;
  plans: SubscriptionPlan[];
  currentPlanId: string;
  isSubmitting: boolean;
  /** Opens the org's Invoices tab, for a plan whose money has not come in yet. */
  onUseInvoice?: () => void;
}

export default function ChangePlanModal({
  isOpen,
  onClose,
  onSubmit,
  plans,
  currentPlanId,
  isSubmitting,
  periodEnd,
  onUseInvoice,
}: ChangePlanModalProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId);
  const [reason, setReason] = useState('');
  const [when, setWhen] = useState<'now' | 'period_end'>('now');
  const [cycle, setCycle] = useState<'' | 'MONTHLY' | 'HALF_YEARLY' | 'ANNUAL'>('');
  // Switching a plan here gives a full paid period at once, so for a plan that costs money say whether it was paid.
  const [payment, setPayment] = useState<'' | 'received' | 'invoice'>('');
  const [reference, setReference] = useState('');
  const selected = plans.find((p) => p.id === selectedPlanId);
  const cycles = selected ? ([['MONTHLY', selected.allowsMonthly], ['HALF_YEARLY', selected.allowsHalfYearly], ['ANNUAL', selected.allowsAnnual]] as const).filter(([, ok]) => ok).map(([c]) => c) : [];

  const priceOfCycle = selected
    ? ({ MONTHLY: selected.monthlyPrice, HALF_YEARLY: selected.halfYearlyPrice, ANNUAL: selected.annualPrice } as const)[cycle || cycles[0] || 'MONTHLY']
    : null;
  const needsPaymentAnswer = !!selected && selectedPlanId !== currentPlanId && (priceOfCycle ?? 0) > 0 && when === 'now';

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId || selectedPlanId === currentPlanId) return;
    if (needsPaymentAnswer && payment === 'invoice') return onUseInvoice?.();
    // The payment note rides in the audit reason, so the history shows what was received and where from.
    const note = needsPaymentAnswer && payment === 'received' ? `Payment received${reference.trim() ? ` (ref: ${reference.trim()})` : ''}` : '';
    await onSubmit({ planId: selectedPlanId, reason: [note, reason.trim()].filter(Boolean).join('. '), when, billingCycle: cycle || undefined });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-border/80 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-border/50 bg-muted/20">
            <div className="flex items-center space-x-2">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">Change Organization Subscription Plan</h2>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            <div className="space-y-2">
              <label className="block font-semibold text-foreground">Select Target Tier</label>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {plans.filter(p => p.isActive).map((p) => {
                  const isCurrent = p.id === currentPlanId;
                  const isSelected = p.id === selectedPlanId;

                  return (
                    <div
                      key={p.id}
                      onClick={() => !isCurrent && setSelectedPlanId(p.id)}
                      className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                        isCurrent
                          ? 'border-muted bg-muted/30 opacity-60 cursor-not-allowed'
                          : isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-foreground">{p.name}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{p.description}</p>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-foreground">
                          {p.allowsMonthly && p.monthlyPrice !== null
                            ? p.monthlyPrice === 0 ? 'Free' : `${formatInr(p.monthlyPrice)}/mo`
                            : p.allowsAnnual && p.annualPrice !== null
                            ? p.annualPrice === 0 ? 'Free' : `${formatInr(p.annualPrice)}/yr`
                            : '—'}
                        </span>
                        {isSelected && !isCurrent && <Check className="h-4 w-4 text-primary ml-auto mt-1 font-bold" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {cycles.length > 1 && (
              <div>
                <label htmlFor="cp-cycle" className="block font-semibold text-foreground mb-1">Billing cycle</label>
                <select id="cp-cycle" value={cycle} onChange={(e) => setCycle(e.target.value as typeof cycle)} className="w-full px-3 py-2 rounded-md bg-background border border-input">
                  <option value="">The plan&apos;s default</option>
                  {cycles.map((c) => <option key={c} value={c}>{c === 'MONTHLY' ? 'Monthly' : c === 'HALF_YEARLY' ? 'Every 6 months' : 'Yearly'}</option>)}
                </select>
              </div>
            )}

            {periodEnd && new Date(periodEnd) > new Date() && (
              <fieldset className="space-y-1">
                <legend className="block font-semibold text-foreground mb-1">When</legend>
                <label className="flex items-center gap-2"><input type="radio" name="cp-when" checked={when === 'now'} onChange={() => setWhen('now')} /> Now, with a fresh period</label>
                <label className="flex items-center gap-2"><input type="radio" name="cp-when" checked={when === 'period_end'} onChange={() => setWhen('period_end')} /> At the period end, {new Date(periodEnd).toLocaleDateString()}: they keep what they paid for</label>
              </fieldset>
            )}

            {needsPaymentAnswer && (
              <fieldset className="space-y-1.5 rounded-lg border border-border/60 p-3">
                <legend className="px-1 font-semibold text-foreground">Has {formatInr(priceOfCycle ?? 0)} been paid?</legend>
                <p className="text-muted-foreground">Switching now gives a full paid period straight away, and the next charge is a period later.</p>
                <label className="flex items-center gap-2"><input type="radio" name="cp-pay" checked={payment === 'received'} onChange={() => setPayment('received')} /> Yes, the payment is received</label>
                {payment === 'received' && (
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Reference: UTR, cheque number or note (optional)"
                    className="w-full px-3 py-2 rounded-md bg-background border border-input"
                  />
                )}
                <label className="flex items-center gap-2"><input type="radio" name="cp-pay" checked={payment === 'invoice'} onChange={() => setPayment('invoice')} /> Not yet: issue an invoice and start the plan when it is paid</label>
              </fieldset>
            )}

            <div>
              <label className="block font-semibold text-foreground mb-1">Reason / Notes for Audit Log</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Approved tier upgrade request following team expansion"
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedPlanId || selectedPlanId === currentPlanId || (needsPaymentAnswer && !payment)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : needsPaymentAnswer && payment === 'invoice' ? 'Go to Invoices' : when === 'period_end' ? 'Schedule change' : 'Confirm Plan Switch'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
