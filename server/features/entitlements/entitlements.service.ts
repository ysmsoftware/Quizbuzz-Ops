import { IEntitlementsRepository, EntitlementsRepository } from './entitlements.repository';
import { computeEffectiveLimits, LIMIT_FIELDS, LimitField, PLAN_FEATURES } from '../subscriptions/effective-limits';
import { computeAccessDates } from '../subscriptions/access-dates';
import { oldestUnpaidDueAt } from '../subscriptions/access-input';

export interface IEntitlementsService {
  syncOrgPlanLimitsCache(orgId: string): Promise<void>;
}

export class EntitlementsService implements IEntitlementsService {
  constructor(private repo: IEntitlementsRepository = new EntitlementsRepository()) {}

  async syncOrgPlanLimitsCache(orgId: string): Promise<void> {
    const sub = await this.repo.getSubscriptionWithPlanAndActiveOverrides(orgId);

    if (!sub || !sub.plan) return;

    // A lapsed org runs on the Free plan's limits. Ops' overrides still apply on top.
    const expired = sub.status === 'EXPIRED';
    const base = expired ? (await this.repo.findFreePlan()) ?? sub.plan : sub.plan;
    const dates = expired
      ? { restrictAt: null, downgradeAt: null }
      : computeAccessDates({
          kind: sub.plan.kind,
          currentPeriodEnd: sub.currentPeriodEnd,
          graceDays: sub.graceDays,
          overdueInvoiceDueAt: await oldestUnpaidDueAt(orgId),
          cancelled: sub.status === 'CANCELLED',
        });

    const effective = computeEffectiveLimits(
      Object.fromEntries(LIMIT_FIELDS.map((field) => [field, base[field]])) as Record<LimitField, number | null>,
      sub.overrides,
    );

    // Feature flags are on/off, not stackable numbers, so "last active override wins".
    const featureOverrides = new Map<string, number | null>();
    for (const ov of sub.overrides) {
      if (!LIMIT_FIELDS.includes(ov.field as LimitField)) featureOverrides.set(ov.field, ov.value);
    }
    const features = Object.fromEntries(
      Object.entries(PLAN_FEATURES).map(([key, column]) => [
        key,
        featureOverrides.has(column) ? Boolean(featureOverrides.get(column)) : Boolean(base[column]),
      ]),
    );
    // Falling to Free never takes away an org's way to get its own data out.
    if (expired) features.analyticsExport = true;

    const cachePayload = {
      billingCycle: sub.billingCycle,
      periodMonths: sub.periodMonths,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      planKind: sub.plan.kind,
      restrictAt: dates.restrictAt?.toISOString() ?? null,
      downgradeAt: dates.downgradeAt?.toISOString() ?? null,
      ...Object.fromEntries(LIMIT_FIELDS.map((field) => [field, effective[field].value])),
      commissionPercent: base.commissionPercent != null ? Number(base.commissionPercent) : null,
      features,
      computedAt: new Date().toISOString(),
    };

    await this.repo.updateMainDbPlanLimitsCache(orgId, sub.plan.slug, sub.status, JSON.stringify(cachePayload));
  }
}
export default EntitlementsService;
