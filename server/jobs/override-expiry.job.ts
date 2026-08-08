import { prisma } from '../db/ops-prisma';
import { syncOrgPlanLimitsCache } from '../features/subscriptions/subscriptions.service';
import { orgOwnerNotifier } from '../notifications/org-owner-notifier';
import { writeAuditLogEntry, SYSTEM_ACTOR } from '../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

const FIELD_LABELS: Record<string, string> = {
  maxContestsPerCycle: 'Contests per Month',
  maxParticipantsPerContest: 'Participants per Contest',
  maxQuestionsPerContest: 'Questions per Contest',
  maxOrgMembers: 'Organization Members',
  featureProctoring: 'Advanced Proctoring',
  featureCertBranding: 'Custom Certificate Branding',
  featureAnalyticsExport: 'Analytics Export',
  featurePrioritySupport: 'Priority Support',
  featureCustomDomain: 'Custom Domain',
};

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
      subscription: { include: { plan: { select: { name: true } } } },
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

    // Same SUBSCRIPTION_LIMIT_DECREASED template as a manual removeOverride()
    // call — only the trigger differs (this is the override's own scheduled
    // expiry, not an ops admin manually revoking it).
    await orgOwnerNotifier.notify(ov.subscription.organizationId, 'SUBSCRIPTION_LIMIT_DECREASED', {
      planName: ov.subscription.plan?.name || 'your plan',
      fieldLabel: FIELD_LABELS[ov.field] || ov.field,
      wasExpiry: true,
    });
  }

  for (const orgId of affectedOrgIds) {
    await syncOrgPlanLimitsCache(orgId);
  }

  console.log(`[JOB] Override Expiry completed. Processed ${expiredOverrides.length} expired overrides across ${affectedOrgIds.size} orgs.`);
  return expiredOverrides.length;
}
