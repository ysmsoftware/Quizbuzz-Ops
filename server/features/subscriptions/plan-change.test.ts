import assert from 'node:assert/strict';
import test from 'node:test';
import { changeTiming, monthlyRate } from './plan-timing';
import { splitCredit } from '../invoices/invoice-math';

const plan = (id: string, monthly: number | null, half: number | null = null, annual: number | null = null, kind: 'FREE' | 'STANDARD' = 'STANDARD') =>
  ({ id, kind, monthlyPrice: monthly, halfYearlyPrice: half, annualPrice: annual }) as never;

const basic = plan('basic', 2399, 12949, 23990);
const pro = plan('pro', 5999, 32399, 59990);
const free = plan('free', 0, null, null, 'FREE');
const future = new Date(Date.now() + 10 * 86_400_000);
const past = new Date(Date.now() - 86_400_000);

test('monthly rate falls back to the longer cycles', () => {
  assert.equal(monthlyRate(basic), 2399);
  assert.equal(monthlyRate(plan('yearly-only', null, null, 12000)), 1000);
});

test('upgrades start now, downgrades and shorter cycles wait', () => {
  const onBasicMonthly = { plan: basic, billingCycle: 'MONTHLY' as const, status: 'ACTIVE', currentPeriodEnd: future };
  assert.equal(changeTiming(onBasicMonthly, { plan: pro, cycle: 'MONTHLY' }), 'now');
  assert.equal(changeTiming({ ...onBasicMonthly, plan: pro }, { plan: basic, cycle: 'MONTHLY' }), 'period_end');
  // Same plan, longer cycle: paid now (prorated). Shorter: waits.
  assert.equal(changeTiming(onBasicMonthly, { plan: basic, cycle: 'ANNUAL' }), 'now');
  assert.equal(changeTiming({ ...onBasicMonthly, billingCycle: 'ANNUAL' }, { plan: basic, cycle: 'MONTHLY' }), 'period_end');
});

test('no paid time left: everything is now', () => {
  assert.equal(changeTiming({ plan: pro, billingCycle: 'MONTHLY', status: 'PAST_DUE', currentPeriodEnd: past }, { plan: basic, cycle: 'MONTHLY' }), 'now');
  assert.equal(changeTiming({ plan: free, billingCycle: 'MONTHLY', status: 'ACTIVE', currentPeriodEnd: future }, { plan: basic, cycle: 'MONTHLY' }), 'now');
});

test('a credit note keeps the invoice GST split and adds up exactly', () => {
  const igst = { total: 2830.82, subtotal: 2399, cgstAmount: 0, sgstAmount: 0, igstAmount: 431.82 } as never;
  const full = splitCredit(igst, 2830.82);
  assert.deepEqual(full, { subtotal: 2399, cgstAmount: 0, sgstAmount: 0, igstAmount: 431.82, total: 2830.82 });
  const sameState = { total: 1.18, subtotal: 1, cgstAmount: 0.09, sgstAmount: 0.09, igstAmount: 0 } as never;
  const part = splitCredit(sameState, 0.59);
  assert.equal(Math.round((part.subtotal + part.cgstAmount + part.sgstAmount + part.igstAmount) * 100) / 100, 0.59);
  assert.throws(() => splitCredit({ total: 0, subtotal: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 } as never, 1));
});
