import type { BillingCycle, SubscriptionPlan } from '@prisma/client';
import { periodMonthsForCycle } from '@/lib/pricing/subscriptionPricing';

/** Whether a plan change starts now or waits for the period end. Pure, so it's tested on its own. */

type PricedPlan = Pick<SubscriptionPlan, 'id' | 'kind' | 'monthlyPrice' | 'halfYearlyPrice' | 'annualPrice'>;

/** What the plan costs per month, on its cheapest-to-compare cycle. */
export function monthlyRate(plan: PricedPlan): number {
  if (plan.monthlyPrice != null && Number(plan.monthlyPrice) > 0) return Number(plan.monthlyPrice);
  if (plan.halfYearlyPrice != null) return Number(plan.halfYearlyPrice) / 6;
  if (plan.annualPrice != null) return Number(plan.annualPrice) / 12;
  return 0;
}

export function changeTiming(
  current: { plan: PricedPlan; billingCycle: BillingCycle; status: string; currentPeriodEnd: Date },
  target: { plan: PricedPlan; cycle: BillingCycle },
  now = new Date(),
): 'now' | 'period_end' {
  const paidTimeLeft = current.plan.kind !== 'FREE' && ['ACTIVE', 'CANCELLED'].includes(current.status) && current.currentPeriodEnd > now;
  if (!paidTimeLeft) return 'now';
  if (monthlyRate(target.plan) < monthlyRate(current.plan)) return 'period_end';
  if (target.plan.id === current.plan.id && periodMonthsForCycle(target.cycle) < periodMonthsForCycle(current.billingCycle)) return 'period_end';
  return 'now';
}

