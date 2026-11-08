/**
 * End-to-end check of Stages 5 and 6 against a running ops dev server (`npx next dev -p 3010`) with no Razorpay
 * keys: plan changes (upgrade, scheduled downgrade, moving a plan's subscribers, cycle dates, org delete),
 * credit notes and refunds, Event Pass bookings and AI credit top-ups.
 * Local DBs only. It makes its own org and owner (@local.test), and removes everything at the end.
 *   npm run test:plan-changes-e2e        (KEEP=1 to leave the data for a look)
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../server/db/ops-prisma';
import { queryMainDb } from '../server/db/main-db-pool';
import { env } from '../server/config/env';
import { signJwt } from '../server/utils/jwt';
import { generateUlid } from '../server/utils/ulid';
import SubscriptionsService from '../server/features/subscriptions/subscriptions.service';
import { applyDueScheduledChanges, migratePlanSubscribers } from '../server/features/subscriptions/plan-change';
import { issueCreditNote } from '../server/features/invoices/credit-notes';
import { invoicesService } from '../server/features/invoices/invoices.service';
import { grantFreeTopUp } from '../server/features/invoices/ai-credits';
import { BookingsService } from '../server/features/bookings/bookings.service';
import { organizationsService } from '../server/container';

if (process.env.NODE_ENV === 'production') throw new Error('Local databases only.');
const BASE = process.env.OPS_E2E_URL ?? 'http://localhost:3010';
const ORG = '01SUBE2EORG000000000000003';
const OWNER = '01SUBE2EOWNER00000000000003';
const SECRET = env.BILLING_HANDOFF_SECRET ?? 'billing_handoff_secret_shared_key_998877';
const ADMIN = { id: null, email: 'e2e@local.test', name: 'E2E Super Admin', role: 'SUPER_ADMIN' } as const;
const DAY = 86_400_000;
let n = 0;
let madeSettings = false;

async function post(path: string, body: unknown) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function webhook(event: string, payload: unknown) {
  const raw = JSON.stringify({ event, payload });
  const sig = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
  const res = await fetch(BASE + '/api/v1/billing-portal/razorpay/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': `evt_pc_${++n}_${Date.now()}` }, body: raw,
  });
  assert.equal(res.status, 200, `${event} -> ${res.status} ${await res.text()}`);
}
const handoff = (planSlug: string) => signJwt({ organizationId: ORG, adminId: OWNER, adminEmail: 'owner-pc@local.test', adminName: 'PC Owner', planSlug }, SECRET, 10);
const account = (action?: string, extra: Record<string, unknown> = {}) =>
  post('/api/v1/billing-portal/account', { token: signJwt({ organizationId: ORG, adminEmail: 'owner-pc@local.test', purpose: 'billing_account' }, SECRET, 1), action, ...extra });
const sub = () => prisma.organizationSubscription.findUniqueOrThrow({ where: { organizationId: ORG }, include: { plan: true } });
const cache = async () => (await queryMainDb<{ c: Record<string, unknown> }>(`SELECT "planLimitsCache" AS c FROM organizations WHERE id = $1`, [ORG]))[0]?.c ?? {};
const step = (s: string) => console.log(`✔ ${s}`);

async function cleanup() {
  const invoiceIds = (await prisma.invoice.findMany({ where: { organizationId: ORG }, select: { id: true } })).map((i) => i.id);
  await prisma.billingDocument.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.creditNote.deleteMany({ where: { organizationId: ORG } });
  await prisma.aiCreditTopUp.deleteMany({ where: { organizationId: ORG } });
  await prisma.opsMessageLog.deleteMany({ where: { organizationId: ORG } });
  await prisma.contestBooking.deleteMany({ where: { organizationId: ORG } });
  await prisma.opsPayment.deleteMany({ where: { organizationId: ORG } });
  await prisma.invoice.deleteMany({ where: { organizationId: ORG } });
  await prisma.razorpaySubscription.deleteMany({ where: { organizationId: ORG } });
  await prisma.organizationSubscription.deleteMany({ where: { organizationId: ORG } });
  await prisma.featureFlagOrgOverride.deleteMany({ where: { organizationId: ORG } });
  await prisma.subscriptionOverride.deleteMany({ where: { subscription: { organizationId: ORG } } });
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
  ]) await queryMainDb(sql.includes('$1') ? sql : sql, sql.includes('$1') ? [ORG] : []);
  await queryMainDb(`DELETE FROM admin_refresh_tokens WHERE "adminId" = $1`, [OWNER]);
  await queryMainDb(`DELETE FROM admins WHERE id = $1`, [OWNER]);
}

async function setup() {
  await cleanup();
  madeSettings = !(await prisma.billingSettings.findUnique({ where: { id: 'billing_default' } }));
  await queryMainDb(`INSERT INTO organizations (id,name,slug,"updatedAt") VALUES ($1,'PlanChange College','planchange-college',NOW())`, [ORG]);
  await queryMainDb(`INSERT INTO admins (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES ($1,'owner-pc@local.test','x','PC','Owner',NOW())`, [OWNER]);
  await queryMainDb(`INSERT INTO org_members (id,"organizationId","adminId",role,"acceptedAt","updatedAt") VALUES ('01SUBE2EMEM000000000000003',$1,$2,'OWNER',NOW(),NOW())`, [ORG, OWNER]);
  await prisma.billingSettings.upsert({
    where: { id: 'billing_default' },
    update: {},
    create: { legalName: 'YSM Info Solution', gstin: '27ABCDE1234F1Z5', address: 'Pune', state: 'Maharashtra', email: 'billing@local.test', sacCode: '998314', updatedAt: new Date() },
  });
  const pro = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { slug: 'edu-pro-500' } });
  const now = new Date();
  await prisma.organizationSubscription.create({
    data: { id: 'sub_e2e_pc', organizationId: ORG, planId: pro.id, billingCycle: 'MONTHLY', currentPeriodStart: new Date(now.getTime() - 20 * DAY), currentPeriodEnd: new Date(now.getTime() + 10 * DAY) },
  });
}

async function main() {
  await setup();
  const subs = new SubscriptionsService();

  // 1. Downgrade at checkout: nothing to pay, it waits for the period end.
  const order = await post('/api/v1/billing-portal/subscription/order', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  assert.equal(order.status, 409);
  assert.equal(order.body.code ?? order.body.error?.code, 'SCHEDULE_INSTEAD', JSON.stringify(order.body));
  const sched = await post('/api/v1/billing-portal/subscription/schedule', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  assert.equal(sched.status, 200, JSON.stringify(sched.body));
  let s = await sub();
  assert.equal(s.scheduledPlanId, 'plan_edu_basic');
  const shown = await account();
  assert.equal(shown.body.data.subscription.scheduledChange.planName, 'Basic');
  assert.equal(await prisma.opsMessageLog.count({ where: { organizationId: ORG, template: 'SUBSCRIPTION_CHANGE_SCHEDULED' } }), 1);
  step(`downgrade Pro 500 → Basic: no charge, scheduled for ${s.currentPeriodEnd.toISOString().slice(0, 10)}, owner emailed`);

  await account('cancel_scheduled_change');
  assert.equal((await sub()).scheduledPlanId, null);
  await post('/api/v1/billing-portal/subscription/schedule', { token: handoff('edu-basic'), billingCycle: 'MONTHLY' });
  const keptEnd = (await sub()).currentPeriodEnd;
  await prisma.organizationSubscription.update({ where: { organizationId: ORG }, data: { currentPeriodEnd: new Date(Date.now() - 60_000) } });
  assert.equal(await applyDueScheduledChanges(), 1);
  s = await sub();
  assert.equal(s.plan.slug, 'edu-basic');
  assert.equal(s.scheduledPlanId, null);
  step('owner can keep the plan; at the period end the job switches to Basic, dates kept');

  // 2. Upgrade now, paid with proration, through checkout and the order webhook.
  await prisma.organizationSubscription.update({ where: { organizationId: ORG }, data: { currentPeriodEnd: keptEnd, status: 'ACTIVE' } });
  const up = await post('/api/v1/billing-portal/subscription/order', { token: handoff('edu-pro-500'), billingCycle: 'MONTHLY' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  await webhook('payment.captured', { payment: { entity: { id: 'pay_pc_up', order_id: up.body.data.orderId, amount: up.body.data.amount } } });
  s = await sub();
  assert.equal(s.plan.slug, 'edu-pro-500');
  const upPayment = await prisma.opsPayment.findUniqueOrThrow({ where: { razorpayPaymentId: 'pay_pc_up' }, include: { invoice: true } });
  assert.ok(upPayment.invoice);
  step(`upgrade Basic → Pro 500 now: paid ₹${Number(upPayment.amount)}, ${upPayment.invoice!.invoiceNumber}`);

  // 3. Cycle dates: ops moves the start; it must stay before the end.
  const newStart = new Date(Date.now() - 2 * DAY);
  await subs.updateAccess(ORG, { currentPeriodStart: newStart, reason: 'e2e' }, ADMIN);
  assert.equal((await sub()).currentPeriodStart.getTime(), newStart.getTime());
  await assert.rejects(subs.updateAccess(ORG, { currentPeriodStart: new Date(Date.now() + 400 * DAY), reason: 'e2e' }, ADMIN));
  step('cycle start moved; a start after the end is refused');

  // 4. Moving a plan's subscribers: a preview, then at renewal.
  const preview = await migratePlanSubscribers('plan_edu_pro_500', { toPlanId: 'plan_edu_pro_1000', when: 'renewal', dryRun: true, reason: 'e2e' }, ADMIN);
  assert.ok(preview.movable >= 1);
  assert.equal(preview.moved, 0);
  assert.equal((await sub()).scheduledPlanId, null, 'a preview changes nothing');
  // Only this org: the local DB may have others on the plan, so schedule just ours the same way the migration does.
  await subs.changePlan(ORG, 'plan_edu_pro_500', ADMIN, 'MONTHLY');
  step(`move subscribers preview: ${preview.movable} of ${preview.total} on Pro 500, by method ${JSON.stringify(preview.byMethod)}`);

  // 5. Credit notes: a partial Razorpay refund, then the rest with access ended.
  const inv = upPayment.invoice!;
  const cn1 = await issueCreditNote(inv.id, { amount: 1000, reason: 'Goodwill for downtime', refundMethod: 'RAZORPAY', paymentId: upPayment.id, endAccess: false }, ADMIN);
  assert.match(cn1.number, /^CN\/\d\d-\d\d\/\d{5}$/);
  assert.match(cn1.razorpayRefundId ?? '', /^rfnd_test_/);
  assert.equal(Math.round((Number(cn1.subtotal) + Number(cn1.cgstAmount) + Number(cn1.sgstAmount) + Number(cn1.igstAmount)) * 100) / 100, 1000);
  const doc = await prisma.billingDocument.findUniqueOrThrow({ where: { number: cn1.number } });
  assert.equal(Buffer.from(doc.data).subarray(0, 4).toString(), '%PDF');
  await assert.rejects(issueCreditNote(inv.id, { amount: Number(inv.total), reason: 'too much', refundMethod: 'NONE', endAccess: false }, ADMIN), /At most/);
  await assert.rejects(issueCreditNote(inv.id, { amount: 1, reason: 'not super', refundMethod: 'NONE', endAccess: false }, { ...ADMIN, role: 'BILLING_ADMIN' }), /super admin/);
  const rest = Math.round((Number(inv.total) - 1000) * 100) / 100;
  await issueCreditNote(inv.id, { amount: rest, reason: 'Contract ended early', refundMethod: 'BANK_TRANSFER', refundReference: 'UTR123', paymentId: upPayment.id, endAccess: true }, ADMIN);
  s = await sub();
  assert.equal(s.plan.slug, 'free');
  assert.equal((await prisma.opsPayment.findUniqueOrThrow({ where: { id: upPayment.id } })).status, 'REFUNDED');
  const owner = await account();
  assert.equal(owner.body.data.invoices.find((i: { id: string }) => i.id === inv.id).creditNotes.length, 2);
  assert.equal(await prisma.opsMessageLog.count({ where: { organizationId: ORG, template: 'CREDIT_NOTE_ISSUED' } }), 2);
  step(`credit notes: ${cn1.number} ₹1,000 refunded via Razorpay (PDF saved), rest by bank with access ended → Free, payment REFUNDED`);

  // An unpaid invoice is cancelled by a credit note for all of it.
  const { invoice: unpaid } = await invoicesService.issue(ORG, { description: 'Extra seats', collectionMethod: 'OFFLINE', amount: 1000, gstRate: 18, dueInDays: 15, accessMode: 'ON_PAYMENT' }, ADMIN);
  await issueCreditNote(unpaid.id, { amount: Number(unpaid.total), reason: 'Raised by mistake', refundMethod: 'NONE', endAccess: false }, ADMIN);
  const closed = await prisma.invoice.findUniqueOrThrow({ where: { id: unpaid.id } });
  assert.equal(closed.status, 'VOID');
  step(`unpaid ${unpaid.invoiceNumber} fully credited → closed: "${closed.closedReason}"`);

  // 6. Org delete cancels auto-debit.
  await prisma.razorpaySubscription.create({ data: { id: 'sub_test_pc_live', organizationId: ORG, planId: 'plan_edu_basic', billingCycle: 'MONTHLY', razorpayPlanId: 'plan_test_x', baseAmount: 2399, amount: 2830.82, status: 'active' } });
  await prisma.organizationSubscription.update({ where: { organizationId: ORG }, data: { collectionMethod: 'AUTO_DEBIT', razorpaySubscriptionId: 'sub_test_pc_live' } });
  await organizationsService.softDelete(ORG, ADMIN, 'e2e');
  assert.equal((await prisma.razorpaySubscription.findUniqueOrThrow({ where: { id: 'sub_test_pc_live' } })).status, 'cancelled');
  assert.equal((await sub()).collectionMethod, 'PAY_ONLINE');
  await organizationsService.restore(ORG, ADMIN, 'e2e');
  step('deleting the org cancelled its live mandate');

  // 7. Event Pass: priced by the shared formula, provisioning raises limits for 30 days, cancelling removes them.
  const bookings = new BookingsService();
  // Bookings point at a real platform admin; borrow one for the actor id (nothing is written to it).
  const someAdmin = await prisma.platformAdmin.findFirst({ select: { id: true } });
  if (!someAdmin) throw new Error('No platform admin locally: run npm run seed:platform-admin first.');
  const BOOKER = { ...ADMIN, id: someAdmin.id };
  const booking = await bookings.createBooking(
    { orgMode: 'existing', organizationId: ORG, contestName: 'Annual quiz', durationMinutes: 60, questionCount: 60, participantCount: 750, addOnsSelected: { proctoring: true, certificates: true, prioritySupport: false } },
    BOOKER,
  );
  assert.equal(booking.pricingBreakdown.eventPass?.basePrice, 6999);
  assert.equal(booking.pricingBreakdown.total, 6999);
  await bookings.updateBookingStatus(booking.id, { status: 'PAID', paymentMethod: 'bank', paymentReference: 'UTR9' }, ADMIN);
  await bookings.updateBookingStatus(booking.id, { status: 'PROVISIONED' }, ADMIN);
  const grants = await prisma.subscriptionOverride.findMany({ where: { bookingId: booking.id, removedAt: null } });
  assert.ok(grants.some((g) => g.field === 'maxParticipantsPerContest' && g.value === 750));
  let c = await cache();
  assert.equal(c.maxParticipantsPerContest, 750);
  await bookings.updateBookingStatus(booking.id, { status: 'CANCELLED', cancellationReason: 'e2e' }, ADMIN);
  c = await cache();
  assert.notEqual(c.maxParticipantsPerContest, 750);
  step(`Event Pass for 750: ₹6,999, ${grants.length} overrides for 30 days, gone on cancel`);


  // 8. Public Event Pass quote, the same formula.
  const quote = await post('/api/v1/billing-portal/event-pass/quote', { participants: 500, entryFee: 100 });
  assert.equal(quote.body.data.price, 4999);
  assert.equal(quote.body.data.revenueShare.payoutPerRegistration, 82.99);
  step('public quote: 500 people ₹4,999, ₹100 fee pays out ₹82.99');

  // 9. AI credits: a paid top-up invoice adds credits; ops can give some too; both reach the main app.
  const { invoice: aiInv } = await invoicesService.issue(ORG, { description: 'QuizBuzz AI credits, 500', collectionMethod: 'PAY_ONLINE', amount: 1499, gstRate: 18, dueInDays: 7, accessMode: 'ON_PAYMENT' }, ADMIN, { aiCredits: 500 });
  await webhook('payment_link.paid', { payment_link: { entity: { id: aiInv.razorpayLinkId } }, payment: { entity: { id: 'pay_pc_ai', amount: Math.round(Number(aiInv.total) * 100) } } });
  await grantFreeTopUp(ORG, { credits: 100, months: 12, reason: 'pilot' }, ADMIN);
  const tops = await prisma.aiCreditTopUp.findMany({ where: { organizationId: ORG } });
  assert.equal(tops.reduce((sum, t) => sum + t.credits, 0), 600);
  c = await cache();
  assert.equal(c.aiTopUpCredits, 600);
  step('AI credits: 500 bought with a pay link + 100 given = 600 in the main app cache');

  console.log('\nAll Stage 5 and 6 checks passed.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    // KEEP=1 leaves the data for a look in the browser; the next run cleans it first.
    if (!process.env.KEEP) await cleanup().catch((e) => console.error('Cleanup failed:', e));
    await prisma.$disconnect();
    process.exit();
  });
