import assert from 'node:assert/strict';
import test from 'node:test';
import { computeInvoiceTotals, financialYear, settledStatus, splitPayment } from './invoice-math';
import { reminderDue } from '../../jobs/reminder-due';
import { computeAccessDates, lapseStatusAt } from '../subscriptions/access-dates';
import { availableCyclesForPlan, calculateProratedBase, calculateSubscriptionPricing, cycleTerm, isValidBillingCycle, periodMonthsForCycle, resolvePlanCyclePrice } from '../../../lib/pricing/subscriptionPricing';

test('GST splits by state, and rounding never loses a paisa', () => {
  const same = computeInvoiceTotals({ subtotal: 999.99, gstRate: 18, sellerState: 'Maharashtra', buyerState: ' maharashtra ' });
  assert.equal(same.igstAmount, 0);
  assert.equal(Math.round((same.cgstAmount + same.sgstAmount) * 100), 18000);
  assert.equal(same.total, 1179.99);
  const other = computeInvoiceTotals({ subtotal: 1000, gstRate: 18, sellerState: 'Maharashtra', buyerState: 'Goa' });
  assert.deepEqual([other.cgstAmount, other.igstAmount, other.total], [0, 180, 1180]);
  const unknown = computeInvoiceTotals({ subtotal: 1000, gstRate: 18, sellerState: 'Maharashtra', buyerState: null });
  assert.equal(unknown.igstAmount, 180);
});

test('TDS settles an invoice along with cash', () => {
  assert.equal(settledStatus(118000, 0, 0), 'ISSUED');
  assert.equal(settledStatus(118000, 59000, 0), 'PARTIALLY_PAID');
  assert.equal(settledStatus(118000, 108000, 10000), 'PAID');
  assert.equal(settledStatus(118000, 108000, 9999.99), 'PARTIALLY_PAID');
});

test('financial year turns over on 1 April IST', () => {
  assert.equal(financialYear(new Date('2026-03-31T18:29:00Z')), '25-26'); // 23:59 IST on 31 March
  assert.equal(financialYear(new Date('2026-03-31T18:30:00Z')), '26-27'); // 00:00 IST on 1 April
});

test('money received splits into base and GST', () => {
  assert.deepEqual(splitPayment(1180, { subtotal: 1000, total: 1180 }), { baseAmount: 1000, gstAmount: 180 });
});

test('6-month plans are priced, labelled and credited like the others', () => {
  const plan = { allowsMonthly: true, allowsHalfYearly: true, allowsAnnual: true, monthlyPrice: 2399, halfYearlyPrice: 12949, annualPrice: 23990 };
  assert.deepEqual(availableCyclesForPlan(plan), ['MONTHLY', 'HALF_YEARLY', 'ANNUAL']);
  assert.equal(resolvePlanCyclePrice(plan, 'HALF_YEARLY'), 12949);
  assert.equal(periodMonthsForCycle('HALF_YEARLY'), 6);
  assert.equal(isValidBillingCycle('HALF_YEARLY'), true);
  assert.equal(cycleTerm('HALF_YEARLY'), '6 months');
  assert.throws(() => resolvePlanCyclePrice({ ...plan, allowsHalfYearly: false }, 'HALF_YEARLY'));
  // Halfway through a paid 6-month period, about half of what was paid is credited.
  const period = { currentPeriodStart: '2026-01-01T00:00:00Z', currentPeriodEnd: '2026-07-01T00:00:00Z', billingCycle: 'HALF_YEARLY' as const };
  const credit = calculateProratedBase(23990, { ...period, lastPaidBaseAmount: 12949 }, new Date('2026-04-01T00:00:00Z'));
  assert.ok(Math.abs(credit.creditApplied - 12949 * (91 / 181)) < 1);
  // Nothing paid (Free, complimentary, set up by ops): nothing credited.
  assert.equal(calculateProratedBase(12949, { ...period, lastPaidBaseAmount: null }, new Date('2026-04-01T00:00:00Z')).creditApplied, 0);
});

test('checkout charges 18% GST on the price and no gateway fee', () => {
  assert.deepEqual(calculateSubscriptionPricing(699), { baseAmount: 699, gatewayFeeAmount: 0, gstAmount: 125.82, totalAmount: 824.82 });
});

test('a cancelled plan runs to its end date, then goes straight to Free', () => {
  const end = new Date('2026-12-01T00:00:00Z');
  const sub = { kind: 'STANDARD', currentPeriodEnd: end, graceDays: 7, cancelled: true };
  assert.equal(lapseStatusAt(sub, new Date('2026-11-30T00:00:00Z')), 'ACTIVE');
  assert.equal(lapseStatusAt(sub, new Date('2026-12-01T00:00:00Z')), 'EXPIRED');
});

test('reminders fire once per stage, and a late start only sends the latest', () => {
  const stages = [7, 1, -1, -5];
  assert.equal(reminderDue(stages, 10, null), null);
  assert.equal(reminderDue(stages, 7, null), 7);
  assert.equal(reminderDue(stages, 6, 7), null);
  assert.equal(reminderDue(stages, 1, 7), 1);
  assert.equal(reminderDue(stages, -3, null), -1);
  assert.equal(reminderDue(stages, -9, 1), -5);
  assert.equal(reminderDue(stages, -9, -5), null);
});

test('an overdue invoice restricts the org even with paid time left', () => {
  const periodEnd = new Date('2027-11-01T00:00:00Z');
  const dueAt = new Date('2026-11-15T00:00:00Z');
  const sub = { kind: 'CUSTOM', currentPeriodEnd: periodEnd, graceDays: 15, overdueInvoiceDueAt: dueAt };
  assert.equal(computeAccessDates(sub).restrictAt?.toISOString().slice(0, 10), '2026-11-30');
  assert.equal(lapseStatusAt(sub, new Date('2026-11-10T00:00:00Z')), 'ACTIVE');
  assert.equal(lapseStatusAt(sub, new Date('2026-11-20T00:00:00Z')), 'PAST_DUE');
  assert.equal(lapseStatusAt(sub, new Date('2026-12-01T00:00:00Z')), 'RESTRICTED');
  assert.equal(lapseStatusAt({ ...sub, overdueInvoiceDueAt: null }, new Date('2026-12-01T00:00:00Z')), 'ACTIVE');
});
