import { prisma } from '../db/ops-prisma';
import { syncOrgPlanLimitsCache } from '../features/subscriptions/subscriptions.service';
import { writeAuditLogEntry, SYSTEM_ACTOR } from '../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

export async function runOverrideExpiryJob(): Promise<number> {
  const now = new Date();
  const expiredOverrides = await prisma.subscriptionOverride.findMany({
    where: {
      removedAt: null,
      expiresAt: {
        lte: now,
      },
    },
    include: {
      subscription: true,
    },
  });

  if (expiredOverrides.length === 0) return 0;

  const affectedOrgIds = new Set<string>();

  for (const ov of expiredOverrides) {
    await prisma.subscriptionOverride.update({
      where: { id: ov.id },
      data: {
        removedAt: now,
        removedReason: 'Expired automatically by background system job',
      },
    });

    affectedOrgIds.add(ov.subscription.organizationId);

    await writeAuditLogEntry(
      SYSTEM_ACTOR,
      'override.expired',
      AuditTargetType.SUBSCRIPTION,
      ov.subscriptionId,
      ov.field,
      {
        overrideId: ov.id,
        field: ov.field,
        organizationId: ov.subscription.organizationId,
      }
    );
  }

  for (const orgId of affectedOrgIds) {
    await syncOrgPlanLimitsCache(orgId);
  }

  console.log(`[JOB] Override Expiry completed. Processed ${expiredOverrides.length} expired overrides across ${affectedOrgIds.size} orgs.`);
  return expiredOverrides.length;
}
