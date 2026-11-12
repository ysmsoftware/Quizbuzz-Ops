import { prisma } from '../../db/ops-prisma';
import { creditNoteDocument, invoiceDocument, receiptDocument } from './billing-documents';

/** The invoice and receipt for a payment, ready to attach to its email. Empty for an old payment with no receipt. */
export async function paymentAttachments(paymentId: string): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
  const payment = await prisma.opsPayment.findUnique({ where: { id: paymentId }, include: { invoice: { include: { payments: true } } } });
  if (!payment?.invoice || !payment.receiptNumber) return [];
  const docs = [await invoiceDocument(payment.invoice), await receiptDocument(payment.invoice, payment, payment.invoice.payments)];
  return docs.map((doc) => ({ filename: doc.fileName, content: Buffer.from(doc.data), contentType: 'application/pdf' }));
}

/** A credit note email carries the credit note. */
export async function creditNoteAttachments(creditNoteId: string): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
  const cn = await prisma.creditNote.findUnique({ where: { id: creditNoteId } });
  if (!cn) return [];
  const doc = await creditNoteDocument(cn);
  return [{ filename: doc.fileName, content: Buffer.from(doc.data), contentType: 'application/pdf' }];
}
