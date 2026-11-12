/**
 * Shared pricing calculation for subscription checkout.
 * Imported by both the order-creation API route (to compute the real Razorpay
 * charge) and the checkout page (to render the breakdown) so the displayed
 * total and the charged total can never drift apart.
 */

export type BillingCycleChoice = 'MONTHLY' | 'HALF_YEARLY' | 'ANNUAL';

const CYCLE_LABELS: Record<string, { label: string; term: string }> = {
  MONTHLY: { label: 'Monthly', term: '1 month' },
  HALF_YEARLY: { label: 'Every 6 months', term: '6 months' },
  ANNUAL: { label: 'Yearly', term: '1 year' },
};

/** "Monthly", "Every 6 months", "Yearly": one wording for every screen and email. */
export const cycleLabel = (cycle: string) => CYCLE_LABELS[cycle]?.label ?? 'Contract';
/** "1 month", "6 months", "1 year", as printed after the plan name on an invoice. */
export const cycleTerm = (cycle: string) => CYCLE_LABELS[cycle]?.term ?? 'contract';

const GST_RATE = 0.18;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PricingBreakdown {
  baseAmount: number;
  gatewayFeeAmount: number;
  gstAmount: number;
  totalAmount: number;
}

/**
 * Plan prices are ex-GST: total = base + 18% GST. The gateway fee is ours to absorb, so it's 0
 * on new payments and only ever non-zero on old receipts.
 */
export function calculateSubscriptionPricing(baseAmount: number): PricingBreakdown {
  const gstAmount = round2(baseAmount * GST_RATE);
  return {
    baseAmount: round2(baseAmount),
    gatewayFeeAmount: 0,
    gstAmount,
    totalAmount: round2(baseAmount + gstAmount),
  };
}

export interface PlanCyclePricing {
  allowsMonthly: boolean;
  allowsHalfYearly?: boolean;
  allowsAnnual: boolean;
  monthlyPrice: number | null;
  halfYearlyPrice?: number | null;
  annualPrice: number | null;
}

/**
 * Every plan sets its own price per cycle it offers — an annual plan is not
 * assumed to be monthlyPrice x 12, since some plans are annual-only with a
 * fixed rate unrelated to any monthly figure.
 */
export function resolvePlanCyclePrice(plan: PlanCyclePricing, cycle: BillingCycleChoice): number {
  if (cycle === 'MONTHLY') {
    if (!plan.allowsMonthly || plan.monthlyPrice == null) {
      throw new Error('This plan does not offer monthly billing.');
    }
    return plan.monthlyPrice;
  }

  if (cycle === 'HALF_YEARLY') {
    if (!plan.allowsHalfYearly || plan.halfYearlyPrice == null) {
      throw new Error('This plan does not offer 6-month billing.');
    }
    return plan.halfYearlyPrice;
  }

  if (!plan.allowsAnnual || plan.annualPrice == null) {
    throw new Error('This plan does not offer annual billing.');
  }
  return plan.annualPrice;
}

export function periodMonthsForCycle(cycle: string): number {
  return cycle === 'ANNUAL' ? 12 : cycle === 'HALF_YEARLY' ? 6 : 1;
}

export function isValidBillingCycle(value: unknown): value is BillingCycleChoice {
  return value === 'MONTHLY' || value === 'HALF_YEARLY' || value === 'ANNUAL';
}

export function availableCyclesForPlan(plan: PlanCyclePricing): BillingCycleChoice[] {
  const cycles: BillingCycleChoice[] = [];
  if (plan.allowsMonthly && plan.monthlyPrice != null) cycles.push('MONTHLY');
  if (plan.allowsHalfYearly && plan.halfYearlyPrice != null) cycles.push('HALF_YEARLY');
  if (plan.allowsAnnual && plan.annualPrice != null) cycles.push('ANNUAL');
  return cycles;
}

export interface CurrentSubscriptionForProration {
  currentPeriodStart: Date | string;
  currentPeriodEnd: Date | string;
  billingCycle: BillingCycleChoice;
  /**
   * What was actually paid for the current period: the most recent PAID OpsPayment.baseAmount.
   * Null when nothing was paid (Free, complimentary, or set up by ops), and then there's nothing to credit.
   */
  lastPaidBaseAmount: number | null;
}

export interface ProrationResult {
  proratedBase: number;
  creditApplied: number;
}

/**
 * Credits unused time on the org's current subscription against the price of
 * a new purchase (upgrade, downgrade, or early renewal while still active).
 * Not used when there is no active, non-expired current subscription — the
 * caller should skip straight to calculateSubscriptionPricing(baseAmount) in
 * that case (creditApplied = 0).
 *
 * remainingCredit = currentPlanValue x (remainingMs / totalPeriodMs)
 * proratedBase    = max(0, newPlanBaseAmount - remainingCredit)
 */
export function calculateProratedBase(
  newPlanBaseAmount: number,
  current: CurrentSubscriptionForProration,
  now: Date = new Date()
): ProrationResult {
  const start = new Date(current.currentPeriodStart);
  const end = new Date(current.currentPeriodEnd);
  const totalMs = end.getTime() - start.getTime();
  const remainingMs = end.getTime() - now.getTime();

  if (totalMs <= 0 || remainingMs <= 0) {
    // Current period already elapsed or malformed — nothing left to credit.
    return { proratedBase: round2(newPlanBaseAmount), creditApplied: 0 };
  }

  // Only money actually paid is credited. Crediting the list price let a Free org knock a month off its first paid plan.
  const currentPlanValue = current.lastPaidBaseAmount ?? 0;

  const remainingFraction = Math.min(1, remainingMs / totalMs);
  const unusedCredit = round2(currentPlanValue * remainingFraction);
  const proratedBase = Math.max(0, round2(newPlanBaseAmount - unusedCredit));
  const creditApplied = round2(newPlanBaseAmount - proratedBase);

  return { proratedBase, creditApplied };
}
