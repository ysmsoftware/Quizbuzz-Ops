'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { actOnInvoice, InvoiceAction, issueInvoice, IssueInvoiceBody, listInvoices, recordInvoicePayment, RecordPaymentBody, voidInvoicePayment, issueCreditNote, type CreditNoteBody } from '@/lib/api/invoices';

export function useInvoices(params: { organizationId?: string; status?: string; overdue?: boolean; page: number; limit: number }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['invoices', params], queryFn: () => listInvoices(params) });

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['organizations'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  return {
    invoices: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    issue: useMutation({ mutationFn: ({ orgId, body }: { orgId: string; body: IssueInvoiceBody }) => issueInvoice(orgId, body), onSuccess }),
    record: useMutation({ mutationFn: ({ id, body }: { id: string; body: RecordPaymentBody }) => recordInvoicePayment(id, body), onSuccess }),
    voidPayment: useMutation({ mutationFn: ({ id, paymentId, reason }: { id: string; paymentId: string; reason: string }) => voidInvoicePayment(id, paymentId, reason), onSuccess }),
    creditNote: useMutation({ mutationFn: ({ id, body }: { id: string; body: CreditNoteBody }) => issueCreditNote(id, body), onSuccess }),
    act: useMutation({ mutationFn: ({ id, body }: { id: string; body: InvoiceAction }) => actOnInvoice(id, body), onSuccess }),
  };
}
