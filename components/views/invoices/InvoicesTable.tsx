'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Invoice, InvoiceAction, InvoicePayment, RecordPaymentBody } from '@/lib/api/invoices';
import { useInvoices } from '@/lib/hooks/useInvoices';
import { useToast } from '@/components/ui/Toast';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import { formatInr } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { Field, fieldClass, InvoiceModal } from './InvoiceModal';
import RecordPaymentModal from './RecordPaymentModal';

const STATUS: Record<Invoice['status'], { tone: 'success' | 'warning' | 'neutral' | 'danger' | 'info'; label: string }> = {
  ISSUED: { tone: 'info', label: 'Unpaid' },
  PARTIALLY_PAID: { tone: 'warning', label: 'Part paid' },
  PAID: { tone: 'success', label: 'Paid' },
  VOID: { tone: 'neutral', label: 'Void' },
  WRITTEN_OFF: { tone: 'neutral', label: 'Written off' },
};

const SOURCE: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  UPI_DIRECT: 'UPI',
  OTHER: 'Other',
  RAZORPAY_LINK: 'Razorpay link',
  RAZORPAY_ORDER: 'Razorpay checkout',
  RAZORPAY_SUBSCRIPTION: 'Razorpay auto-debit',
};

type Dialog =
  | { kind: 'record'; invoice: Invoice }
  | { kind: 'reason'; invoice: Invoice; action: 'void' | 'write_off' | 'extend_due' }
  | { kind: 'void_payment'; invoice: Invoice; payment: InvoicePayment };

const isOpen = (i: Invoice) => i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID';
const balanceOf = (i: Invoice) => Number(i.total) - Number(i.amountPaid) - Number(i.tdsAmount);
const buttonClass = 'px-2 py-1 text-[11px] font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary/40 disabled:opacity-50';

/** Invoices with their payments and every action on them. Used by the org tab and the Invoices page. */
export default function InvoicesTable({ organizationId, status, overdue, isSuperAdmin, showOrg, pageSize = 15 }: {
  organizationId?: string;
  status?: string;
  overdue?: boolean;
  isSuperAdmin: boolean;
  showOrg?: boolean;
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const { invoices, total, isLoading, record, voidPayment, act } = useInvoices({ organizationId, status, overdue, page, limit: pageSize });
  const { toast } = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [reason, setReason] = useState('');
  const [newDue, setNewDue] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const open = (d: Dialog) => { setReason(''); setNewDue(''); setDialog(d); };

  const run = async (body: InvoiceAction, invoice: Invoice, done: string) => {
    try {
      await act.mutateAsync({ id: invoice.id, body });
      toast('Done', done, 'success');
      setDialog(null);
    } catch (err) {
      toast('Could not do that', errorMessage(err), 'error');
    }
  };

  const submitPayment = async (invoice: Invoice, body: RecordPaymentBody) => {
    try {
      await record.mutateAsync({ id: invoice.id, body });
      toast('Payment recorded', `Recorded against ${invoice.invoiceNumber}.`, 'success');
      setDialog(null);
    } catch (err) {
      toast('Could not record it', errorMessage(err), 'error');
    }
  };

  if (isLoading) return <p className="py-8 text-center text-xs text-muted-foreground">Loading invoices...</p>;
  if (invoices.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">No invoices here.</p>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto bg-card border border-border/50 rounded-xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/50">
              <th scope="col" className="py-3 px-4 font-semibold">Date</th>
              <th scope="col" className="py-3 px-4 font-semibold">Invoice</th>
              {showOrg && <th scope="col" className="py-3 px-4 font-semibold">Organization</th>}
              <th scope="col" className="py-3 px-4 font-semibold text-right">Total</th>
              <th scope="col" className="py-3 px-4 font-semibold">Status</th>
              <th scope="col" className="py-3 px-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const late = isOpen(inv) && new Date(inv.dueAt) < new Date();
              const expanded = openId === inv.id;
              return (
                <React.Fragment key={inv.id}>
                  <tr className="border-b border-border/30 last:border-0">
                    <td className="py-3 px-4 whitespace-nowrap">{format(new Date(inv.createdAt), 'MMM d, yyyy')}</td>
                    <td className="py-3 px-4 font-mono whitespace-nowrap">{inv.invoiceNumber}</td>
                    {showOrg && <td className="py-3 px-4"><Link href={`/dashboard/organizations/${inv.organizationId}`} className="font-semibold hover:underline">{inv.organizationName}</Link></td>}
                    <td className="py-3 px-4 text-right font-semibold whitespace-nowrap">{formatInr(Number(inv.total), { fixed: 2 })}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex gap-1.5">
                        <StatusBadge tone={STATUS[inv.status].tone}>{STATUS[inv.status].label}</StatusBadge>
                        {late && <StatusBadge tone="danger">Overdue</StatusBadge>}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <a href={`/api/v1/ops/invoices/${inv.id}/document`} className="text-primary hover:underline">Download PDF</a>
                      {inv.payments.filter((p) => p.receiptNumber && !p.voidedAt).map((p, i, list) => (
                        <a key={p.id} href={`/api/v1/ops/invoices/${inv.id}/payments/${p.id}/receipt`} title={p.receiptNumber ?? undefined} className="ml-3 text-primary hover:underline">
                          Receipt{list.length > 1 ? ` ${i + 1}` : ''}
                        </a>
                      ))}
                      <button type="button" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : inv.id)} className="ml-3 text-muted-foreground hover:text-foreground hover:underline">
                        {expanded ? 'Hide' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-border/30 bg-secondary/10">
                      <td colSpan={showOrg ? 6 : 5} className="py-3 px-4 space-y-3">
                        <div className="text-muted-foreground space-y-1">
                          <p className="text-foreground">{inv.description}</p>
                          <p>
                            {isOpen(inv) && <>{formatInr(balanceOf(inv), { fixed: 2 })} still due by {format(new Date(inv.dueAt), 'MMM d, yyyy')} &middot; </>}
                            {inv.collectionMethod === 'COMPLIMENTARY' ? 'Complimentary' : inv.accessMode === 'ACCESS_NOW' ? 'Access given before payment' : inv.accessGrantedAt ? 'Access given on payment' : 'Access waits for payment'}
                          </p>
                          {inv.closedReason && <p>Reason: {inv.closedReason}</p>}
                        </div>

                        {inv.payments.length > 0 && (
                          <ul className="space-y-1">
                            {inv.payments.map((p) => (
                              <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 ${p.voidedAt ? 'text-muted-foreground line-through' : ''}`}>
                                <span>
                                  {formatInr(Number(p.amount), { fixed: 2 })}
                                  {Number(p.tdsAmount) > 0 && ` + ${formatInr(Number(p.tdsAmount), { fixed: 2 })} TDS`}
                                  {' '}&middot; {SOURCE[p.source] ?? p.source} &middot; {p.reference ?? p.razorpayPaymentId}
                                  {p.razorpayPaymentId ? '' : ' (recorded manually)'}
                                  {p.receivedAt && <> &middot; {format(new Date(p.receivedAt), 'MMM d, yyyy')}</>}
                                </span>
                                <span className="flex items-center gap-2">
                                  {p.receiptNumber && <a href={`/api/v1/ops/invoices/${inv.id}/payments/${p.id}/receipt`} className="text-primary hover:underline">{p.receiptNumber}</a>}
                                  {p.proof && <a href={`/api/v1/ops/invoices/${inv.id}/payments/${p.id}`} className="text-primary hover:underline">Proof</a>}
                                  {!p.voidedAt && !p.razorpayPaymentId && isSuperAdmin && (
                                    <button type="button" onClick={() => open({ kind: 'void_payment', invoice: inv, payment: p })} className="text-destructive hover:underline">Void</button>
                                  )}
                                </span>
                                {p.voidedAt && <span className="w-full">Voided: {p.voidReason}</span>}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isOpen(inv) && (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className={buttonClass} onClick={() => open({ kind: 'record', invoice: inv })}>Record payment</button>
                            <button type="button" className={buttonClass} onClick={() => open({ kind: 'reason', invoice: inv, action: 'extend_due' })}>Change due date</button>
                            {inv.razorpayLinkUrl
                              ? <a className={buttonClass} href={inv.razorpayLinkUrl} target="_blank" rel="noreferrer">Pay link{inv.razorpayLinkStatus && inv.razorpayLinkStatus !== 'created' ? ` (${inv.razorpayLinkStatus})` : ''}</a>
                              : inv.collectionMethod === 'PAY_ONLINE' && <button type="button" className={buttonClass} disabled={act.isPending} onClick={() => run({ action: 'create_link' }, inv, 'Payment link created.')}>Create pay link</button>}
                            <button type="button" className={buttonClass} disabled={act.isPending} onClick={() => run({ action: 'resend' }, inv, 'Invoice email queued.')}>Resend email</button>
                            {isSuperAdmin && (
                              <>
                                <button type="button" className={buttonClass} onClick={() => open({ kind: 'reason', invoice: inv, action: 'write_off' })}>Write off</button>
                                <button type="button" className={buttonClass} onClick={() => open({ kind: 'reason', invoice: inv, action: 'void' })}>Void</button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalItems={total} pageSize={pageSize} itemLabel="invoices" onPageChange={setPage} />

      {dialog?.kind === 'record' && (
        <RecordPaymentModal
          invoice={dialog.invoice}
          onClose={() => setDialog(null)}
          onSubmit={(body) => submitPayment(dialog.invoice, body)}
          isSubmitting={record.isPending}
        />
      )}

      {dialog?.kind === 'reason' && (
        <InvoiceModal
          title={dialog.action === 'void' ? `Void ${dialog.invoice.invoiceNumber}` : dialog.action === 'write_off' ? `Write off ${dialog.invoice.invoiceNumber}` : `Change due date: ${dialog.invoice.invoiceNumber}`}
          onClose={() => setDialog(null)}
          submitLabel={dialog.action === 'void' ? 'Void invoice' : dialog.action === 'write_off' ? 'Write off' : 'Save'}
          isSubmitting={act.isPending}
          disabled={!reason.trim() || (dialog.action === 'extend_due' && !newDue)}
          onSubmit={() =>
            run(
              dialog.action === 'extend_due'
                ? { action: 'extend_due', reason, dueAt: new Date(`${newDue}T12:00:00`).toISOString() }
                : { action: dialog.action, reason },
              dialog.invoice,
              'Invoice updated.',
            )
          }
        >
          {dialog.action === 'extend_due' && (
            <Field label="New due date" htmlFor="inv-new-due">
              <input id="inv-new-due" type="date" required value={newDue} onChange={(e) => setNewDue(e.target.value)} className={fieldClass} />
            </Field>
          )}
          <Field label="Reason (required)" htmlFor="inv-reason">
            <input id="inv-reason" type="text" required value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
          </Field>
        </InvoiceModal>
      )}

      {dialog?.kind === 'void_payment' && (
        <InvoiceModal
          title="Void this payment"
          onClose={() => setDialog(null)}
          submitLabel="Void payment"
          isSubmitting={voidPayment.isPending}
          disabled={!reason.trim()}
          onSubmit={async () => {
            try {
              await voidPayment.mutateAsync({ id: dialog.invoice.id, paymentId: dialog.payment.id, reason });
              toast('Payment voided', 'The invoice and the org\'s access have been recalculated.', 'success');
              setDialog(null);
            } catch (err) {
              toast('Could not void it', errorMessage(err), 'error');
            }
          }}
        >
          <p className="text-muted-foreground">For a bounced cheque or a wrong entry. It stays on the record, crossed out, and the invoice goes back to unpaid.</p>
          <Field label="Reason (required)" htmlFor="pay-void-reason">
            <input id="pay-void-reason" type="text" required value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
          </Field>
        </InvoiceModal>
      )}
    </div>
  );
}
