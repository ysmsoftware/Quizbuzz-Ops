'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BillingSettings, getBillingSettings, saveBillingSettings } from '@/lib/api/invoices';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { Field, fieldClass } from './invoices/InvoiceModal';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';

const EMPTY: BillingSettings = {
  legalName: '', gstin: '', sacCode: '', address: '', state: '', email: '', phone: '',
  bankName: '', accountName: '', accountNumber: '', ifsc: '', upiId: '', invoicePrefix: 'INV', receiptPrefix: 'REC', creditNotePrefix: 'CN',
};

const TEXT_FIELDS: Array<{ key: keyof BillingSettings; label: string; required?: boolean; hint?: string }> = [
  { key: 'legalName', label: 'Company name', required: true, hint: 'Shown at the top of every invoice and receipt.' },
  { key: 'address', label: 'Address', required: true },
  { key: 'state', label: 'State', required: true, hint: 'Decides CGST and SGST or IGST on each invoice.' },
  { key: 'gstin', label: 'GSTIN', required: true, hint: 'Printed on every invoice and receipt.' },
  { key: 'sacCode', label: 'SAC code', hint: 'Printed on the invoice. Have your CA confirm it.' },
  { key: 'email', label: 'Billing email' },
  { key: 'phone', label: 'Phone' },
  { key: 'accountName', label: 'Bank account name' },
  { key: 'bankName', label: 'Bank' },
  { key: 'accountNumber', label: 'Account number' },
  { key: 'ifsc', label: 'IFSC' },
  { key: 'upiId', label: 'UPI ID' },
  { key: 'invoicePrefix', label: 'Invoice number prefix', required: true, hint: 'INV/26-27/00001. Up to 4 letters: GST allows 16 characters in all.' },
  { key: 'receiptPrefix', label: 'Receipt number prefix', required: true, hint: 'REC/26-27/00001. Up to 4 letters.' },
  { key: 'creditNotePrefix', label: 'Credit note number prefix', required: true, hint: 'CN/26-27/00001. Up to 4 letters.' },
];

export default function BillingSettingsView() {
  const { data, isLoading } = useQuery({ queryKey: ['billing-settings'], queryFn: getBillingSettings });
  if (isLoading) return <p className="py-8 text-center text-xs text-muted-foreground">Loading...</p>;
  return <SettingsForm initial={data ?? EMPTY} />;
}

function SettingsForm({ initial }: { initial: BillingSettings }) {
  const { admin } = useCurrentAdmin();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<BillingSettings>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = admin?.role === 'SUPER_ADMIN';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Empty optional boxes are saved as "not set".
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])) as unknown as BillingSettings;
      await saveBillingSettings(body);
      queryClient.invalidateQueries({ queryKey: ['billing-settings'] });
      toast('Saved', 'New invoices will use these details.', 'success');
    } catch (err) {
      toast('Could not save', errorMessage(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 max-w-2xl text-xs">
      <div>
        <h1 className="text-lg font-bold">Billing Settings</h1>
        <p className="text-muted-foreground">Your company details, GST number and bank account. Printed on every new invoice and receipt. Documents already issued keep the details they went out with.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-card border border-border/50 rounded-xl">
        {TEXT_FIELDS.map(({ key, label, required, hint }) => (
          <Field key={key} label={label} htmlFor={`bs-${key}`} hint={hint}>
            <input
              id={`bs-${key}`}
              type="text"
              required={required}
              disabled={!canEdit}
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={fieldClass}
            />
          </Field>
        ))}
      </div>
      {canEdit && (
        <button type="submit" disabled={isSaving} className="px-4 py-2 font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {isSaving ? 'Saving...' : 'Save settings'}
        </button>
      )}
    </form>
  );
}
