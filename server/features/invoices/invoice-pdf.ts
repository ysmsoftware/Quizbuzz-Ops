import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { Invoice, OpsPayment } from '@prisma/client';
import { PDFDocument, PDFFont, PDFName, PDFString, rgb } from 'pdf-lib';
import { round2 } from './invoice-math';

/**
 * Two documents, and neither is ever replaced:
 *  - The invoice is the bill. It always shows the full amount due, even after it's paid.
 *  - A receipt is the proof of one payment. It shows what was paid and the payment history.
 * billing-documents.ts saves each one once, so everyone downloads the same file.
 */

const fileSafe = (v: string) => v.replace(/[^\w-]/g, '-');
export const invoiceFileName = (inv: Pick<Invoice, 'invoiceNumber'>) => `Invoice-${fileSafe(inv.invoiceNumber)}.pdf`;
export const receiptFileName = (receiptNumber: string) => `Receipt-${fileSafe(receiptNumber)}.pdf`;

const inr = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' });
const shortDate = (d: Date, withYear: boolean) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Asia/Kolkata' });

type SummaryRow = { label: string; amount: number; bold?: boolean };

const SOURCE_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  UPI_DIRECT: 'UPI',
  OTHER: 'Other',
  RAZORPAY_LINK: 'Razorpay',
  RAZORPAY_ORDER: 'Razorpay',
  RAZORPAY_SUBSCRIPTION: 'Razorpay auto-debit',
};

/** Subtotal down to Total. Throws if they don't add up: a wrong document must never go out. */
function chargeRows(inv: Invoice): SummaryRow[] {
  const subtotal = Number(inv.subtotal);
  const total = Number(inv.total);
  const cgst = Number(inv.cgstAmount);
  const sgst = Number(inv.sgstAmount);
  const igst = Number(inv.igstAmount);
  const rate = Number(inv.gstRate);
  if (round2(subtotal + cgst + sgst + igst) !== round2(total)) throw new Error(`Invoice ${inv.id}: subtotal and tax don't add up to the total`);
  return [
    { label: 'Subtotal', amount: subtotal },
    { label: 'Total excluding tax', amount: subtotal },
    ...(igst > 0 ? [{ label: `IGST - India (${rate}% on ${inr(subtotal)})`, amount: igst }] : []),
    ...(cgst > 0 ? [{ label: `CGST - India (${rate / 2}% on ${inr(subtotal)})`, amount: cgst }, { label: `SGST - India (${rate / 2}% on ${inr(subtotal)})`, amount: sgst }] : []),
    { label: 'Total', amount: total },
  ];
}

/** The invoice's totals. Amount due is the full bill, paid or not: payments belong on the receipt. */
export function invoiceSummary(inv: Invoice): { rows: SummaryRow[]; amountDue: number } {
  const closed = inv.status === 'VOID' || inv.status === 'WRITTEN_OFF';
  const amountDue = closed ? 0 : Number(inv.total);
  return { rows: [...chargeRows(inv), { label: 'Amount due', amount: amountDue, bold: true }], amountDue };
}

const isLive = (p: OpsPayment) => !p.voidedAt && p.status === 'PAID';
const paidOn = (p: OpsPayment) => p.receivedAt ?? p.paidAt ?? p.createdAt;

/** The receipt's totals, as they stood when this payment came in. */
export function receiptSummary(inv: Invoice, payment: OpsPayment, payments: OpsPayment[]) {
  // A voided payment's receipt stays readable, and shows only its own line.
  const history = payment.voidedAt
    ? [payment]
    : payments.filter((p) => isLive(p) && paidOn(p).getTime() <= paidOn(payment).getTime()).sort((a, b) => paidOn(a).getTime() - paidOn(b).getTime());
  const cash = round2(history.reduce((sum, p) => sum + Number(p.amount), 0));
  const tds = round2(history.reduce((sum, p) => sum + Number(p.tdsAmount ?? 0), 0));
  const total = Number(inv.total);
  if (round2(cash + tds) > round2(total)) throw new Error(`Payment ${payment.id}: more was paid than the invoice total`);
  const balance = payment.voidedAt ? 0 : round2(total - cash - tds);
  const rows: SummaryRow[] = [
    ...chargeRows(inv),
    ...(tds > 0 ? [{ label: 'TDS deducted', amount: tds }] : []),
    { label: 'Amount paid', amount: cash, bold: true },
    // Only when something is genuinely left to pay. A paid receipt has no zero line.
    ...(balance > 0 ? [{ label: 'Balance due', amount: balance, bold: true }] : []),
  ];
  return { rows, history };
}

const A4 = { w: 595.28, h: 841.89 };
const LEFT = 30;
const RIGHT = A4.w - 30;
const INK = rgb(0.09, 0.09, 0.09);
const LINE = rgb(0.85, 0.85, 0.85);
const LINK = rgb(0.31, 0.27, 0.9);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

interface DocSpec {
  title: string;
  meta: Array<[string, string]>;
  headline: string;
  payUrl?: string | null;
  rows: SummaryRow[];
  history?: OpsPayment[];
  notes: string[];
  bankLines?: string[];
  footer: string;
}

/** The layout both documents share. */
async function drawDocument(inv: Invoice, spec: DocSpec): Promise<Uint8Array> {
  const s = inv.seller as Record<string, string | null>;
  const b = inv.buyer as Record<string, string | null>;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontDir = path.join(process.cwd(), 'public', 'fonts');
  // Whole fonts and calt off: pdf-lib's subsetting drops letters, and Inter's contextual glyphs print with gaps around hyphens.
  const features = { calt: false };
  const regular = await pdf.embedFont(fs.readFileSync(path.join(fontDir, 'Inter-Regular.ttf')), { features });
  const bold = await pdf.embedFont(fs.readFileSync(path.join(fontDir, 'Inter-SemiBold.ttf')), { features });
  pdf.setTitle(`${spec.title} ${spec.meta[0][1]}`);

  const page = pdf.addPage([A4.w, A4.h]);
  const text = (t: string, x: number, y: number, size = 9, font: PDFFont = regular) => page.drawText(t, { x, y, size, font, color: INK });
  const rightText = (t: string, xRight: number, y: number, size = 9, font: PDFFont = regular) => text(t, xRight - font.widthOfTextAtSize(t, size), y, size, font);
  const rule = (y: number, x1 = LEFT, x2 = RIGHT, color = LINE) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color });

  let y = A4.h - 50;
  text(spec.title, LEFT, y, 18, bold);
  // The company that bills, as on the Anthropic invoice. QuizBuzz is the product, named in the item line.
  rightText(s.legalName ?? '', RIGHT, y, 12, bold);
  y -= 28;

  spec.meta.forEach(([label, value], i) => {
    text(label, LEFT, y, 9, bold);
    text(value, LEFT + 80, y, 9, i === 0 ? bold : regular);
    y -= 13;
  });
  y -= 12;

  const columnTop = y;
  const seller = [...(s.address ?? '').split('\n'), s.state, 'India', s.email].filter(Boolean) as string[];
  const buyer = [b.name, ...(b.address ?? '').split('\n'), b.state, 'India', b.gstin ? `GSTIN: ${b.gstin}` : null, b.email].filter(Boolean) as string[];
  text(s.legalName ?? '', LEFT, y, 9, bold);
  text('Bill to', 247, columnTop, 9, bold);
  let left = columnTop - 14;
  for (const line of seller.flatMap((l) => wrap(l, regular, 9, 200))) { text(line, LEFT, left); left -= 13; }
  let right = columnTop - 14;
  for (const line of buyer.flatMap((l) => wrap(l, regular, 9, 200))) { text(line, 247, right); right -= 13; }
  y = Math.min(left, right) - 16;

  text(spec.headline, LEFT, y, 13, bold);
  y -= 18;

  if (spec.payUrl) {
    const label = 'Pay online';
    const width = bold.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: LEFT, y, size: 9, font: bold, color: LINK });
    page.drawLine({ start: { x: LEFT, y: y - 1.5 }, end: { x: LEFT + width, y: y - 1.5 }, thickness: 0.5, color: LINK });
    const annot = pdf.context.register(pdf.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [LEFT, y - 2, LEFT + width, y + 10], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(spec.payUrl) },
    }));
    page.node.set(PDFName.of('Annots'), pdf.context.obj([annot]));
    y -= 18;
  }
  y -= 14;

  // Item table
  const col = { qty: 390, unit: 455, tax: 495, amount: RIGHT };
  text('Description', LEFT, y, 8);
  rightText('Qty', col.qty, y, 8);
  rightText('Unit price', col.unit, y, 8);
  rightText('Tax', col.tax, y, 8);
  rightText('Amount', col.amount, y, 8);
  y -= 6;
  rule(y, LEFT, RIGHT, INK);
  y -= 13;

  const subtotal = Number(inv.subtotal);
  rightText('1', col.qty, y);
  rightText(inr(subtotal), col.unit, y);
  rightText(`${Number(inv.gstRate)}%`, col.tax, y);
  rightText(inr(subtotal), col.amount, y);
  for (const line of wrap(inv.description, regular, 9, 320)) { text(line, LEFT, y); y -= 13; }
  if (inv.periodStart && inv.periodEnd) {
    const sameYear = inv.periodStart.getFullYear() === inv.periodEnd.getFullYear();
    text(`${shortDate(inv.periodStart, !sameYear)}–${shortDate(inv.periodEnd, true)}`, LEFT, y);
    y -= 13;
  }
  y -= 10;

  // Totals
  const boxLeft = 300;
  for (const row of spec.rows) {
    rule(y + 10, boxLeft);
    const font = row.bold ? bold : regular;
    text(row.label, boxLeft, y, 9, font);
    rightText(inr(row.amount), RIGHT, y, 9, font);
    y -= 14;
  }
  y -= 14;

  if (spec.history?.length) {
    text('Payment history', LEFT, y, 13, bold);
    y -= 22;
    const c = { date: 235, amount: 420, number: RIGHT };
    text('Payment method', LEFT, y, 8);
    text('Date', c.date, y, 8);
    rightText('Amount paid', c.amount, y, 8);
    rightText('Receipt number', c.number, y, 8);
    y -= 6;
    rule(y, LEFT, RIGHT, INK);
    y -= 13;
    for (const p of spec.history) {
      const ref = p.reference ?? p.razorpayPaymentId;
      text(`${SOURCE_LABEL[p.source] ?? p.source}${ref ? ` - ${ref}` : ''}`.slice(0, 44), LEFT, y);
      text(longDate(paidOn(p)), c.date, y);
      rightText(inr(Number(p.amount)), c.amount, y);
      rightText(p.receiptNumber ?? '', c.number, y);
      y -= 14;
    }
    y -= 14;
  }

  for (const line of spec.notes) { text(line, LEFT, y); y -= 13; }

  if (spec.bankLines?.length) {
    y -= 10;
    text('Pay by bank transfer', LEFT, y, 9, bold);
    y -= 13;
    for (const line of spec.bankLines) { text(line, LEFT, y); y -= 13; }
  }

  rule(50);
  text(spec.footer, LEFT, 36, 8);
  rightText('Page 1 of 1', RIGHT, 36, 8);

  return pdf.save();
}

const gstMeta = (inv: Invoice): Array<[string, string]> => {
  const gstin = (inv.seller as Record<string, string | null>).gstin;
  return gstin ? [['GST Registration', gstin]] : [];
};

const sacNote = (inv: Invoice): string[] => {
  const sac = (inv.seller as Record<string, string | null>).sacCode;
  return sac ? [`SAC Code: ${sac}`] : [];
};

export async function renderInvoicePdf(inv: Invoice): Promise<Uint8Array> {
  const s = inv.seller as Record<string, string | null>;
  const number = inv.invoiceNumber;
  const { rows, amountDue } = invoiceSummary(inv);
  const dueLine = `${inr(amountDue)} due ${longDate(inv.dueAt)}`;
  const headline =
    inv.status === 'VOID' ? `Void: ${inv.closedReason ?? ''}`
    : inv.status === 'WRITTEN_OFF' ? `Written off: ${inv.closedReason ?? ''}`
    : Number(inv.total) === 0 ? 'No charge'
    : dueLine;

  return drawDocument(inv, {
    title: 'Invoice',
    // These two dates never change, however and whenever it gets paid.
    meta: [['Invoice number', number], ['Date of issue', longDate(inv.createdAt)], ['Date due', longDate(inv.dueAt)], ...gstMeta(inv)],
    headline,
    payUrl: inv.razorpayLinkStatus === 'created' || inv.razorpayLinkStatus === 'paid' ? inv.razorpayLinkUrl : null,
    rows,
    notes: [...sacNote(inv), ...(s.gstin ? ['Tax Invoice'] : [])],
    bankLines: inv.collectionMethod === 'OFFLINE' && s.accountNumber
      ? [
          `${s.accountName ?? ''}, ${s.bankName ?? ''}`,
          `Account ${s.accountNumber}, IFSC ${s.ifsc ?? ''}`,
          ...(s.upiId ? [`UPI: ${s.upiId}`] : []),
          `Please quote ${number} as the reference.`,
        ]
      : undefined,
    footer: `${number} · ${headline === dueLine ? dueLine : inr(Number(inv.total))}`,
  });
}

export async function renderReceiptPdf(inv: Invoice, payment: OpsPayment, payments: OpsPayment[]): Promise<Uint8Array> {
  const { rows, history } = receiptSummary(inv, payment, payments);
  const date = longDate(paidOn(payment));
  const paid = inr(Number(payment.amount));
  return drawDocument(inv, {
    title: 'Receipt',
    meta: [
      ['Invoice number', inv.invoiceNumber],
      ['Receipt number', payment.receiptNumber ?? ''],
      ['Date paid', date],
      ...gstMeta(inv),
    ],
    headline: payment.voidedAt ? `Void: ${payment.voidReason ?? ''}` : `${paid} paid on ${date}`,
    rows,
    history,
    notes: sacNote(inv),
    footer: `${payment.receiptNumber ?? ''} · ${paid} paid on ${date}`,
  });
}
