/** Why an automatic charge failed, in our words. Razorpay's raw text stays in the audit log for ops. */
const REASONS: [RegExp, string][] = [
  [/insufficient|balance|fund/, 'There wasn’t enough balance in the account.'],
  [/expired?\b|expiry/, 'The card has expired.'],
  [/mandate|revok|cancel/, 'The automatic payment was cancelled from your bank or UPI app.'],
  [/\botp\b|authenticat|3ds|\bpin\b/, 'The payment wasn’t authorised.'],
  [/limit/, 'The amount is above the limit set on your card or UPI.'],
  [/declin|bank|issuer|blocked/, 'Your bank declined the payment.'],
];

export function ownerFailureReason(...parts: (string | null | undefined)[]): string {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  return REASONS.find(([pattern]) => pattern.test(text))?.[1] ?? 'The payment didn’t go through.';
}
