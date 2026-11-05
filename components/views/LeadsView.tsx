'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listLeads, SalesLead, updateLead } from '@/lib/api/invoices';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import Pagination from '@/components/ui/Pagination';
import { fieldClass } from './invoices/InvoiceModal';

const STATUSES: SalesLead['status'][] = ['NEW', 'CONTACTED', 'WON', 'LOST'];
const PAGE_SIZE = 25;

/** Contact-sales requests. Won deals become a private plan and an invoice on the org. */
export default function LeadsView() {
  const [status, setStatus] = useState('NEW');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['leads', status, page], queryFn: () => listLeads(status, page) });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status?: SalesLead['status']; notes?: string } }) => updateLead(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (err) => toast('Could not save', errorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h1 className="text-lg font-bold">Leads</h1>
        <p className="text-muted-foreground">People who asked to talk to sales.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter leads">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 font-semibold rounded-lg border ${status === s ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:bg-secondary/40'}`}
          >
            {s[0] + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : !data?.rows.length ? (
        <p className="py-8 text-center text-muted-foreground">No leads here.</p>
      ) : (
        data.rows.map((lead) => (
          <div key={lead.id} className="p-4 bg-card border border-border/50 rounded-xl space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">{lead.name}{lead.organization ? `, ${lead.organization}` : ''}</p>
                <p className="text-muted-foreground">{lead.email}{lead.phone ? ` · ${lead.phone}` : ''} · {format(new Date(lead.createdAt), 'MMM d, yyyy')}{lead.learners ? ` · about ${lead.learners} learners` : ''}</p>
                {lead.organizationId && <Link href={`/dashboard/organizations/${lead.organizationId}`} className="text-primary hover:underline">Open organization</Link>}
              </div>
              <select
                aria-label={`Status of ${lead.name}`}
                value={lead.status}
                onChange={(e) => update.mutate({ id: lead.id, body: { status: e.target.value as SalesLead['status'] } })}
                className="px-2 py-1 rounded-md bg-background border border-input"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            {lead.message && <p className="whitespace-pre-wrap">{lead.message}</p>}
            <textarea
              aria-label={`Notes on ${lead.name}`}
              defaultValue={lead.notes ?? ''}
              placeholder="Notes"
              rows={2}
              onBlur={(e) => { if (e.target.value !== (lead.notes ?? '')) update.mutate({ id: lead.id, body: { notes: e.target.value } }); }}
              className={fieldClass}
            />
          </div>
        ))
      )}
      <Pagination currentPage={page} totalItems={data?.total ?? 0} pageSize={PAGE_SIZE} itemLabel="leads" onPageChange={setPage} />
    </div>
  );
}
