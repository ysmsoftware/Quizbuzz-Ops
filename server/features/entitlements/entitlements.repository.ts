import { prisma } from '../../db/ops-prisma';
import { queryMainDb } from '../../db/main-db-pool';

export interface IEntitlementsRepository {
  getSubscriptionWithPlanAndActiveOverrides(orgId: string): Promise<any | null>;
  updateMainDbPlanLimitsCache(
    orgId: string,
    planSlug: string,
    status: string,
    cachePayloadJson: string
  ): Promise<void>;
}

export class EntitlementsRepository implements IEntitlementsRepository {
  async getSubscriptionWithPlanAndActiveOverrides(orgId: string): Promise<any | null> {
    return prisma.organizationSubscription.findUnique({
      where: { organizationId: orgId },
      include: {
        plan: true,
        overrides: {
          where: {
            removedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
    });
  }

  async updateMainDbPlanLimitsCache(
    orgId: string,
    planSlug: string,
    status: string,
    cachePayloadJson: string
  ): Promise<void> {
    await queryMainDb(
      `
      UPDATE organizations
      SET "planSlug" = $1, "planStatus" = $2, "planLimitsCache" = $3, "updatedAt" = NOW()
      WHERE id = $4
    `,
      [planSlug, status, cachePayloadJson, orgId]
    );
  }
}
export default EntitlementsRepository;
