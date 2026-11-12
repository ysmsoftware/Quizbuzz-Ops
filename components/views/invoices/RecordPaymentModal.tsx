'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Invoice, RecordPaymentBody } from '@/lib/api/invoices';
import { formatInr } from '@/lib/format';
import { Field, fieldClass, InvoiceModal } from './InvoiceModal';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Money that reached our bank. There's no Razorpay record behind it, so the reference and proof are the evidence. */
export default function RecordPaymentModal({ invoice, onClose, onSubmit, isSubmitting }: {
  invoice: Invoice;
  onClose: () => void;
  onSubmit: (body: RecordPaymentBody) => Promise<void>;
  isSubmitting: boolean;
}) {
  const balance = Number(invoice.total) - Number(invoice.amountPaid) - Number(invoice.tdsAmount);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [tds, setTds] = useState('0');
  const [receivedOn, setReceivedOn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [source, setSource] = useState<RecordPaymentBody['source']>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const covered = (Number(amount) || 0) + (Number(tds) || 0);
  const tooBig = !!file && file.size > MAX_PROOF_BYTES;
  const over = covered - balance > 0.001;

  const submit = async () => {
    await onSubmit({
      amount: Number(amount) || 0,
      tdsAmount: Number(tds) || 0,
      receivedAt: new Date(`${receivedOn}T12:00:00`).toISOString(),
      source,
      reference: reference.trim(),
      notes: notes.trim() || undefined,
      proof: file ? { fileName: file.name, contentType: file.type, base64: await readBase64(file) } : undefined,
    });
  };

  return (
    <InvoiceModal
      title={`Record payment: ${invoice.invoiceNumber}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Record payment"
      isSubmitting={isSubmitting}
      disabled={!reference.trim() || covered <= 0 || over || tooBig}
    >
      <p className="text-muted-foreground">Still due: <strong className="text-foreground">{formatInr(balance, { fixed: 2 })}</strong>. This is recorded manually, with no Razorpay record behind it.</p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cash received (₹)" htmlFor="pay-amount">
          <input id="pay-amount" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="TDS they deducted (₹)" htmlFor="pay-tds">
          <input id="pay-tds" type="number" min="0" step="0.01" value={tds} onChange={(e) => setTds(e.target.value)} className={fieldClass} />
        </Field>
      </div>
      {over && <p className="text-destructive">That&apos;s more than what&apos;s still due.</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Received on" htmlFor="pay-date">
          <input id="pay-date" type="date" required max={format(new Date(), 'yyyy-MM-dd')} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Paid by" htmlFor="pay-source">
          <select id="pay-source" value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={fieldClass}>
            <option value="BANK_TRANSFER">NEFT, RTGS or IMPS</option>
            <option value="CHEQUE">Cheque</option>
            <option value="UPI_DIRECT">UPI to our account</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
      </div>

      <Field label="UTR or cheque number" htmlFor="pay-ref">
        <input id="pay-ref" type="text" required value={reference} onChange={(e) => setReference(e.target.value)} className={fieldClass} />
      </Field>

      <Field label="Proof (optional)" htmlFor="pay-proof" hint="PDF, PNG or JPG, up to 5 MB. A bank screenshot or the customer's receipt.">
        <input id="pay-proof" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={fieldClass} />
      </Field>
      {tooBig && <p className="text-destructive">That file is over 5 MB.</p>}

      <Field label="Note (optional)" htmlFor="pay-notes">
        <input id="pay-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
      </Field>
    </InvoiceModal>
  );
}
