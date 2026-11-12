/** One-time AI credit packs (docs/pricing/01-tier-sheet.md), valid 12 months, on top of the plan's monthly allowance. */
export const AI_CREDIT_PACKS = [
  { credits: 500, price: 1499 },
  { credits: 2000, price: 4999 },
  { credits: 10000, price: 19999 },
] as const;
export const AI_TOP_UP_VALID_MONTHS = 12;

export const aiCreditPack = (credits: number) => AI_CREDIT_PACKS.find((p) => p.credits === credits) ?? null;
