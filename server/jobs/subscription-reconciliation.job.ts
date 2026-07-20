import { prisma } from '../db/ops-prisma';
import { syncOrgPlanLimitsCache } from '../features/subscriptions/subscriptions.service';
import { writeAuditLogEntry, SYSTEM_ACTOR } from '../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

export async function runSubscriptionReconciliationJob(): Promise<number> {
  const activeSubs = await prisma.organizationSubscription.findMany({
    where: { status: 'ACTIVE' },
  });

  if (activeSubs.length === 0) return 0;

  for (const sub of activeSubs) {
    await syncOrgPlanLimitsCache(sub.organizationId);
  }

  await writeAuditLogEntry(
    SYSTEM_ACTOR,
    'system.cache_reconciled',
    AuditTargetType.SUBSCRIPTION,
    'system_reconciliation',
    'Subscription Sync Reconciler',
    { count: activeSubs.length }
  );

  console.log(`[JOB] Subscription cache reconciliation finished. Synchronized ${activeSubs.length} organization records.`);
  return activeSubs.length;
}
