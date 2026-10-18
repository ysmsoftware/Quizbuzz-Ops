/**
 * The one place money, counts and avatar URLs are formatted.
 *
 * Unit rule (do not mix these up again):
 *  - `Payment.amount` and every Razorpay/Route amount in the main DB are PAISE.
 *  - `PaymentConfig.amount` (contest fee) and ops plan prices are RUPEES.
 * Convert with `paiseToRupees()` at the API edge, then pass rupees to the UI formatters.
 */

const NUMBER = new Intl.NumberFormat('en-IN');

export const paiseToRupees = (paise: number | string | bigint | null | undefined): number =>
  Number(paise ?? 0) / 100;

/** 12345678 → "1,23,45,678" (en-IN grouping). Null/undefined → "0". */
export const formatNumber = (n: number | null | undefined): string => NUMBER.format(n ?? 0);

/**
 * Rupees → "₹1,234" (or "₹1,234.50" with `fixed: 2`). Whole-rupee amounts drop the
 * decimals unless `fixed` is given, so ledgers can ask for exact paise precision.
 */
export function formatInr(n: number | null | undefined, opts: { fixed?: number } = {}): string {
  const value = n ?? 0;
  if (opts.fixed != null) {
    return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: opts.fixed, maximumFractionDigits: opts.fixed })}`;
  }
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Deterministic generated avatar used wherever an org has no uploaded logo. */
export const orgLogoFallback = (name: string): string =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0d9488`;
