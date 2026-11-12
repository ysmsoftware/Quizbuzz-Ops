import { AuditTargetType, type OverrideMode } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { generateUlid } from '../../utils/ulid';
import { writeAuditLogEntry, type AuditActor } from '../../audit/audit-writer';
import { ConflictError } from '../../http/errors';
import SubscriptionsService, { syncOrgPlanLimitsCache } from '../subscriptions/subscriptions.service';
import { computeEffectiveLimits, LIMIT_FIELDS, type LimitField } from '../subscriptions/effective-limits';

/** What every Event Pass includes for 30 days (tier sheet): one contest and a rehearsal, proctoring, branded certificates, CSV export. */
const PASS_DAYS = 30;
const PASS_CONTESTS = 2;

/**
 * A provisioned booking raises the org's limits to fit the event, until 30 days after it starts.
 * Each override is tagged with the booking, so cancelling the booking takes them away.
 */
export async function grantEventPass(booking: { id: string; organizationId: string | null; contestName: string; participantCount: number; questionCount: number; desiredStartTime: string | Date | null }, actor: AuditActor) {
  if (!booking.organizationId) throw new ConflictError('Link the booking to an organization first: the pass raises that organization\'s limits.');
  const orgId = booking.organizationId;
  let sub = await prisma.organizationSubscription.findUnique({ where: { organizationId: orgId }, include: { plan: true, overrides: { where: { removedAt: null } } } });
  if (!sub) {
    // A brand-new org may not have its Free row yet (the hourly job makes it).
    const free = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { slug: 'free' } });
    await new SubscriptionsService().assignPlan(orgId, free.id, actor);
    sub = await prisma.organizationSubscription.findUniqueOrThrow({ where: { organizationId: orgId }, include: { plan: true, overrides: { where: { removedAt: null } } } });
  }
  if (await prisma.subscriptionOverride.count({ where: { bookingId: booking.id, removedAt: null } })) return;

  const live = sub.overrides.filter((o) => !o.expiresAt || o.expiresAt > new Date());
  const effective = computeEffectiveLimits(
    Object.fromEntries(LIMIT_FIELDS.map((f) => [f, sub.plan[f]])) as Record<LimitField, number | null>,
    live,
  );
  const start = booking.desiredStartTime ? new Date(booking.desiredStartTime) : new Date();
  const expiresAt = new Date(Math.max(start.getTime(), Date.now()) + PASS_DAYS * 86_400_000);
  const reason = `Event Pass: ${booking.contestName}`;

  const grants: Array<{ field: string; value: number | null; mode: OverrideMode }> = [];
  // Only where the event needs more than they already have. Unlimited (null) needs nothing.
  const raise = (field: LimitField, need: number) => {
    const now = effective[field].value;
    if (now !== null && now < need) grants.push({ field, value: need, mode: 'ABSOLUTE' });
  };
  raise('maxParticipantsPerContest', booking.participantCount);
  raise('maxQuestionsPerContest', booking.questionCount);
  if (effective.maxContestsPerCycle.value !== null) grants.push({ field: 'maxContestsPerCycle', value: PASS_CONTESTS, mode: 'ADDITIVE' });
  for (const feature of ['featureProctoring', 'featureCertBranding', 'featureAnalyticsExport'] as const) {
    if (!sub.plan[feature]) grants.push({ field: feature, value: 1, mode: 'ABSOLUTE' });
  }

  await prisma.subscriptionOverride.createMany({
    data: grants.map((g) => ({ id: generateUlid(), subscriptionId: sub.id, field: g.field, value: g.value, mode: g.mode, reason, createdById: actor.id ?? 'system', expiresAt, bookingId: booking.id })),
  });
  await syncOrgPlanLimitsCache(orgId).catch((err) => console.error(`[event-pass] cache sync for ${orgId}:`, err));
  await writeAuditLogEntry(actor, 'booking.limits_granted', AuditTargetType.BOOKING, booking.id, booking.contestName, {
    organizationId: orgId, expiresAt: expiresAt.toISOString(), grants,
  });
}

export async function revokeEventPass(bookingId: string, actor: AuditActor, why: string) {
  const overrides = await prisma.subscriptionOverride.findMany({ where: { bookingId, removedAt: null }, include: { subscription: { select: { organizationId: true } } } });
  if (!overrides.length) return;
  await prisma.subscriptionOverride.updateMany({ where: { bookingId, removedAt: null }, data: { removedAt: new Date(), removedById: actor.id, removedReason: why } });
  const orgId = overrides[0].subscription.organizationId;
  await syncOrgPlanLimitsCache(orgId).catch((err) => console.error(`[event-pass] cache sync for ${orgId}:`, err));
  await writeAuditLogEntry(actor, 'booking.limits_revoked', AuditTargetType.BOOKING, bookingId, why, { organizationId: orgId, removed: overrides.length });
}
