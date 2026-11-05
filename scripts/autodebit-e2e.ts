/**
 * End-to-end check of auto-debit against a running ops dev server (`npx next dev -p 3010`) with no Razorpay
 * keys: subscriptions get fake ids and Razorpay is played by webhooks signed with RAZORPAY_WEBHOOK_SECRET.
 * Local DBs only. It makes its own org and owner (@local.test) and removes everything it made at the end.
 *   npm run test:autodebit-e2e
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../server/db/ops-prisma';
import { queryMainDb } from '../server/db/main-db-pool';
import { env } from '../server/config/env';
import { signJwt } from '../server/utils/jwt';
import { runSubscriptionReconciliationJob } from '../server/jobs/subscription-reconciliation.job';

if (process.env.NODE_ENV === 'production') throw new Error('Local databases only.');
const BASE = process.env.OPS_E2E_URL ?? 'http://localhost:3010';
const ORG = '01SUBE2EORG000000000000002';
const OWNER = '01SUBE2EOWNER00000000000002';
const SECRET = env.BILLING_HANDOFF_SECRET ?? 'billing_handoff_secret_shared_key_998877';
const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
let n = 0;

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function webhook(event: string, payload: unknown, eventId = `evt_e2e_${++n}_${Date.now()}`) {
  const raw = JSON.stringify({ event, payload });
  const sig = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
  const res = await fetch(BASE + '/api/v1/billing-portal/razorpay/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': eventId }, body: raw,
  });
  assert.equal(res.status, 200, `${event} -> ${res.status} ${await res.text()}`);
  return eventId;
}
const handoff = (planSlug: string) => signJwt({ organizationId: ORG, adminId: OWNER, adminEmail: 'owner-ad@local.test', adminName: 'AD Owner', planSlug }, SECRET, 10);
const account = (action?: string) => post('/api/v1/billing-portal/account', { token: signJwt({ organizationId: ORG, adminEmail: 'owner-ad@local.test', purpose: 'billing_account' }, SECRET, 1), action });
const sub = () => prisma.organizationSubscription.findUniqueOrThrow({ where: { organizationId: ORG }, include: { plan: true } });
const step = (s: string) => console.log(`✔ ${s}`);

let madeSettings = false;

async function cleanup() {
  const invoiceIds = (await prisma.invoice.findMany({ where: { organizationId: ORG }, select: { id: true } })).map((i) => i.id);
  await prisma.billingDocument.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.opsMessageLog.deleteMany({ where: { organizationId: ORG } });
  await prisma.opsPayment.deleteMany({ where: { organizationId: ORG } });
  await prisma.invoice.deleteMany({ where: { organizationId: ORG } });
  await prisma.razorpaySubscription.deleteMany({ where: { organizationId: ORG } });
  await prisma.razorpayPlan.deleteMany({ where: { id: { startsWith: 'plan_test_' } } });
  await prisma.organizationSubscription.deleteMany({ where: { organizationId: ORG } });
  await prisma.featureFlagOrgOverride.deleteMany({ where: { id: 'ffo_e2e_autodebit' } });
  await prisma.$executeRaw`DELETE FROM platform_audit_logs WHERE metadata::text LIKE ${'%' + ORG + '%'} OR "targetId" = ${ORG}`;
  if (madeSettings) {
    await prisma.billingSequence.deleteMany({});
    await prisma.billingSettings.deleteMany({});
  }
  for (const sql of [
    `DELETE FROM audit_logs WHERE "organizationId" = $1`,
    `DELETE FROM org_members WHERE "organizationId" = $1`,
    `DELETE FROM organization_profiles WHERE "organizationId" = $1`,
    `DELETE FROM organizations WHERE id = $1`,
  ]) await queryMainDb(sql, [ORG]);
  await queryMainDb(`DELETE FROM admin_refresh_tokens WHERE "adminId" = $1`, [OWNER]);
  await queryMainDb(`DELETE FROM admins WHERE id = $1`, [OWNER]);
}

async function setup() {
  await cleanup();
  madeSettings = !(await prisma.billingSettings.findUnique({ where: { id: 'billing_default' } }));
  await queryMainDb(`INSERT INTO organizations (id,name,slug,"updatedAt") VALUES ($1,'AutoDebit College','autodebit-college',NOW()) ON CONFLICT DO NOTHING`, [ORG]);
  await queryMainDb(`INSERT INTO admins (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES ($1,'owner-ad@local.test','x','AD','Owner',NOW()) ON CONFLICT DO NOTHING`, [OWNER]);
  await queryMainDb(`INSERT INTO org_members (id,"organizationId","adminId",role,"acceptedAt","updatedAt") VALUES ('01SUBE2EMEM000000000000002',$1,$2,'OWNER',NOW(),NOW()) ON CONFLICT DO NOTHING`, [ORG, OWNER]);
  await prisma.billingSettings.upsert({
    where: { id: 'billing_default' },
    update: {},
    create: { legalName: 'YSM Info Solution', gstin: '27ABCDE1234F1Z5', address: 'Pune', state: 'Maharashtra', email: 'billing@local.test', sacCode: '998314', updatedAt: new Date() },
  });
  await prisma.featureFlagOrgOverride.create({
    data: { id: 'ffo_e2e_autodebit', flagKey: 'auto_debit', organizationId: ORG, isEnabled: true, reason: 'e2e', createdById: 'e2e', createdByName: 'e2e' },
  }).catch(() => {});
  const free = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { slug: 'free' } });
  const now = new Date();
  await prisma.organizationSubscription.upsert({
    where: { organizationId: ORG },
    update: {},
    create: { id: 'sub_e2e_ad', organizationId: ORG, planId: free.id, currentPeriodStart: now, currentPeriodEnd: addMonths(now, 1) },
  });
}

async function main() {
  await setup();

  // Off for orgs without the override: the flag is OPT_IN.
  const before = await account();
  assert.equal(before.body.data.autoDebit.available, false, 'Free plan: nothing to auto-renew yet');

  // 1. Free -> Basic monthly with auto-debit. No paid time, so it charges at authorisation.
  const start = await post('/api/v1/billing-portal/subscription/autodebit', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const subId: string = start.body.data.subscriptionId;
  assert.match(subId, /^sub_test_/);
  assert.equal(start.body.data.firstChargeAt, null);
  assert.equal(start.body.data.amount, 2830.82);
  const again = await post('/api/v1/billing-portal/subscription/autodebit', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  assert.equal(again.body.data.subscriptionId, subId, 'a second click reuses the unauthorised one');
  const yearly = await post('/api/v1/billing-portal/subscription/autodebit', { token: handoff('edu-basic'), billingCycle: 'ANNUAL' });
  assert.equal(yearly.status, 400, 'yearly stays prepaid');
  step('set up: ₹2,830.82 a month, reused on a double click, yearly refused');

  const t0 = new Date();
  await webhook('subscription.authenticated', { subscription: { entity: { id: subId, status: 'authenticated', payment_method: 'upi' } } });
  let s = await sub();
  assert.equal(s.collectionMethod, 'AUTO_DEBIT');
  assert.equal(s.razorpaySubscriptionId, subId);
  step('authenticated: org is on auto-debit');

  const p1End = addMonths(t0, 1);
  const chargedId = await webhook('subscription.charged', {
    subscription: { entity: { id: subId, status: 'active', current_start: secs(t0), current_end: secs(p1End), payment_method: 'upi' } },
    payment: { entity: { id: 'pay_e2e_ad_1', amount: 283082, method: 'upi' } },
  });
  s = await sub();
  assert.equal(s.plan.slug, 'edu-basic');
  assert.equal(s.status, 'ACTIVE');
  assert.equal(s.currentPeriodEnd.getTime(), addMonths(new Date(secs(t0) * 1000), 1).getTime());
  const pay1 = await prisma.opsPayment.findUniqueOrThrow({ where: { razorpayPaymentId: 'pay_e2e_ad_1' }, include: { invoice: true } });
  assert.equal(pay1.source, 'RAZORPAY_SUBSCRIPTION');
  assert.equal(pay1.status, 'PAID');
  assert.ok(pay1.invoice, 'tax invoice made');
  assert.equal(Number(pay1.invoice!.total), 2830.82);
  assert.match(pay1.receiptNumber ?? '', /^REC\//);
  step(`charged: Basic active till ${s.currentPeriodEnd.toISOString().slice(0, 10)}, ${pay1.invoice!.invoiceNumber} "${pay1.invoice!.description}", ${pay1.receiptNumber}`);

  // Repeats: the same event, and the same payment under a new event id.
  await webhook('subscription.charged', {}, chargedId);
  await webhook('subscription.charged', {
    subscription: { entity: { id: subId, status: 'active', current_start: secs(t0), current_end: secs(p1End) } },
    payment: { entity: { id: 'pay_e2e_ad_1', amount: 283082 } },
  });
  assert.equal(await prisma.opsPayment.count({ where: { organizationId: ORG, status: 'PAID' } }), 1);
  assert.equal(await prisma.invoice.count({ where: { organizationId: ORG } }), 1);
  step('repeated webhooks change nothing');

  const acct = await account();
  assert.equal(acct.body.data.autoDebit.on, true);
  assert.equal(acct.body.data.autoDebit.available, true);
  assert.equal(acct.body.data.autoDebit.method, 'upi');
  step(`owner Billing sees: on via ${acct.body.data.autoDebit.method}, next charge ${acct.body.data.autoDebit.nextChargeAt?.slice(0, 10)} ₹${acct.body.data.autoDebit.amount}`);

  // 2. Renewal fails: payment.failed (Razorpay's own order id, not ours), then pending, retried, then halted.
  await webhook('payment.failed', { payment: { entity: { id: 'pay_e2e_ad_f1', order_id: 'order_rzp_internal', subscription_id: subId, error_code: 'BAD_REQUEST_ERROR', error_reason: 'insufficient_funds', error_description: 'Payment failed due to insufficient balance' } } });
  await webhook('subscription.pending', { subscription: { entity: { id: subId, status: 'pending' } } });
  s = await sub();
  assert.equal(s.lastPaymentError, 'There wasn’t enough balance in the account.');
  const failMails = await prisma.opsMessageLog.findMany({ where: { organizationId: ORG, template: 'BILLING_PAYMENT_FAILED' } });
  assert.equal(failMails.length, 1, 'one email when charging starts failing');
  await webhook('subscription.pending', { subscription: { entity: { id: subId, status: 'pending' } } });
  assert.equal(await prisma.opsMessageLog.count({ where: { organizationId: ORG, template: 'BILLING_PAYMENT_FAILED' } }), 1, 'no email per retry');
  await webhook('subscription.halted', { subscription: { entity: { id: subId, status: 'halted' } } });
  assert.equal(await prisma.opsMessageLog.count({ where: { organizationId: ORG, template: 'BILLING_PAYMENT_FAILED' } }), 2, 'one more when retries stop');
  const failing = await account();
  assert.equal(failing.body.data.autoDebit.status, 'halted');
  step(`failure: reason "${s.lastPaymentError}", 2 emails (first failure, halted), Billing shows halted`);

  // 3. Customer fixes it: Razorpay charges the next cycle, which continues from the old end date.
  const p2End = addMonths(p1End, 1);
  await webhook('subscription.charged', {
    subscription: { entity: { id: subId, status: 'active', current_start: secs(p1End), current_end: secs(p2End) } },
    payment: { entity: { id: 'pay_e2e_ad_2', amount: 283082 } },
  });
  s = await sub();
  assert.equal(s.lastPaymentError, null);
  assert.equal(s.currentPeriodStart.getTime(), new Date(secs(p1End) * 1000).getTime(), 'no free days: continues from the old end');
  assert.equal(await prisma.invoice.count({ where: { organizationId: ORG } }), 2);
  step(`renewed: period ${s.currentPeriodStart.toISOString().slice(0, 10)} → ${s.currentPeriodEnd.toISOString().slice(0, 10)}, error cleared, 2nd invoice`);

  // 4. Webhook not delivered yet at the period end: the hourly job doesn't call it past due.
  await prisma.organizationSubscription.update({ where: { organizationId: ORG }, data: { currentPeriodEnd: new Date(Date.now() - 60 * 60_000) } });
  await runSubscriptionReconciliationJob();
  assert.equal((await sub()).status, 'ACTIVE', 'awaiting the charge webhook for a day');
  await prisma.organizationSubscription.update({ where: { organizationId: ORG }, data: { currentPeriodEnd: new Date(Date.now() - 26 * 60 * 60_000) } });
  await runSubscriptionReconciliationJob();
  assert.equal((await sub()).status, 'PAST_DUE', 'a day later it is past due');
  await prisma.organizationSubscription.update({ where: { organizationId: ORG }, data: { currentPeriodEnd: s.currentPeriodEnd, status: 'ACTIVE' } });
  step('job: no "past due" in the first day after the end, past due after');

  // 5. Change of payment method: same plan again starts when paid time ends, and replaces the old once authorised.
  const swap = await post('/api/v1/billing-portal/subscription/autodebit', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  const newId: string = swap.body.data.subscriptionId;
  assert.notEqual(newId, subId);
  assert.equal(swap.body.data.firstChargeAt, s.currentPeriodEnd.toISOString(), 'first charge when paid time ends');
  await webhook('subscription.authenticated', { subscription: { entity: { id: newId, status: 'authenticated', payment_method: 'card' } } });
  s = await sub();
  assert.equal(s.razorpaySubscriptionId, newId);
  assert.equal((await prisma.razorpaySubscription.findUniqueOrThrow({ where: { id: subId } })).status, 'cancelled');
  step(`method changed: ${newId} (card) live, old mandate cancelled, first charge ${swap.body.data.firstChargeAt.slice(0, 10)}`);

  // 6. Owner turns it off: the plan and paid time stay.
  const off = await account('stop_autodebit');
  assert.equal(off.status, 200);
  assert.equal(off.body.data.autoDebit.on, false);
  s = await sub();
  assert.equal(s.collectionMethod, 'PAY_ONLINE');
  assert.equal(s.plan.slug, 'edu-basic');
  assert.equal(s.status, 'ACTIVE');
  step('turned off: plan and dates kept, back to paying online');

  // 7. Mandate cancelled from the bank or UPI app: we follow.
  const third = await post('/api/v1/billing-portal/subscription/autodebit', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  await webhook('subscription.authenticated', { subscription: { entity: { id: third.body.data.subscriptionId, status: 'authenticated' } } });
  await webhook('subscription.cancelled', { subscription: { entity: { id: third.body.data.subscriptionId, status: 'cancelled' } } });
  s = await sub();
  assert.equal(s.collectionMethod, 'PAY_ONLINE');
  assert.equal(s.razorpaySubscriptionId, null);
  step('cancelled at the bank: org back to paying online');

  // 8. Cancelling the plan stops any mandate.
  const fourth = await post('/api/v1/billing-portal/subscription/autodebit', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  await webhook('subscription.authenticated', { subscription: { entity: { id: fourth.body.data.subscriptionId, status: 'authenticated' } } });
  await account('cancel');
  s = await sub();
  assert.equal(s.status, 'CANCELLED');
  assert.equal(s.razorpaySubscriptionId, null);
  assert.equal((await prisma.razorpaySubscription.findUniqueOrThrow({ where: { id: fourth.body.data.subscriptionId } })).status, 'cancelled');
  step('plan cancelled: mandate cancelled too');

  // 9. Other apps' and Razorpay's own payments on the account are acknowledged, not refused.
  await webhook('payment.captured', { payment: { entity: { id: 'pay_other', amount: 100 } } });
  await webhook('payment.failed', { payment: { entity: { id: 'pay_other2', order_id: 'order_unknown' } } });
  await webhook('subscription.charged', { subscription: { entity: { id: 'sub_not_ours', status: 'active' } }, payment: { entity: { id: 'pay_x', amount: 100 } } });
  step('unknown payments and subscriptions: 200, ignored');

  console.log('\nAll auto-debit checks passed.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    await cleanup().catch((e) => console.error('Cleanup failed:', e));
    await prisma.$disconnect();
    process.exit();
  });
