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
