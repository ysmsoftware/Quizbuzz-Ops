import crypto from 'crypto';
import { Invoice, OpsPayment } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { invoiceFileName, receiptFileName, renderInvoicePdf, renderReceiptPdf } from './invoice-pdf';

/**
 * Every download comes through here, for ops, the organization and email alike, so there is only
 * ever one file per document number. It's built once and then served as saved.
 */

async function saved(number: string, kind: 'INVOICE' | 'RECEIPT', invoiceId: string, paymentId: string | null, fileName: string, build: () => Promise<Uint8Array>) {
  const existing = await prisma.billingDocument.findUnique({ where: { number } });
  if (existing) return existing;
  const data = Buffer.from(await build());
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  // Two people opening it at once: the first save wins and both get that file.
  return prisma.billingDocument.upsert({
    where: { number },
    update: {},
    create: { number, kind, invoiceId, paymentId, fileName, sha256, data },
  });
}

export const invoiceDocument = (invoice: Invoice) =>
  saved(invoice.invoiceNumber, 'INVOICE', invoice.id, null, invoiceFileName(invoice), () => renderInvoicePdf(invoice));

export async function receiptDocument(invoice: Invoice, payment: OpsPayment, payments: OpsPayment[]) {
  if (!payment.receiptNumber) throw new Error(`Payment ${payment.id} has no receipt number`);
  return saved(payment.receiptNumber, 'RECEIPT', invoice.id, payment.id, receiptFileName(payment.receiptNumber), () => renderReceiptPdf(invoice, payment, payments));
}

/** The document itself changed: void, a new due date, a new pay link. It's rebuilt on the next download. */
export async function forgetDocuments(invoiceId: string, kind: 'INVOICE' | 'RECEIPT'): Promise<void> {
  await prisma.billingDocument.deleteMany({ where: { invoiceId, kind } });
}

export function pdfResponse(doc: { data: Uint8Array; fileName: string; sha256: string }): Response {
  return new Response(Buffer.from(doc.data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${doc.fileName}"`,
      'Cache-Control': 'private, no-store',
      ETag: `"${doc.sha256}"`,
    },
  });
}
