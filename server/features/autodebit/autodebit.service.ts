import { AuditTargetType, type BillingCycle, type RazorpaySubscription, type SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { razorpayAuth, razorpayCall } from '../../lib/razorpay';
import { generateUlid } from '../../utils/ulid';
import { writeAuditLogEntry, type AuditActor } from '../../audit/audit-writer';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';
import { ConflictError } from '../../http/errors';
import { calculateSubscriptionPricing, cycleTerm, periodMonthsForCycle, resolvePlanCyclePrice } from '@/lib/pricing/subscriptionPricing';
import SubscriptionsService, { syncOrgPlanLimitsCache } from '../subscriptions/subscriptions.service';
import SubscriptionsRepository from '../subscriptions/subscriptions.repository';
import { lapseStatusAt } from '../subscriptions/access-dates';
import { oldestUnpaidDueAt } from '../subscriptions/access-input';
import { finishSubscriptionPayment } from '../invoices/subscription-paid';
import { queryMainDb } from '../../db/main-db-pool';
import { ownerFailureReason } from './failure-reason';

/**
 * Auto-debit with Razorpay Subscriptions. Razorpay charges; our dates still decide access.
 * Every webhook re-reads the subscription from Razorpay, because events can arrive out of order,
 * and the hourly job does the same so a webhook Razorpay stopped sending can't leave us behind.
 */

export const RAZORPAY_ACTOR: AuditActor = { id: null, email: 'razorpay', name: 'Razorpay', role: 'razorpay-webhook' };

/** Can still charge. Anything else is over. */
const LIVE = ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'];
const AUTHORISED = ['authenticated', 'active'];
const FAILING = ['pending', 'halted'];

// Yearly stays prepaid (plan decision 7): above UPI AutoPay's usual limit, and one charge a year doesn't need a mandate.
// ponytail: total_count of 5 years; the owner sets it up again when Razorpay completes it.
const PERIODS: Partial<Record<BillingCycle, { period: 'monthly'; interval: number; count: number }>> = {
  MONTHLY: { period: 'monthly', interval: 1, count: 60 },
  HALF_YEARLY: { period: 'monthly', interval: 6, count: 10 },
};

export const autoDebitCycle = (cycle: string): cycle is 'MONTHLY' | 'HALF_YEARLY' => cycle in PERIODS;

export interface RzpSubscription {
  id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  start_at?: number | null;
  payment_method?: string | null;
  short_url?: string | null;
}
interface RzpInvoice { status: string; payment_id?: string | null; amount_paid?: number | null; billing_start?: number | null }

const fromSecs = (s?: number | null) => (s ? new Date(s * 1000) : null);
const subscriptionsService = new SubscriptionsService();
const subscriptionsRepo = new SubscriptionsRepository();

function noKeysAllowed(): boolean {
  if (razorpayAuth()) return false;
  if (process.env.NODE_ENV === 'production') throw new ConflictError('Automatic payments are not available right now.');
  return true; // dev machine: fake ids, driven by signed test webhooks
}

async function razorpayPlanId(plan: SubscriptionPlan, cycle: BillingCycle, amountPaise: number): Promise<string> {
  const key = { planId: plan.id, billingCycle: cycle, amountPaise };
  const found = await prisma.razorpayPlan.findUnique({ where: { planId_billingCycle_amountPaise: key } });
  if (found) return found.id;
  const p = PERIODS[cycle]!;
  const id = noKeysAllowed()
    ? `plan_test_${generateUlid()}`
    : (await razorpayCall<{ id: string }>('plans', 'POST', {
        period: p.period,
        interval: p.interval,
        item: { name: `QuizBuzz ${plan.name}`, amount: amountPaise, currency: 'INR', description: `${cycleTerm(cycle)}, including GST` },
        notes: { planId: plan.id, billingCycle: cycle },
      })).id;
  await prisma.razorpayPlan.create({ data: { id, ...key } });
  return id;
}

const planPricing = (plan: SubscriptionPlan) => ({
  allowsMonthly: plan.allowsMonthly,
  allowsHalfYearly: plan.allowsHalfYearly,
  allowsAnnual: plan.allowsAnnual,
  monthlyPrice: plan.monthlyPrice != null ? Number(plan.monthlyPrice) : null,
  halfYearlyPrice: plan.halfYearlyPrice != null ? Number(plan.halfYearlyPrice) : null,
  annualPrice: plan.annualPrice != null ? Number(plan.annualPrice) : null,
});

/** Sets up a mandate. With paid time left, the first charge is when it ends, so nobody pays twice for the same days. */
export async function startAutoDebit(input: { organizationId: string; plan: SubscriptionPlan; cycle: BillingCycle; adminEmail?: string | null }) {
  const { organizationId, plan, cycle } = input;
  const p = PERIODS[cycle];
  if (!p || !autoDebitCycle(cycle)) throw new ConflictError('Automatic payment is available for monthly and 6-month billing.');

  const base = resolvePlanCyclePrice(planPricing(plan), cycle);
  const pricing = calculateSubscriptionPricing(base);
  const amountPaise = Math.round(pricing.totalAmount * 100);

  // An org already on auto-debit can do this again: that's how the payment method changes. The new one replaces the old once authorised.
  const current = await prisma.organizationSubscription.findUnique({ where: { organizationId }, include: { plan: true } });
  const now = Date.now();
  const startAt = current && current.plan.kind !== 'FREE' && current.currentPeriodEnd.getTime() > now + 15 * 60_000 ? current.currentPeriodEnd : null;

  // A double click or a reload reuses the one not yet authorised.
  const pending = await prisma.razorpaySubscription.findFirst({
    where: { organizationId, planId: plan.id, billingCycle: cycle, status: 'created', amount: pricing.totalAmount, startAt, createdAt: { gt: new Date(now - 60 * 60_000) } },
    orderBy: { createdAt: 'desc' },
  });
  if (pending) return pending;

  const planIdAtRazorpay = await razorpayPlanId(plan, cycle, amountPaise);
  const created: RzpSubscription = noKeysAllowed()
    ? { id: `sub_test_${generateUlid()}`, status: 'created', short_url: null }
    : await razorpayCall<RzpSubscription>('subscriptions', 'POST', {
        plan_id: planIdAtRazorpay,
        total_count: p.count,
        quantity: 1,
        customer_notify: 1,
        ...(startAt ? { start_at: Math.floor(startAt.getTime() / 1000) } : {}),
        notes: { organizationId, planId: plan.id, billingCycle: cycle },
      });

  const row = await prisma.razorpaySubscription.create({
    data: {
      id: created.id,
      organizationId,
      planId: plan.id,
      billingCycle: cycle,
      razorpayPlanId: planIdAtRazorpay,
      baseAmount: pricing.baseAmount,
      amount: pricing.totalAmount,
      status: created.status,
      shortUrl: created.short_url ?? null,
      startAt,
      createdByEmail: input.adminEmail ?? null,
    },
  });
  await writeAuditLogEntry(
    { id: null, email: input.adminEmail || 'owner', name: 'Organization owner', role: 'ORG_ADMIN via billing-portal' },
    'billing_portal.autodebit_started', AuditTargetType.SUBSCRIPTION, row.id, `Auto-debit set up - ${plan.name}`,
    { organizationId, planId: plan.id, billingCycle: cycle, amount: pricing.totalAmount, startAt: startAt?.toISOString() ?? null },
  );
  return row;
}

async function cancelAtRazorpay(id: string): Promise<void> {
  if (razorpayAuth()) {
    // Cancelled now, not at cycle end: access follows our dates anyway, and this way it can never charge again.
    await razorpayCall(`subscriptions/${id}/cancel`, 'POST', { cancel_at_cycle_end: 0 }).catch((err) => {
      console.error(`[autodebit] Razorpay cancel of ${id} failed:`, err);
    });
  }
  await prisma.razorpaySubscription.update({ where: { id }, data: { status: 'cancelled' } });
}

async function fetchState(id: string): Promise<RzpSubscription | null> {
  return razorpayAuth() ? razorpayCall<RzpSubscription>(`subscriptions/${id}`, 'GET') : null;
}

/** Mirror Razorpay's status, take over from older mandates once authorised, and tell the owner when charging starts failing. */
export async function applyState(row: RazorpaySubscription, state: RzpSubscription): Promise<RazorpaySubscription> {
  const updated = await prisma.razorpaySubscription.update({
    where: { id: row.id },
    data: {
      status: state.status,
      currentStart: fromSecs(state.current_start) ?? row.currentStart,
      currentEnd: fromSecs(state.current_end) ?? row.currentEnd,
      paymentMethod: state.payment_method ?? row.paymentMethod,
      shortUrl: state.short_url ?? row.shortUrl,
    },
  });
  const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId: row.organizationId }, include: { plan: true } });
  if (!sub) return updated;
  const isCurrent = sub.razorpaySubscriptionId === row.id;

  if (AUTHORISED.includes(updated.status) && !isCurrent) {
    const older = await prisma.razorpaySubscription.findMany({ where: { organizationId: row.organizationId, id: { not: row.id }, status: { in: LIVE } } });
    for (const o of older) await cancelAtRazorpay(o.id);
    // Turning auto-renew on undoes an earlier "cancel my plan".
    const status = sub.status === 'CANCELLED'
      ? lapseStatusAt({ kind: sub.plan.kind, currentPeriodEnd: sub.currentPeriodEnd, graceDays: sub.graceDays, overdueInvoiceDueAt: await oldestUnpaidDueAt(sub.organizationId) })
      : sub.status;
    // A mandate for another plan that starts at the period end is a scheduled change.
    const other = row.planId !== sub.planId || row.billingCycle !== sub.billingCycle;
    await prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        razorpaySubscriptionId: row.id, collectionMethod: 'AUTO_DEBIT', status, cancelledAt: status === sub.status ? sub.cancelledAt : null,
        ...(other && row.startAt ? { scheduledPlanId: row.planId, scheduledBillingCycle: row.billingCycle, scheduledReason: 'Automatic renewal set up for this plan' } : {}),
      },
    });
    await syncOrgPlanLimitsCache(sub.organizationId).catch((err) => console.error(`[autodebit] cache sync for ${sub.organizationId}:`, err));
    await writeAuditLogEntry(RAZORPAY_ACTOR, 'subscription.autodebit_on', AuditTargetType.SUBSCRIPTION, sub.id, sub.plan.name, {
      organizationId: sub.organizationId, razorpaySubscriptionId: row.id, replaced: older.map((o) => o.id), paymentMethod: updated.paymentMethod,
    });
  }

  if (!LIVE.includes(updated.status) && isCurrent) {
    await prisma.organizationSubscription.update({ where: { id: sub.id }, data: { razorpaySubscriptionId: null, collectionMethod: 'PAY_ONLINE' } });
    await writeAuditLogEntry(RAZORPAY_ACTOR, 'subscription.autodebit_off', AuditTargetType.SUBSCRIPTION, sub.id, sub.plan.name, {
      organizationId: sub.organizationId, razorpaySubscriptionId: row.id, razorpayStatus: updated.status,
    });
    // Cancelled outside our app (the owner's UPI app or bank): the paid time stays, but say so now, not at the period end.
    // Turning it off from our Billing page clears the link first, so that path never reaches here.
    if (sub.plan.kind !== 'FREE' && sub.currentPeriodEnd.getTime() > Date.now()) {
      await orgOwnerNotifier.notify(sub.organizationId, 'BILLING_AUTOPAY_STOPPED', {
        planName: sub.plan.name,
        paidUntil: sub.currentPeriodEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      });
    }
  }

  // Once per failing spell: the first failed retry, then once more when Razorpay gives up.
  if (isCurrent && FAILING.includes(updated.status) && updated.status !== row.status) {
    const halted = updated.status === 'halted';
    await prisma.organizationSubscription.update({ where: { id: sub.id }, data: { lastPaymentErrorAt: sub.lastPaymentErrorAt ?? new Date() } });
    await orgOwnerNotifier.notify(sub.organizationId, 'BILLING_PAYMENT_FAILED', {
      planName: sub.plan.name,
      amount: Number(row.amount),
      reason: halted
        ? `Automatic retries have stopped. ${sub.lastPaymentError ?? ''} Please pay from your Billing page.`.replace(/\s+/g, ' ')
        : sub.lastPaymentError ?? 'The payment didn’t go through. We’ll try again over the next few days.',
    });
  }
  return updated;
}

/** One successful charge: a payment, the plan period it pays for, its invoice and receipt. Safe to repeat. */
export async function applyCharge(chargedRow: RazorpaySubscription, charge: { paymentId: string; amountPaise: number; periodStart: Date | null }) {
  let row = chargedRow;
  let payment = await prisma.opsPayment.findUnique({ where: { razorpayPaymentId: charge.paymentId } });
  if (payment?.subscriptionId) return;

  const amount = charge.amountPaise / 100;
  if (amount !== Number(row.amount)) {
    console.error(`[autodebit] Charge ${charge.paymentId} is ₹${amount}, expected ₹${Number(row.amount)}. Recorded, but no invoice is made.`);
  }
  if (!payment) {
    const now = new Date();
    try {
      payment = await prisma.opsPayment.create({
        data: {
          id: generateUlid(),
          organizationId: row.organizationId,
          purpose: 'subscription',
          planId: row.planId,
          billingCycle: row.billingCycle,
          periodMonths: periodMonthsForCycle(row.billingCycle),
          baseAmount: row.baseAmount,
          gatewayFeeAmount: 0,
          gstAmount: Math.round((amount - Number(row.baseAmount)) * 100) / 100,
          creditApplied: 0,
          amount,
          status: 'PAID',
          paidAt: now,
          receivedAt: now,
          razorpayPaymentId: charge.paymentId,
          source: 'RAZORPAY_SUBSCRIPTION',
          notes: `Razorpay subscription ${row.id}`,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      payment = await prisma.opsPayment.findUniqueOrThrow({ where: { razorpayPaymentId: charge.paymentId } });
      if (payment.subscriptionId) return;
    }
  }

  // A late repair of an older charge records the money without moving dates back.
  const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId: row.organizationId } });
  const start = charge.periodStart ?? new Date();

  // A change scheduled for this renewal (a downgrade, or ops moving the plan to a new version) rides on the
  // charge only if the mandate's amount is that plan's price. Otherwise the owner keeps the old price until
  // they approve a new mandate, and the job applies the change a day later.
  if (sub?.scheduledPlanId && sub.scheduledPlanId !== row.planId && sub.currentPeriodEnd <= new Date(start.getTime() + 60 * 60_000)) {
    const target = await prisma.subscriptionPlan.findUnique({ where: { id: sub.scheduledPlanId } });
    const cycle = sub.scheduledBillingCycle ?? row.billingCycle;
    let price: number | null = null;
    try {
      price = target && cycle === row.billingCycle && autoDebitCycle(cycle) ? calculateSubscriptionPricing(resolvePlanCyclePrice(planPricing(target), cycle)).totalAmount : null;
    } catch {
      price = null;
    }
    if (target && price === Number(row.amount)) {
      row = await prisma.razorpaySubscription.update({ where: { id: row.id }, data: { planId: target.id } });
      await prisma.opsPayment.update({ where: { id: payment.id }, data: { planId: target.id } });
      payment = { ...payment, planId: target.id };
    }
  }
  const end = new Date(start);
  end.setMonth(end.getMonth() + periodMonthsForCycle(row.billingCycle));
  if (sub && sub.planId === row.planId && sub.currentPeriodEnd >= end) {
    await subscriptionsRepo.linkPayment(payment.id, sub.id);
  } else {
    await subscriptionsService.assignPlan(row.organizationId, row.planId, RAZORPAY_ACTOR, row.billingCycle, start, payment.id);
  }
  await prisma.organizationSubscription.update({
    where: { organizationId: row.organizationId },
    data: { razorpaySubscriptionId: row.id, collectionMethod: 'AUTO_DEBIT', lastPaymentError: null, lastPaymentErrorAt: null },
  });
  await writeAuditLogEntry(RAZORPAY_ACTOR, 'billing_portal.payment_succeeded', AuditTargetType.PAYMENT, payment.id, `Auto-debit charge - ₹${amount}`, {
    organizationId: row.organizationId, razorpaySubscriptionId: row.id, razorpayPaymentId: charge.paymentId, planId: row.planId, billingCycle: row.billingCycle, amount,
  });
  await finishSubscriptionPayment(payment, row.billingCycle);
}

/** A failed automatic charge. Razorpay links it to the subscription through its invoice. */
export async function recordChargeFailure(entity: { id?: string; invoice_id?: string | null; subscription_id?: string | null; error_code?: string | null; error_reason?: string | null; error_description?: string | null }) {
  let subscriptionId = entity.subscription_id ?? null;
  if (!subscriptionId && entity.invoice_id && razorpayAuth()) {
    subscriptionId = (await razorpayCall<{ subscription_id?: string | null }>(`invoices/${entity.invoice_id}`, 'GET').catch(() => null))?.subscription_id ?? null;
  }
  const row = subscriptionId ? await prisma.razorpaySubscription.findUnique({ where: { id: subscriptionId } }) : null;
  if (!row) return false;
  const reason = ownerFailureReason(entity.error_code, entity.error_reason, entity.error_description);
  await prisma.organizationSubscription.updateMany({
    where: { organizationId: row.organizationId, razorpaySubscriptionId: row.id },
    data: { lastPaymentError: reason, lastPaymentErrorAt: new Date() },
  });
  await writeAuditLogEntry(RAZORPAY_ACTOR, 'billing_portal.payment_failed', AuditTargetType.SUBSCRIPTION, row.id, `Auto-debit charge failed`, {
    organizationId: row.organizationId, razorpayPaymentId: entity.id, errorCode: entity.error_code, errorReason: entity.error_reason, error: entity.error_description, shownToOwner: reason,
  });
  return true;
}

/** A Razorpay `subscription.*` event. The payload is only a fallback for when we can't ask Razorpay (a dev machine). */
export async function handleSubscriptionEvent(event: string, entity: RzpSubscription, payment?: { id?: string; amount?: number }) {
  const row = await prisma.razorpaySubscription.findUnique({ where: { id: entity.id } });
  if (!row) return false; // not ours, or another app on the same Razorpay account
  const state = (await fetchState(row.id)) ?? entity;
  const updated = await applyState(row, state);
  if (event === 'subscription.charged' && payment?.id && payment.amount) {
    await applyCharge(updated, { paymentId: payment.id, amountPaise: payment.amount, periodStart: fromSecs(state.current_start) });
  }
  return true;
}

/** Owner turns automatic renewal off, or pays once instead. The plan and its paid time stay. */
export async function stopAutoDebit(organizationId: string, actor: AuditActor, why: string): Promise<boolean> {
  const live = await prisma.razorpaySubscription.findMany({ where: { organizationId, status: { in: LIVE } } });
  for (const r of live) await cancelAtRazorpay(r.id);
  const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId } });
  if (sub?.collectionMethod === 'AUTO_DEBIT') {
    await prisma.organizationSubscription.update({ where: { id: sub.id }, data: { razorpaySubscriptionId: null, collectionMethod: 'PAY_ONLINE' } });
  }
  if (live.length) {
    await writeAuditLogEntry(actor, 'subscription.autodebit_off', AuditTargetType.SUBSCRIPTION, sub?.id ?? organizationId, 'Auto-debit stopped', {
      organizationId, cancelled: live.map((r) => r.id), why,
    });
  }
  return live.length > 0;
}

/** Asks Razorpay where one mandate stands and brings our rows in line, including any charge it already took. Safe to repeat. */
export async function reconcileRow(row: RazorpaySubscription, now = new Date()): Promise<'abandoned' | 'checked'> {
  const state = await razorpayCall<RzpSubscription>(`subscriptions/${row.id}`, 'GET');
  if (state.status === 'created' && row.createdAt.getTime() < now.getTime() - 24 * 60 * 60_000) {
    await cancelAtRazorpay(row.id);
    return 'abandoned';
  }
  const updated = await applyState(row, state);
  if (AUTHORISED.includes(state.status) || FAILING.includes(state.status)) {
    const { items } = await razorpayCall<{ items: RzpInvoice[] }>(`invoices?subscription_id=${row.id}&count=100`, 'GET');
    const paid = items.filter((i) => i.status === 'paid' && i.payment_id).sort((a, b) => (a.billing_start ?? 0) - (b.billing_start ?? 0));
    for (const inv of paid) {
      await applyCharge(updated, { paymentId: inv.payment_id!, amountPaise: inv.amount_paid ?? Math.round(Number(row.amount) * 100), periodStart: fromSecs(inv.billing_start) });
    }
  }
  return 'checked';
}

/** Hourly: catch up with anything a webhook missed, and drop mandates never authorised. */
export async function reconcileAutoDebits(now = new Date()): Promise<{ checked: number; abandoned: number; failures: number }> {
  if (!razorpayAuth()) return { checked: 0, abandoned: 0, failures: 0 };
  let rows = await prisma.razorpaySubscription.findMany({ where: { status: { in: LIVE } } });
  let checked = 0, abandoned = 0, failures = 0;
  // An org deleted anywhere, even outside ops, must never be charged again.
  const deleted = rows.length
    ? new Set((await queryMainDb<{ id: string }>(`SELECT id FROM organizations WHERE id = ANY($1) AND "isDeleted" = true`, [[...new Set(rows.map((r) => r.organizationId))]])).map((o) => o.id))
    : new Set<string>();
  for (const orgId of deleted) await stopAutoDebit(orgId, RAZORPAY_ACTOR, 'Organization is deleted');
  rows = rows.filter((r) => !deleted.has(r.organizationId));
  for (const row of rows) {
    try {
      if ((await reconcileRow(row, now)) === 'abandoned') abandoned++;
      else checked++;
    } catch (err) {
      failures++;
      console.error(`[autodebit] Reconcile of ${row.id} failed:`, err);
    }
  }
  return { checked, abandoned, failures };
}
