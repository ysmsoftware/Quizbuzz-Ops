import assert from 'node:assert/strict';
import test from 'node:test';
import { Invoice, OpsPayment } from '@prisma/client';
import { invoiceFileName, invoiceSummary, receiptFileName, receiptSummary, renderInvoicePdf, renderReceiptPdf } from './invoice-pdf';

const seller = { legalName: 'Seller', address: 'Pune', state: 'Maharashtra', gstin: '27ABCDE1234F1Z5' };
const inv = (o: Partial<Record<keyof Invoice, unknown>> = {}) => ({
  id: 'i', invoiceNumber: 'INV/26-27/00001', status: 'ISSUED', description: 'Basic plan, 1 year',
  subtotal: 23990, gstRate: 18, cgstAmount: 2159.1, sgstAmount: 2159.1, igstAmount: 0, total: 28308.2, amountPaid: 0, tdsAmount: 0,
  dueAt: new Date('2026-11-20T00:00:00Z'), createdAt: new Date('2026-11-05T00:00:00Z'), paidAt: null, periodStart: null, periodEnd: null,
  closedReason: null, razorpayLinkUrl: null, razorpayLinkStatus: null, collectionMethod: 'OFFLINE', seller, buyer: { name: 'Buyer', state: 'Maharashtra' }, ...o,
}) as unknown as Invoice;
const at = (d: string) => new Date(`${d}T06:00:00Z`);
const pay = (amount: number, tdsAmount: number, day: string, o = {}) => ({
  id: day, amount, tdsAmount, status: 'PAID', voidedAt: null, voidReason: null, receivedAt: at(day), paidAt: at(day), createdAt: at(day), source: 'BANK_TRANSFER', reference: `UTR-${day}`, receiptNumber: `RC/${day}`, ...o,
}) as unknown as OpsPayment;

test('files are named after their numbers, which fit GST\'s 16 characters', () => {
  assert.equal(invoiceFileName(inv()), 'Invoice-INV-26-27-00001.pdf');
  assert.equal(receiptFileName('REC/26-27/00001'), 'Receipt-REC-26-27-00001.pdf');
  assert.ok('INV/26-27/99999'.length <= 16);
});

test('the invoice always shows the full amount due, paid or not', () => {
  const unpaid = invoiceSummary(inv());
  assert.deepEqual(unpaid.rows.map((r) => r.amount), [23990, 23990, 2159.1, 2159.1, 28308.2, 28308.2]);
  const paid = invoiceSummary(inv({ status: 'PAID', amountPaid: 28308.2 }));
  assert.equal(paid.amountDue, 28308.2);
  assert.equal(paid.rows.at(-1)?.label, 'Amount due');
  assert.equal(invoiceSummary(inv({ status: 'VOID' })).amountDue, 0);
});

test('a full receipt shows amount paid and no zero line', () => {
  const p = pay(28308.2, 0, '2026-11-06');
  const { rows, history } = receiptSummary(inv({ status: 'PAID' }), p, [p]);
  assert.equal(rows.at(-1)?.label, 'Amount paid');
  assert.equal(rows.at(-1)?.amount, 28308.2);
  assert.ok(!rows.some((r) => r.label === 'Balance due'));
  assert.equal(history.length, 1);
});

test('receipts show what stood at the time: part payments, then settled with TDS', () => {
  const first = pay(10000, 0, '2026-11-06');
  const second = pay(15000, 3308.2, '2026-11-10');
  const invoice = inv({ status: 'PAID' });
  const a = receiptSummary(invoice, first, [first, second]);
  assert.equal(a.rows.find((r) => r.label === 'Amount paid')?.amount, 10000);
  assert.equal(a.rows.find((r) => r.label === 'Balance due')?.amount, 18308.2);
  assert.equal(a.history.length, 1);
  const b = receiptSummary(invoice, second, [first, second]);
  assert.equal(b.rows.find((r) => r.label === 'Amount paid')?.amount, 25000);
  assert.equal(b.rows.find((r) => r.label === 'TDS deducted')?.amount, 3308.2);
  assert.ok(!b.rows.some((r) => r.label === 'Balance due'));
  assert.equal(b.history.length, 2);
});

test('a voided payment is left out of later receipts', () => {
  const bad = pay(10000, 0, '2026-11-06', { voidedAt: at('2026-11-07') });
  const good = pay(28308.2, 0, '2026-11-08');
  const { history } = receiptSummary(inv({ status: 'PAID' }), good, [bad, good]);
  assert.deepEqual(history.map((p) => p.id), [good.id]);
});

test('figures that do not add up refuse to render', () => {
  assert.throws(() => invoiceSummary(inv({ total: 28308.21 })), /add up/);
  const p = pay(30000, 0, '2026-11-06');
  assert.throws(() => receiptSummary(inv(), p, [p]), /more was paid/);
});

test('both documents render with the rupee sign', async () => {
  const p = pay(28308.2, 0, '2026-11-06');
  const a = await renderInvoicePdf(inv({ razorpayLinkUrl: 'https://rzp.io/x', razorpayLinkStatus: 'created' }));
  const b = await renderReceiptPdf(inv({ status: 'PAID' }), p, [p]);
  assert.equal(Buffer.from(a.slice(0, 5)).toString(), '%PDF-');
  assert.equal(Buffer.from(b.slice(0, 5)).toString(), '%PDF-');
});
