import { prisma } from '../../db/ops-prisma';
import { lapseStatusAt } from './access-dates';

/** Due date of the oldest unpaid invoice whose access the org already has. An ON_PAYMENT invoice not yet paid doesn't count. */
export async function oldestUnpaidDueAt(organizationId: string): Promise<Date | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { organizationId, accessGrantedAt: { not: null }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    orderBy: { dueAt: 'asc' },
    select: { dueAt: true },
  });
  return invoice?.dueAt ?? null;
}

/** Brings the status in line with the dates after a payment or a void. The job sends any lapse emails. */
export async function refreshSubscriptionStatus(organizationId: string): Promise<void> {
  const sub = await prisma.organizationSubscription.findUnique({
    where: { organizationId },
    include: { plan: { select: { kind: true } } },
  });
  if (!sub || sub.status === 'CANCELLED') return;
  const status = lapseStatusAt({
    kind: sub.plan.kind,
    currentPeriodEnd: sub.currentPeriodEnd,
    graceDays: sub.graceDays,
    overdueInvoiceDueAt: await oldestUnpaidDueAt(organizationId),
  });
  if (status !== sub.status) await prisma.organizationSubscription.update({ where: { id: sub.id }, data: { status } });
}
