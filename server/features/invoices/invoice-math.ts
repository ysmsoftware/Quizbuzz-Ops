/** The sums on an invoice. No I/O, so it's all testable. Amounts are rupees, rounded to paise. */

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeInvoiceTotals(input: { subtotal: number; gstRate: number; sellerState: string; buyerState: string | null }) {
  const subtotal = round2(input.subtotal);
  const gst = round2((subtotal * input.gstRate) / 100);
  // Same state: CGST + SGST. Another state, or a state we don't know: IGST.
  const sameState = !!input.buyerState && input.sellerState.trim().toLowerCase() === input.buyerState.trim().toLowerCase();
  const cgstAmount = sameState ? round2(gst / 2) : 0;
  const sgstAmount = sameState ? round2(gst - cgstAmount) : 0;
  const igstAmount = sameState ? 0 : gst;
  return { subtotal, cgstAmount, sgstAmount, igstAmount, total: round2(subtotal + gst) };
}

/** Status after payments. TDS counts as paid: the customer paid it to the government on our behalf. */
export function settledStatus(total: number, amountPaid: number, tdsAmount: number): 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' {
  const covered = round2(amountPaid + tdsAmount);
  if (covered >= total) return 'PAID';
  return covered > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
}

/** Indian financial year, April to March in IST, short form: 26-27. GST caps an invoice number at 16 characters. */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Splits money received into ex-GST and GST, so revenue reports can stay ex-GST. */
export function splitPayment(received: number, invoice: { subtotal: number; total: number }) {
  const baseAmount = invoice.total > 0 ? round2((received * invoice.subtotal) / invoice.total) : 0;
  return { baseAmount, gstAmount: round2(received - baseAmount) };
}
