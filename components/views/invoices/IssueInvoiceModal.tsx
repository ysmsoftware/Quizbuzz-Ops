'use client';

import React, { useState } from 'react';
import { SubscriptionPlan } from '@/lib/types';
import { IssueInvoiceBody } from '@/lib/api/invoices';
import { formatInr } from '@/lib/format';
import { Field, fieldClass, InvoiceModal } from './InvoiceModal';

type Cycle = NonNullable<IssueInvoiceBody['billingCycle']>;

function priceOf(plan: SubscriptionPlan, cycle: Cycle): number | null {
  if (cycle === 'MONTHLY') return plan.monthlyPrice;
  if (cycle === 'HALF_YEARLY') return plan.halfYearlyPrice;
  if (cycle === 'ANNUAL') return plan.annualPrice;
  return null;
}

/** Ops' "payment request": what it's for, how it's paid, by when, and whether access waits for the money. */
export default function IssueInvoiceModal({ plans, onClose, onSubmit, isSubmitting, canComplimentary }: {
  plans: SubscriptionPlan[];
  onClose: () => void;
  onSubmit: (body: IssueInvoiceBody) => Promise<void>;
  isSubmitting: boolean;
  canComplimentary: boolean;
}) {
  const [method, setMethod] = useState<IssueInvoiceBody['collectionMethod']>('OFFLINE');
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState<Cycle>('ANNUAL');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [dueInDays, setDueInDays] = useState('15');
  const [accessMode, setAccessMode] = useState<IssueInvoiceBody['accessMode']>('ON_PAYMENT');

  const complimentary = method === 'COMPLIMENTARY';
  const plan = plans.find((p) => p.id === planId);
  const base = Number(amount) || 0;
  const total = base + (base * (Number(gstRate) || 0)) / 100;

  const choosePlan = (id: string, nextCycle: Cycle = cycle) => {
    setPlanId(id);
    setCycle(nextCycle);
    const next = plans.find((p) => p.id === id);
    if (!next) return;
    const price = priceOf(next, nextCycle);
    if (price != null) setAmount(String(price));
    const label = nextCycle === 'CUSTOM' ? 'contract' : nextCycle === 'HALF_YEARLY' ? '6 months' : nextCycle === 'ANNUAL' ? '1 year' : '1 month';
    setDescription(`QuizBuzz ${next.name} plan, ${label}`);
  };

  const submit = () =>
    onSubmit({
      description,
      collectionMethod: method,
      amount: complimentary ? 0 : base,
      gstRate: complimentary ? 0 : Number(gstRate),
      dueInDays: complimentary ? 0 : Number(dueInDays),
      accessMode: complimentary ? 'ACCESS_NOW' : accessMode,
      planId: planId || undefined,
      billingCycle: planId ? cycle : undefined,
      periodEnd: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
    });

  const needsEnd = complimentary || (!!planId && cycle === 'CUSTOM');

  return (
    <InvoiceModal
      title="Issue invoice"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={complimentary ? 'Grant plan' : 'Issue invoice'}
      isSubmitting={isSubmitting}
      disabled={!description.trim() || (needsEnd && !endDate) || (complimentary ? !planId : base <= 0)}
    >
      <Field label="How will they pay?" htmlFor="inv-method">
        <select id="inv-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={fieldClass}>
          <option value="OFFLINE">Bank transfer or cheque, we record it</option>
          <option value="PAY_ONLINE">Online, with a Razorpay pay link</option>
          {canComplimentary && <option value="COMPLIMENTARY">Complimentary, no charge</option>}
        </select>
      </Field>

      <Field label="Plan" htmlFor="inv-plan" hint="Leave empty for an instalment or an extra charge on their current plan.">
        <select id="inv-plan" value={planId} onChange={(e) => choosePlan(e.target.value)} className={fieldClass}>
          <option value="">No plan change</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isSellable ? '' : ' (not on sale)'}</option>)}
        </select>
      </Field>

      {planId && (
        <Field label="Billing cycle" htmlFor="inv-cycle">
          <select id="inv-cycle" value={cycle} onChange={(e) => choosePlan(planId, e.target.value as Cycle)} className={fieldClass}>
            <option value="MONTHLY">Monthly{plan?.monthlyPrice != null ? ` (${formatInr(plan.monthlyPrice)})` : ''}</option>
            <option value="HALF_YEARLY">6 months{plan?.halfYearlyPrice != null ? ` (${formatInr(plan.halfYearlyPrice)})` : ''}</option>
            <option value="ANNUAL">Yearly{plan?.annualPrice != null ? ` (${formatInr(plan.annualPrice)})` : ''}</option>
            <option value="CUSTOM">Contract with its own end date</option>
          </select>
        </Field>
      )}

      {(needsEnd || planId) && (
        <Field label={needsEnd ? 'Access until' : 'Access until (optional)'} htmlFor="inv-end">
          <input id="inv-end" type="date" required={needsEnd} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fieldClass} />
        </Field>
      )}

      <Field label={complimentary ? 'Reason' : 'Description on the invoice'} htmlFor="inv-desc" hint={complimentary ? 'For example, the partner deal this is part of.' : undefined}>
        <input id="inv-desc" type="text" required value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
      </Field>

      {!complimentary && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount before GST (₹)" htmlFor="inv-amount">
              <input id="inv-amount" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass} />
            </Field>
            <Field label="GST %" htmlFor="inv-gst">
              <input id="inv-gst" type="number" min="0" max="100" step="0.01" required value={gstRate} onChange={(e) => setGstRate(e.target.value)} className={fieldClass} />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">Total with GST: <strong className="text-foreground">{formatInr(total, { fixed: 2 })}</strong></p>

          <Field label="Due in (days)" htmlFor="inv-due">
            <input id="inv-due" type="number" min="0" max="365" required value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} className={fieldClass} />
          </Field>

          <Field
            label="When do they get access?"
            htmlFor="inv-access"
            hint={accessMode === 'ACCESS_NOW' ? 'Usable straight away. Restricted automatically if unpaid after the due date plus their grace days.' : 'Nothing changes until this is paid in full.'}
          >
            <select id="inv-access" value={accessMode} onChange={(e) => setAccessMode(e.target.value as typeof accessMode)} className={fieldClass}>
              <option value="ON_PAYMENT">When it&apos;s paid</option>
              <option value="ACCESS_NOW">Now, before payment</option>
            </select>
          </Field>
        </>
      )}
    </InvoiceModal>
  );
}
