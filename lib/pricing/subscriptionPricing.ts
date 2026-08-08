/**
 * Shared pricing calculation for subscription checkout.
 * Imported by both the order-creation API route (to compute the real Razorpay
 * charge) and the checkout page (to render the breakdown) so the displayed
 * total and the charged total can never drift apart.
 */

export type BillingCycleChoice = 'MONTHLY' | 'ANNUAL';

const GATEWAY_FEE_RATE = 0.02;
const GST_ON_GATEWAY_FEE_RATE = 0.18;

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
 * gatewayFee = 2% of baseAmount
 * gst        = 18% of gatewayFee (not of baseAmount)
 * total      = baseAmount + gatewayFee + gst
 */
export function calculateSubscriptionPricing(baseAmount: number): PricingBreakdown {
  const gatewayFeeAmount = round2(baseAmount * GATEWAY_FEE_RATE);
  const gstAmount = round2(gatewayFeeAmount * GST_ON_GATEWAY_FEE_RATE);
  const totalAmount = round2(baseAmount + gatewayFeeAmount + gstAmount);

  return {
    baseAmount: round2(baseAmount),
    gatewayFeeAmount,
    gstAmount,
    totalAmount,
  };
}

export interface PlanCyclePricing {
  allowsMonthly: boolean;
  allowsAnnual: boolean;
  monthlyPrice: number | null;
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

  if (!plan.allowsAnnual || plan.annualPrice == null) {
    throw new Error('This plan does not offer annual billing.');
  }
  return plan.annualPrice;
}

export function periodMonthsForCycle(cycle: BillingCycleChoice): number {
  return cycle === 'ANNUAL' ? 12 : 1;
}

export function isValidBillingCycle(value: unknown): value is BillingCycleChoice {
  return value === 'MONTHLY' || value === 'ANNUAL';
}

export function availableCyclesForPlan(plan: PlanCyclePricing): BillingCycleChoice[] {
  const cycles: BillingCycleChoice[] = [];
  if (plan.allowsMonthly && plan.monthlyPrice != null) cycles.push('MONTHLY');
  if (plan.allowsAnnual && plan.annualPrice != null) cycles.push('ANNUAL');
  return cycles;
}

export interface CurrentSubscriptionForProration {
  currentPeriodStart: Date | string;
  currentPeriodEnd: Date | string;
  billingCycle: BillingCycleChoice;
  /** Most recent PAID OpsPayment.baseAmount for the current subscription, if one exists. */
  lastPaidBaseAmount: number | null;
  /** Fallback when no payment row is found (e.g. an ops-admin-assigned subscription). */
  planMonthlyPrice: number | null;
  planAnnualPrice: number | null;
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

  const currentPlanValue =
    current.lastPaidBaseAmount != null
      ? current.lastPaidBaseAmount
      : (current.billingCycle === 'ANNUAL' ? current.planAnnualPrice : current.planMonthlyPrice) ?? 0;

  const remainingFraction = Math.min(1, remainingMs / totalMs);
  const unusedCredit = round2(currentPlanValue * remainingFraction);
  const proratedBase = Math.max(0, round2(newPlanBaseAmount - unusedCredit));
  const creditApplied = round2(newPlanBaseAmount - proratedBase);

  return { proratedBase, creditApplied };
}
