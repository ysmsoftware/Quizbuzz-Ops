/**
 * Single responsibility: turn a plan's base limits plus a subscription's
 * active overrides into the *effective* numbers actually in force.
 *
 * This used to be duplicated — a `Map<field, value>` built independently in
 * both entitlements.service.ts (which syncs the numbers to the main app) and
 * subscriptions.service.ts (which displays them in the ops dashboard) — and
 * each copy resolved "two overrides on the same field" differently
 * (non-deterministically, since neither had a defined ordering). This module
 * is now the one place that logic lives; both services call it.
 */

export type LimitField =
  | 'maxContestsPerCycle'
  | 'maxParticipantsPerContest'
  | 'maxQuestionsPerContest'
  | 'maxOrgMembers';

export const LIMIT_FIELDS: readonly LimitField[] = [
  'maxContestsPerCycle',
  'maxParticipantsPerContest',
  'maxQuestionsPerContest',
  'maxOrgMembers',
] as const;

export type OverrideMode = 'ADDITIVE' | 'ABSOLUTE';

/** The subset of a SubscriptionOverride row this module needs — kept narrow so callers don't have to hand it a full Prisma type. */
export interface OverrideInput {
  field: string;
  value: number | null;
  mode: OverrideMode;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface EffectiveLimit {
  value: number | null;
  planValue: number | null;
  overridden: boolean;
}

export type EffectiveLimits = Record<LimitField, EffectiveLimit>;

export function isOverrideActive(override: Pick<OverrideInput, 'expiresAt'>, now: Date = new Date()): boolean {
  return override.expiresAt === null || override.expiresAt > now;
}

/**
 * Folds a single field's active overrides onto the plan's base value, oldest
 * first — so a later ADDITIVE grant stacks on top of an earlier one, and an
 * ABSOLUTE override resets whatever total came before it. Applying in
 * creation order is what makes the result deterministic; without it, two
 * overrides on the same field would have an undefined winner.
 */
function foldOverridesForField(planValue: number | null, overrides: OverrideInput[]): EffectiveLimit {
  const active = overrides
    .filter((o) => isOverrideActive(o))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let value = planValue;
  for (const override of active) {
    if (override.mode === 'ABSOLUTE') {
      value = override.value;
    } else if (value !== null && override.value !== null) {
      // ADDITIVE on top of "unlimited" stays unlimited — there's nothing to add to.
      value += override.value;
    }
  }

  return { value, planValue, overridden: active.length > 0 };
}

/** Computes the effective value + breakdown for every plan limit field at once. */
export function computeEffectiveLimits(
  planLimits: Record<LimitField, number | null>,
  overrides: OverrideInput[],
): EffectiveLimits {
  const overridesByField = new Map<string, OverrideInput[]>();
  for (const override of overrides) {
    const bucket = overridesByField.get(override.field);
    if (bucket) bucket.push(override);
    else overridesByField.set(override.field, [override]);
  }

  const result = {} as EffectiveLimits;
  for (const field of LIMIT_FIELDS) {
    result[field] = foldOverridesForField(planLimits[field], overridesByField.get(field) ?? []);
  }
  return result;
}
