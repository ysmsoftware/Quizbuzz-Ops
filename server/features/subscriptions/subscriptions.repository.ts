import { prisma } from '../../db/ops-prisma';
import {
  OrganizationSubscription,
  SubscriptionPlan,
  SubscriptionOverride,
  SubscriptionChangeLog,
  SubscriptionStatus,
  BillingCycle,
  OverrideMode,
  Prisma,
} from '@prisma/client';

// Accepts either the global client or a `prisma.$transaction(async (tx) => ...)`
// callback client — both expose the same model methods, so callers that need
// atomicity across two writes (see assignPlan's linkedPaymentId path) can pass
// `tx` through without the repository knowing or caring which one it got.
type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export interface ISubscriptionsRepository {
  getSubscriptionDetail(orgId: string): Promise<any | null>;
  findPlanById(planId: string): Promise<SubscriptionPlan | null>;
  findSubscriptionByOrgId(orgId: string): Promise<OrganizationSubscription | null>;
  upsertSubscription(params: {
    id: string;
    organizationId: string;
    planId: string;
    status: SubscriptionStatus;
    billingCycle: BillingCycle;
    periodMonths: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }, tx?: PrismaOrTx): Promise<OrganizationSubscription>;
  linkPayment(paymentId: string, subscriptionId: string, tx?: PrismaOrTx): Promise<void>;
  markExpired(organizationId: string): Promise<OrganizationSubscription>;
  setRenewalReminderSent(organizationId: string, at: Date): Promise<void>;
  updateSubscriptionPlan(
    organizationId: string,
    planId: string,
    billingCycle: BillingCycle,
    periodMonths: number
  ): Promise<OrganizationSubscription>;
  createChangeLog(params: {
    id: string;
    subscriptionId: string;
    fromPlanId: string;
    toPlanId: string;
    changedById: string;
    changedVia: string;
  }): Promise<SubscriptionChangeLog>;
  createOverride(params: {
    id: string;
    subscriptionId: string;
    field: string;
    value: number | null;
    mode: OverrideMode;
    reason: string;
    createdById: string;
    expiresAt?: Date | null;
  }): Promise<SubscriptionOverride>;
  removeOverride(overrideId: string, removedById: string, reason: string): Promise<SubscriptionOverride>;
  findActiveSubscriptionsByPlanId(planId: string): Promise<OrganizationSubscription[]>;
}

export class SubscriptionsRepository implements ISubscriptionsRepository {
  async getSubscriptionDetail(orgId: string): Promise<any | null> {
    return prisma.organizationSubscription.findUnique({
      where: { organizationId: orgId },
      include: {
        plan: true,
        overrides: {
          where: { removedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        changes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findPlanById(planId: string): Promise<SubscriptionPlan | null> {
    return prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
  }

  async findSubscriptionByOrgId(orgId: string): Promise<OrganizationSubscription | null> {
    return prisma.organizationSubscription.findUnique({
      where: { organizationId: orgId },
    });
  }

  async upsertSubscription(params: {
    id: string;
    organizationId: string;
    planId: string;
    status: SubscriptionStatus;
    billingCycle: BillingCycle;
    periodMonths: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }, tx: PrismaOrTx = prisma): Promise<OrganizationSubscription> {
    return tx.organizationSubscription.upsert({
      where: { organizationId: params.organizationId },
      update: {
        planId: params.planId,
        status: params.status,
        billingCycle: params.billingCycle,
        periodMonths: params.periodMonths,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
      },
      create: {
        id: params.id,
        organizationId: params.organizationId,
        planId: params.planId,
        status: params.status,
        billingCycle: params.billingCycle,
        periodMonths: params.periodMonths,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
      },
    });
  }

  /** Backfills OpsPayment.subscriptionId — pass `tx` to run atomically alongside upsertSubscription. */
  async linkPayment(paymentId: string, subscriptionId: string, tx: PrismaOrTx = prisma): Promise<void> {
    await tx.opsPayment.update({
      where: { id: paymentId },
      data: { subscriptionId },
    });
  }

  /** Sets status EXPIRED — called only by the nightly reconciliation job for subs whose currentPeriodEnd has passed. */
  async markExpired(organizationId: string): Promise<OrganizationSubscription> {
    return prisma.organizationSubscription.update({
      where: { organizationId },
      data: { status: 'EXPIRED' },
    });
  }

  /**
   * Records when SUBSCRIPTION_RENEWAL_REMINDER was sent for the CURRENT
   * period — see the schema comment on renewalReminderSentAt for why no
   * explicit reset is needed when a new period starts.
   */
  async setRenewalReminderSent(organizationId: string, at: Date): Promise<void> {
    await prisma.organizationSubscription.update({
      where: { organizationId },
      data: { renewalReminderSentAt: at },
    });
  }

  async updateSubscriptionPlan(
    organizationId: string,
    planId: string,
    billingCycle: BillingCycle,
    periodMonths: number
  ): Promise<OrganizationSubscription> {
    return prisma.organizationSubscription.update({
      where: { organizationId },
      data: {
        planId,
        billingCycle,
        periodMonths,
        updatedAt: new Date(),
      },
    });
  }

  async createChangeLog(params: {
    id: string;
    subscriptionId: string;
    fromPlanId: string;
    toPlanId: string;
    changedById: string;
    changedVia: string;
  }): Promise<SubscriptionChangeLog> {
    return prisma.subscriptionChangeLog.create({
      data: {
        id: params.id,
        subscriptionId: params.subscriptionId,
        fromPlanId: params.fromPlanId,
        toPlanId: params.toPlanId,
        changedById: params.changedById,
        changedVia: params.changedVia,
      },
    });
  }

  async createOverride(params: {
    id: string;
    subscriptionId: string;
    field: string;
    value: number | null;
    mode: OverrideMode;
    reason: string;
    createdById: string;
    expiresAt?: Date | null;
  }): Promise<SubscriptionOverride> {
    return prisma.subscriptionOverride.create({
      data: {
        id: params.id,
        subscriptionId: params.subscriptionId,
        field: params.field,
        value: params.value,
        mode: params.mode,
        reason: params.reason,
        createdById: params.createdById,
        expiresAt: params.expiresAt || undefined,
      },
    });
  }

  async removeOverride(overrideId: string, removedById: string, reason: string): Promise<SubscriptionOverride> {
    return prisma.subscriptionOverride.update({
      where: { id: overrideId },
      data: {
        removedAt: new Date(),
        removedById,
        removedReason: reason,
      },
    });
  }

  async findActiveSubscriptionsByPlanId(planId: string): Promise<OrganizationSubscription[]> {
    return prisma.organizationSubscription.findMany({
      where: { planId, status: 'ACTIVE' },
    });
  }
}
export default SubscriptionsRepository;
