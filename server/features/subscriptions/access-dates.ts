/**
 * The one place that turns a subscription's dates into what the org may do. Ops writes the two
 * dates into the main app's cache, and the main app compares them at request time, so a late
 * job can never let anyone slip through or lock anyone out wrongly.
 */

export const DOWNGRADE_AFTER_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LapseStatus = 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED' | 'EXPIRED';

export interface AccessDates {
  /** From here nothing new can be created. Null: never (the Free plan). */
  restrictAt: Date | null;
  /** From here Free limits replace the plan's. Null: never. */
  downgradeAt: Date | null;
}

export interface AccessInput {
  kind: string;
  currentPeriodEnd: Date;
  graceDays: number;
  /** Due date of the oldest unpaid invoice the org already has access for. It can run out before the paid period does. */
  overdueInvoiceDueAt?: Date | null;
  /** Cancelled by the owner: paid time runs out and it goes straight to Free, with no grace and no renewal nags. */
  cancelled?: boolean;
}

function effectiveEnd(input: AccessInput): number {
  const end = input.currentPeriodEnd.getTime();
  return input.overdueInvoiceDueAt ? Math.min(end, input.overdueInvoiceDueAt.getTime()) : end;
}

export function computeAccessDates(input: AccessInput): AccessDates {
  if (input.kind === 'FREE') return { restrictAt: null, downgradeAt: null };
  if (input.cancelled) return { restrictAt: input.currentPeriodEnd, downgradeAt: input.currentPeriodEnd };
  const end = effectiveEnd(input);
  const restrictAt = end + input.graceDays * MS_PER_DAY;
  // A contract's grace can run longer than the usual downgrade date.
  const downgradeAt = Math.max(end + DOWNGRADE_AFTER_DAYS * MS_PER_DAY, restrictAt);
  return { restrictAt: new Date(restrictAt), downgradeAt: new Date(downgradeAt) };
}

export function lapseStatusAt(
  input: AccessInput,
  now: Date = new Date(),
): LapseStatus {
  const { restrictAt, downgradeAt } = computeAccessDates(input);
  if (!restrictAt || !downgradeAt) return 'ACTIVE';
  if (now >= downgradeAt) return 'EXPIRED';
  if (now >= restrictAt) return 'RESTRICTED';
  return now.getTime() >= effectiveEnd(input) ? 'PAST_DUE' : 'ACTIVE';
}

function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  target.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
  return target;
}

/**
 * The month containing `now`, counted from the anchor. Limits are "per month" on every billing
 * cycle. Same logic as usageWindow in the main app's plan-entitlements.ts; keep the two in step.
 */
export function usageWindow(anchor: Date, now: Date = new Date()): { start: Date; end: Date } {
  let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth();
  if (addMonthsClamped(anchor, months) > now) months -= 1;
  return { start: addMonthsClamped(anchor, months), end: addMonthsClamped(anchor, months + 1) };
}
