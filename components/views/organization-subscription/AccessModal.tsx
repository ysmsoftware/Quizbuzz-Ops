'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { CalendarClock, X } from 'lucide-react';
import { OrganizationSubscription } from '@/lib/types';
import { AccessUpdate } from '@/lib/api/organizations';

const dayOf = (iso: string | null) => (iso ? format(new Date(iso), 'yyyy-MM-dd') : '');

interface AccessModalProps {
  subscription: OrganizationSubscription;
  onClose: () => void;
  onSubmit: (input: AccessUpdate) => Promise<void>;
  isSubmitting: boolean;
}

/** Move a subscription's end date or grace period, for a trusted payment on its way or a contract's terms. */
export default function AccessModal({ subscription, onClose, onSubmit, isSubmitting }: AccessModalProps) {
  const [endDate, setEndDate] = useState(format(new Date(subscription.currentPeriodEnd), 'yyyy-MM-dd'));
  const [cycleStart, setCycleStart] = useState(format(new Date(subscription.currentPeriodStart), 'yyyy-MM-dd'));
  const cycleStartChanged = !!cycleStart && format(new Date(subscription.currentPeriodStart), 'yyyy-MM-dd') !== cycleStart;
  const [graceDays, setGraceDays] = useState(String(subscription.graceDays));
  const [reason, setReason] = useState('');
  const [contractStart, setContractStart] = useState(dayOf(subscription.contractStart));
  const [contractEnd, setContractEnd] = useState(dayOf(subscription.contractEnd));
  const [poNumber, setPoNumber] = useState(subscription.poNumber ?? '');
  const [contractNotes, setContractNotes] = useState(subscription.contractNotes ?? '');

  const newEnd = new Date(`${endDate}T23:59:59`);
  const endChanged = !!endDate && format(new Date(subscription.currentPeriodEnd), 'yyyy-MM-dd') !== endDate;
  const graceChanged = Number(graceDays) !== subscription.graceDays;
  const startChanged = contractStart !== dayOf(subscription.contractStart);
  const contractEndChanged = contractEnd !== dayOf(subscription.contractEnd);
  const poChanged = poNumber !== (subscription.poNumber ?? '');
  const notesChanged = contractNotes !== (subscription.contractNotes ?? '');
  const anyChange = cycleStartChanged || endChanged || graceChanged || startChanged || contractEndChanged || poChanged || notesChanged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      currentPeriodStart: cycleStartChanged ? new Date(`${cycleStart}T00:00:00`).toISOString() : undefined,
      currentPeriodEnd: endChanged ? newEnd.toISOString() : undefined,
      graceDays: graceChanged ? Number(graceDays) : undefined,
      contractStart: startChanged ? (contractStart ? new Date(`${contractStart}T00:00:00`).toISOString() : null) : undefined,
      contractEnd: contractEndChanged ? (contractEnd ? new Date(`${contractEnd}T23:59:59`).toISOString() : null) : undefined,
      poNumber: poChanged ? poNumber || null : undefined,
      contractNotes: notesChanged ? contractNotes || null : undefined,
      reason: reason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border border-border/80 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border/50 bg-muted/20">
          <div className="flex items-center space-x-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Access and contract</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label htmlFor="access-start" className="block font-semibold text-foreground mb-1">Cycle started</label>
            <input
              id="access-start"
              type="date"
              required
              value={cycleStart}
              onChange={(e) => setCycleStart(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-muted-foreground">Also where each month of usage starts counting.</p>
          </div>

          <div>
            <label htmlFor="access-end" className="block font-semibold text-foreground mb-1">Paid until</label>
            <input
              id="access-end"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="access-grace" className="block font-semibold text-foreground mb-1">Grace days after that</label>
            <input
              id="access-grace"
              type="number"
              min={0}
              max={365}
              required
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Only a super admin can change this.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
            <div>
              <label htmlFor="access-c-start" className="block font-semibold text-foreground mb-1">Contract start</label>
              <input id="access-c-start" type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="access-c-end" className="block font-semibold text-foreground mb-1">Contract end</label>
              <input id="access-c-end" type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">The owner is reminded 60, 30 and 7 days before the contract ends.</p>

          <div>
            <label htmlFor="access-po" className="block font-semibold text-foreground mb-1">PO number</label>
            <input id="access-po" type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
          </div>

          <div>
            <label htmlFor="access-notes" className="block font-semibold text-foreground mb-1">Contract notes</label>
            <textarea id="access-notes" rows={2} value={contractNotes} onChange={(e) => setContractNotes(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary" />
          </div>

          <div>
            <label htmlFor="access-reason" className="block font-semibold text-foreground mb-1">Reason (required)</label>
            <input
              id="access-reason"
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. PO approved, bank transfer expected by 20 Nov"
              className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-border/40">
            <button type="button" onClick={onClose} className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim() || !anyChange}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
