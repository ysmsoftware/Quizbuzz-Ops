'use client';

import React, { useState } from 'react';
import { CreditNoteBody, Invoice } from '@/lib/api/invoices';
import { formatInr } from '@/lib/format';
import { Field, fieldClass, InvoiceModal } from './InvoiceModal';

/** A credit note against the invoice, with or without a refund. The invoice itself never changes. */
export default function CreditNoteModal({ invoice, onClose, onSubmit, isSubmitting }: {
  invoice: Invoice;
  onClose: () => void;
  onSubmit: (body: CreditNoteBody) => Promise<void>;
  isSubmitting: boolean;
}) {
  const creditable = Number(invoice.total) - Number(invoice.creditedAmount);
  const payments = invoice.payments.filter((p) => !p.voidedAt && Number(p.amount) > 0);
  const refundedOn = (paymentId: string) => invoice.creditNotes.filter((c) => c.paymentId === paymentId).reduce((s, c) => s + Number(c.total), 0);

  const [amount, setAmount] = useState(creditable.toFixed(2));
  const [reason, setReason] = useState('');
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? '');
  const payment = payments.find((p) => p.id === paymentId);
  const [method, setMethod] = useState<CreditNoteBody['refundMethod']>(payments.length === 0 ? 'NONE' : payment?.razorpayPaymentId ? 'RAZORPAY' : 'BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [endAccess, setEndAccess] = useState(false);

  const value = Number(amount) || 0;
  const refundable = payment ? Number(payment.amount) - refundedOn(payment.id) : 0;
  const tooMuch = value - creditable > 0.001 || (method !== 'NONE' && value - refundable > 0.001);

  return (
    <InvoiceModal
      title={`Credit note: ${invoice.invoiceNumber}`}
      onClose={onClose}
      submitLabel={method === 'NONE' ? 'Issue credit note' : 'Refund and issue credit note'}
      isSubmitting={isSubmitting}
      disabled={value <= 0 || tooMuch || reason.trim().length < 3 || (method === 'BANK_TRANSFER' && !reference.trim()) || (method !== 'NONE' && !payment)}
      onSubmit={() => onSubmit({
        amount: value,
        reason: reason.trim(),
        refundMethod: method,
        paymentId: method === 'NONE' ? undefined : paymentId,
        refundReference: method === 'BANK_TRANSFER' ? reference.trim() : undefined,
        endAccess,
      })}
    >
      <p className="text-muted-foreground">
        Up to <strong className="text-foreground">{formatInr(creditable, { fixed: 2 })}</strong> can still be credited, including GST. The credit note gets its own number and PDF, and the owner is emailed.
      </p>

      <Field label="Amount, including GST (₹)" htmlFor="cn-amount">
        <input id="cn-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass} />
      </Field>

      <Field label="Refund" htmlFor="cn-method">
        <select id="cn-method" value={method} onChange={(e) => setMethod(e.target.value as CreditNoteBody['refundMethod'])} className={fieldClass}>
          <option value="NONE">No refund: only lower what&apos;s owed</option>
          {payments.length > 0 && <option value="RAZORPAY" disabled={!payment?.razorpayPaymentId}>Refund through Razorpay</option>}
          {payments.length > 0 && <option value="BANK_TRANSFER">I refunded it by bank transfer</option>}
        </select>
      </Field>

      {method !== 'NONE' && (
        <Field label="Payment to refund" htmlFor="cn-payment" hint={payment ? `${formatInr(refundable, { fixed: 2 })} of it can still be refunded.` : undefined}>
          <select id="cn-payment" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} className={fieldClass}>
            {payments.map((p) => (
              <option key={p.id} value={p.id}>{formatInr(Number(p.amount), { fixed: 2 })} · {p.receiptNumber ?? p.reference ?? p.razorpayPaymentId}</option>
            ))}
          </select>
        </Field>
      )}
      {method === 'BANK_TRANSFER' && (
        <Field label="UTR of your transfer" htmlFor="cn-ref">
          <input id="cn-ref" type="text" value={reference} onChange={(e) => setReference(e.target.value)} className={fieldClass} />
        </Field>
      )}
      {tooMuch && <p className="text-destructive">That&apos;s more than can be credited or refunded.</p>}

      <Field label="Reason (required, printed on the credit note)" htmlFor="cn-reason">
        <input id="cn-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
      </Field>

      <label className="flex items-start gap-2">
        <input type="checkbox" checked={endAccess} onChange={(e) => setEndAccess(e.target.checked)} className="mt-0.5" />
        <span>End their access now: stop any auto-debit and move them to Free. Data is kept.</span>
      </label>
    </InvoiceModal>
  );
}
