/** A public plan on sale, the org's own private plan, or renewing the plan it's already on. */
export function canBuyPlan(
  plan: { id: string; isActive: boolean; isSellable: boolean; organizationId: string | null },
  organizationId: string,
  currentPlanId: string | null | undefined,
): boolean {
  if (!plan.isActive) return false;
  if (plan.organizationId) return plan.organizationId === organizationId;
  return plan.isSellable || plan.id === currentPlanId;
}
