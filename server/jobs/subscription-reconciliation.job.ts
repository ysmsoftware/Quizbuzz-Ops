import { prisma } from '../db/ops-prisma';
import SubscriptionsRepository from '../features/subscriptions/subscriptions.repository';
import { syncOrgPlanLimitsCache } from '../features/subscriptions/subscriptions.service';
import { orgOwnerNotifier } from '../notifications/org-owner-notifier';
import { writeAuditLogEntry, SYSTEM_ACTOR } from '../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

const subscriptionsRepo = new SubscriptionsRepository();

// Fixed single threshold per the product decision — no card-on-file/auto-
// renewal in this system, so one "come back and pay" reminder per period is
// enough. An ops admin can always manually re-trigger one from the org's
// subscription tab regardless of this window (see resend-reminder route).
const RENEWAL_REMINDER_DAYS_BEFORE = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReconciliationResult {
  remindersSent: number;
  expired: number;
  synced: number;
  syncFailures: number;
}

export async function runSubscriptionReconciliationJob(): Promise<ReconciliationResult> {
  const now = new Date();

  // ── Step 1: renewal reminders — periods ending within the next 7 days ─────
  // "Already sent for the current period" = renewalReminderSentAt exists and
  // is on/after currentPeriodStart. A renewed subscription gets a fresh
  // currentPeriodStart, so it naturally becomes eligible again without any
  // explicit reset elsewhere (assignPlan/changePlan don't need to know this
  // field exists).
  const reminderWindowEnd = new Date(now.getTime() + RENEWAL_REMINDER_DAYS_BEFORE * MS_PER_DAY);
  const dueForReminder = await prisma.organizationSubscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: { gt: now, lte: reminderWindowEnd },
    },
    include: { plan: { select: { name: true } } },
  });

  let remindersSent = 0;
  for (const sub of dueForReminder) {
    const alreadySentThisPeriod =
      sub.renewalReminderSentAt && sub.renewalReminderSentAt >= sub.currentPeriodStart;
    if (alreadySentThisPeriod) continue;

    const daysRemaining = Math.max(1, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / MS_PER_DAY));
    const sent = await orgOwnerNotifier.notify(sub.organizationId, 'SUBSCRIPTION_RENEWAL_REMINDER', {
      planName: sub.plan.name,
      currentPeriodEnd: sub.currentPeriodEnd.toISOString().slice(0, 10),
      daysRemaining,
    });

    if (sent) {
      await subscriptionsRepo.setRenewalReminderSent(sub.organizationId, now);
      remindersSent++;
    }
    // If not sent (e.g. no owner contact found), deliberately leave
    // renewalReminderSentAt untouched so tomorrow's run retries it rather
    // than silently marking a reminder as sent that never went out.
  }

  // ── Step 2: expire anything whose paid period has lapsed ──────────────────
  // This is the only place SubscriptionStatus ever transitions to EXPIRED —
  // nothing else in the app currently checks currentPeriodEnd against "now".
  const lapsed = await prisma.organizationSubscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
    include: { plan: { select: { name: true } } },
  });

  let expiredCount = 0;
  for (const sub of lapsed) {
    try {
      await subscriptionsRepo.markExpired(sub.organizationId);
      await writeAuditLogEntry(
        SYSTEM_ACTOR,
        'subscription.expired',
        AuditTargetType.SUBSCRIPTION,
        sub.id,
        sub.plan.name,
        { organizationId: sub.organizationId, planId: sub.planId, currentPeriodEnd: sub.currentPeriodEnd.toISOString() }
      );
      await orgOwnerNotifier.notify(sub.organizationId, 'SUBSCRIPTION_EXPIRED', {
        planName: sub.plan.name,
        currentPeriodEnd: sub.currentPeriodEnd.toISOString().slice(0, 10),
      });
      expiredCount++;
    } catch (err) {
      console.error(`[JOB] Failed to expire subscription for org ${sub.organizationId}:`, err);
    }
  }

  // ── Step 3: re-sync the main app's cache for every subscription that's
  // still ACTIVE, plus every subscription just expired above (so
  // organizations.planStatus flips to 'EXPIRED' there immediately rather
  // than waiting for some other trigger). This is also the self-healing
  // net for any cache write that failed at payment time — see
  // subscriptions.service.ts#assignPlan's subscription.cache_sync_failed
  // handling for why that can happen and why this loop is what recovers it.
  const stillActive = await prisma.organizationSubscription.findMany({
    where: { status: 'ACTIVE' },
    select: { organizationId: true },
  });
  const orgIdsToSync = [
    ...stillActive.map((s) => s.organizationId),
    ...lapsed.map((s) => s.organizationId),
  ];

  let syncedCount = 0;
  let syncFailureCount = 0;

  for (const orgId of orgIdsToSync) {
    try {
      await syncOrgPlanLimitsCache(orgId);
      syncedCount++;
    } catch (err: any) {
      syncFailureCount++;
      console.error(`[JOB] Cache sync failed for org ${orgId}:`, err);
      await writeAuditLogEntry(
        SYSTEM_ACTOR,
        'subscription.cache_sync_failed',
        AuditTargetType.SUBSCRIPTION,
        orgId,
        'Nightly Reconciliation',
        { organizationId: orgId, error: err?.message || String(err) }
      );
      // Deliberately not re-thrown — one org's cross-DB failure must not
      // abort reconciliation for every other org in the loop. It'll be
      // retried on tomorrow's run.
    }
  }

  await writeAuditLogEntry(
    SYSTEM_ACTOR,
    'system.cache_reconciled',
    AuditTargetType.SUBSCRIPTION,
    'system_reconciliation',
    'Subscription Sync Reconciler',
    { remindersSent, expired: expiredCount, synced: syncedCount, syncFailures: syncFailureCount }
  );

  console.log(
    `[JOB] Subscription reconciliation finished. Reminders sent: ${remindersSent}. Expired: ${expiredCount}. Synced: ${syncedCount}. Sync failures: ${syncFailureCount}.`
  );

  return { remindersSent, expired: expiredCount, synced: syncedCount, syncFailures: syncFailureCount };
}
