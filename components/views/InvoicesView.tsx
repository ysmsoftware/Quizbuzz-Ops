'use client';

import React, { useState } from 'react';
import InvoicesTable from './invoices/InvoicesTable';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';

const FILTERS = [
  { id: 'overdue', label: 'Overdue' },
  { id: '', label: 'All' },
  { id: 'ISSUED', label: 'Unpaid' },
  { id: 'PARTIALLY_PAID', label: 'Part paid' },
  { id: 'PAID', label: 'Paid' },
];

/** Who owes what. Razorpay and manually recorded money sit side by side, each labelled. */
export default function InvoicesView() {
  const [filter, setFilter] = useState('overdue');
  const { admin } = useCurrentAdmin();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Invoices</h1>
        <p className="text-xs text-muted-foreground">Issue new ones from an organization&apos;s Invoices tab.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter invoices">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${filter === f.id ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:bg-secondary/40'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <InvoicesTable key={filter} overdue={filter === 'overdue'} status={filter === 'overdue' ? undefined : filter || undefined} isSuperAdmin={admin?.role === 'SUPER_ADMIN'} showOrg />
    </div>
  );
}
