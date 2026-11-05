'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { usePlans } from '@/lib/hooks/usePlans';
import { useInvoices } from '@/lib/hooks/useInvoices';
import { useToast } from '@/components/ui/Toast';
import { IssueInvoiceBody } from '@/lib/api/invoices';
import { errorMessage } from '@/lib/errors';
import InvoicesTable from './InvoicesTable';
import IssueInvoiceModal from './IssueInvoiceModal';

export default function OrgInvoicesTab({ orgId, role }: { orgId: string; role?: string }) {
  const { plans } = usePlans();
  const { issue } = useInvoices({ organizationId: orgId, page: 1, limit: 1 });
  const { toast } = useToast();
  const [isIssuing, setIsIssuing] = useState(false);
  const canBill = role === 'SUPER_ADMIN' || role === 'BILLING_ADMIN';

  const submit = async (body: IssueInvoiceBody) => {
    try {
      const { linkError } = await issue.mutateAsync({ orgId, body });
      toast(linkError ? 'Issued, without a pay link' : 'Invoice issued', linkError ?? 'The owner has been emailed.', linkError ? 'warning' : 'success');
      setIsIssuing(false);
    } catch (err) {
      toast('Could not issue it', errorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-4">
      {canBill && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setIsIssuing(true)} className="px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Issue invoice
          </button>
        </div>
      )}
      <InvoicesTable organizationId={orgId} isSuperAdmin={role === 'SUPER_ADMIN'} />
      {isIssuing && (
        <IssueInvoiceModal
          // A private plan is only ever offered to its own org.
          plans={plans.filter((p) => p.isActive && p.kind !== 'FREE' && (!p.organizationId || p.organizationId === orgId))}
          onClose={() => setIsIssuing(false)}
          onSubmit={submit}
          isSubmitting={issue.isPending}
          canComplimentary={role === 'SUPER_ADMIN'}
        />
      )}
    </div>
  );
}
