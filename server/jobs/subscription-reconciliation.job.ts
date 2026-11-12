import { prisma } from '../db/ops-prisma';
import { queryMainDb } from '../db/main-db-pool';
import SubscriptionsRepository from '../features/subscriptions/subscriptions.repository';
import SubscriptionsService, { syncOrgPlanLimitsCache } from '../features/subscriptions/subscriptions.service';
import { computeAccessDates, lapseStatusAt, LapseStatus } from '../features/subscriptions/access-dates';
import { oldestUnpaidDueAt } from '../features/subscriptions/access-input';
import { reminderDue } from './reminder-due';
import { reconcileAutoDebits } from '../features/autodebit/autodebit.service';
import { applyDueScheduledChanges } from '../features/subscriptions/plan-change';
import { orgOwnerNotifier } from '../notifications/org-owner-notifier';
import { writeAuditLogEntry, SYSTEM_ACTOR } from '../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

const subscriptionsRepo = new SubscriptionsRepository();

const RENEWAL_REMINDER_DAYS_BEFORE = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Days before a due date (negative: after it). Offline customers need the longest notice.
const INVOICE_REMINDER_DAYS = [7, 1, -1, -5];
const CONTRACT_REMINDER_DAYS = [60, 30, 7];
const isoDay = (d: Date | null) => d?.toISOString().slice(0, 10) ?? '';

export interface ReconciliationResult {
  freePlansAssigned: number;
  invoiceReminders: number;
  contractReminders: number;
  remindersSent: number;
  statusChanges: number;
  synced: number;
  syncFailures: number;
}

/** Signup happens in the main app, which can't write here, so orgs get their Free row from this job. */
async function assignFreePlanToNewOrgs(): Promise<number> {
  const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: 'free' }, select: { id: true } });
  if (!freePlan) return 0;

  const orgs = await queryMainDb<{ id: string }>(`SELECT id FROM organizations WHERE "isDeleted" = false`);
  const existing = await prisma.organizationSubscription.findMany({
    where: { organizationId: { in: orgs.map((o) => o.id) } },
    select: { organizationId: true },
  });
  const has = new Set(existing.map((s) => s.organizationId));
  const missing = orgs.filter((o) => !has.has(o.id));

  const service = new SubscriptionsService();
  let assigned = 0;
  for (const org of missing) {
    try {
      await service.assignPlan(org.id, freePlan.id, SYSTEM_ACTOR);
      assigned++;
    } catch (err) {
      console.error(`[JOB] Could not assign the Free plan to org ${org.id}:`, err);
    }
  }
  return assigned;
}

async function sendInvoiceReminders(now: Date): Promise<number> {
  const open = await prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
  let sent = 0;
  for (const inv of open) {
    const daysLeft = Math.ceil((inv.dueAt.getTime() - now.getTime()) / MS_PER_DAY);
    const stage = reminderDue(INVOICE_REMINDER_DAYS, daysLeft, inv.lastReminderDays);
    if (stage === null) continue;
    const ok = await orgOwnerNotifier.notify(inv.organizationId, 'INVOICE_REMINDER', {
      invoiceNumber: inv.invoiceNumber,
      description: inv.description,
      balance: Number(inv.total) - Number(inv.amountPaid) - Number(inv.tdsAmount),
      dueDate: isoDay(inv.dueAt),
      daysLeft,
      payOnline: inv.collectionMethod === 'PAY_ONLINE',
    });
    if (ok) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { lastReminderDays: stage } });
      sent++;
    }
  }
  return sent;
}

async function sendContractReminders(now: Date): Promise<number> {
  const subs = await prisma.organizationSubscription.findMany({
    where: { contractEnd: { gt: now } },
    include: { plan: { select: { name: true } } },
  });
  let sent = 0;
  for (const sub of subs) {
    const daysLeft = Math.ceil((sub.contractEnd!.getTime() - now.getTime()) / MS_PER_DAY);
    const stage = reminderDue(CONTRACT_REMINDER_DAYS, daysLeft, sub.contractReminderDays);
    if (stage === null) continue;
    const ok = await orgOwnerNotifier.notify(sub.organizationId, 'CONTRACT_ENDING', { planName: sub.plan.name, contractEnd: isoDay(sub.contractEnd), daysLeft });
    if (ok) {
      await prisma.organizationSubscription.update({ where: { id: sub.id }, data: { contractReminderDays: stage } });
      sent++;
    }
  }
  return sent;
}

export async function runSubscriptionReconciliationJob(): Promise<ReconciliationResult> {
  const now = new Date();
  const freePlansAssigned = await assignFreePlanToNewOrgs();
  const autoDebit = await reconcileAutoDebits(now);
  const scheduledChanges = await applyDueScheduledChanges(now);
  const invoiceReminders = await sendInvoiceReminders(now);
  const contractReminders = await sendContractReminders(now);

  const subs = await prisma.organizationSubscription.findMany({
    include: { plan: { select: { name: true, kind: true } } },
  });
  const charging = new Set(
    (await prisma.razorpaySubscription.findMany({ where: { status: { in: ['authenticated', 'active'] } }, select: { id: true } })).map((r) => r.id),
  );

  let remindersSent = 0;
  let statusChanges = 0;

  for (const sub of subs) {
    const input = {
      kind: sub.plan.kind,
      currentPeriodEnd: sub.currentPeriodEnd,
      graceDays: sub.graceDays,
      overdueInvoiceDueAt: await oldestUnpaidDueAt(sub.organizationId),
      cancelled: sub.status === 'CANCELLED',
    };

    // Razorpay charges at the period end and the webhook can take a while: a healthy mandate isn't past due for its first day.
    const autoRenewing = !!sub.razorpaySubscriptionId && charging.has(sub.razorpaySubscriptionId);
    const awaitingCharge = autoRenewing && now.getTime() < sub.currentPeriodEnd.getTime() + MS_PER_DAY;

    // Renewal reminder: once per period, 7 days before the end. Left unmarked if nothing was sent, so the next run retries.
    // Auto-renewing orgs get no "renew now" nag: Razorpay sends its own pre-debit notice.
    const remindFrom = sub.currentPeriodEnd.getTime() - RENEWAL_REMINDER_DAYS_BEFORE * MS_PER_DAY;
    const remindedThisPeriod = sub.renewalReminderSentAt && sub.renewalReminderSentAt >= sub.currentPeriodStart;
    if (!autoRenewing && sub.plan.kind !== 'FREE' && sub.status === 'ACTIVE' && now.getTime() >= remindFrom && now < sub.currentPeriodEnd && !remindedThisPeriod) {
      const daysRemaining = Math.max(1, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / MS_PER_DAY));
      const sent = await orgOwnerNotifier.notify(sub.organizationId, 'SUBSCRIPTION_RENEWAL_REMINDER', {
        planName: sub.plan.name,
        currentPeriodEnd: isoDay(sub.currentPeriodEnd),
        daysRemaining,
      });
      if (sent) {
        await subscriptionsRepo.setRenewalReminderSent(sub.organizationId, now);
        remindersSent++;
      }
    }

    // A cancelled plan stays "cancelled" while its paid time runs out, then lapses like any other.
    const target: LapseStatus = lapseStatusAt(input, now);
    if (target === sub.status || (sub.status === 'CANCELLED' && target === 'ACTIVE')) continue;
    if (target === 'PAST_DUE' && awaitingCharge) continue;

    try {
      await prisma.organizationSubscription.update({ where: { id: sub.id }, data: { status: target } });
      await writeAuditLogEntry(SYSTEM_ACTOR, 'subscription.status_changed', AuditTargetType.SUBSCRIPTION, sub.id, sub.plan.name, {
        organizationId: sub.organizationId,
        from: sub.status,
        to: target,
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      });
      const { restrictAt, downgradeAt } = computeAccessDates(input);
      const base = { planName: sub.plan.name, currentPeriodEnd: isoDay(sub.currentPeriodEnd) };
      if (target === 'PAST_DUE') await orgOwnerNotifier.notify(sub.organizationId, 'SUBSCRIPTION_PAST_DUE', { ...base, restrictAt: isoDay(restrictAt) });
      if (target === 'RESTRICTED') await orgOwnerNotifier.notify(sub.organizationId, 'SUBSCRIPTION_RESTRICTED', { ...base, downgradeAt: isoDay(downgradeAt) });
      if (target === 'EXPIRED') await orgOwnerNotifier.notify(sub.organizationId, 'SUBSCRIPTION_EXPIRED', base);
      statusChanges++;
    } catch (err) {
      console.error(`[JOB] Failed to move subscription for org ${sub.organizationId} to ${target}:`, err);
    }
  }

  // Re-sync every org: this heals any cache write that failed earlier, and picks up plan edits.
  let synced = 0;
  let syncFailures = 0;
  for (const sub of subs) {
    try {
      await syncOrgPlanLimitsCache(sub.organizationId);
      synced++;
    } catch (err) {
      syncFailures++;
      console.error(`[JOB] Cache sync failed for org ${sub.organizationId}:`, err);
      await writeAuditLogEntry(SYSTEM_ACTOR, 'subscription.cache_sync_failed', AuditTargetType.SUBSCRIPTION, sub.organizationId, 'Subscription Reconciliation', {
        organizationId: sub.organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = { freePlansAssigned, invoiceReminders, contractReminders, remindersSent, statusChanges, synced, syncFailures, autoDebitAbandoned: autoDebit.abandoned, autoDebitFailures: autoDebit.failures, scheduledChanges };
  // This runs hourly, so the audit log only hears about runs that did something.
  if (freePlansAssigned || invoiceReminders || contractReminders || remindersSent || statusChanges || syncFailures || autoDebit.abandoned || autoDebit.failures || scheduledChanges) {
    await writeAuditLogEntry(SYSTEM_ACTOR, 'system.cache_reconciled', AuditTargetType.SUBSCRIPTION, 'system_reconciliation', 'Subscription Sync Reconciler', { ...result });
    console.log('[JOB] Subscription reconciliation:', result);
  }
  return result;
}
