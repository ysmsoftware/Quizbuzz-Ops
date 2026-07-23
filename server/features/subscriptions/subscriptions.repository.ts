import { prisma } from '../../db/ops-prisma';
import {
  OrganizationSubscription,
  SubscriptionPlan,
  SubscriptionOverride,
  SubscriptionChangeLog,
  SubscriptionStatus,
} from '@prisma/client';

export interface ISubscriptionsRepository {
  getSubscriptionDetail(orgId: string): Promise<any | null>;
  findPlanById(planId: string): Promise<SubscriptionPlan | null>;
  findSubscriptionByOrgId(orgId: string): Promise<OrganizationSubscription | null>;
  upsertSubscription(params: {
    id: string;
    organizationId: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }): Promise<OrganizationSubscription>;
  updateSubscriptionPlan(organizationId: string, planId: string): Promise<OrganizationSubscription>;
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
    value: number;
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
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }): Promise<OrganizationSubscription> {
    return prisma.organizationSubscription.upsert({
      where: { organizationId: params.organizationId },
      update: {
        planId: params.planId,
        status: params.status,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
      },
      create: {
        id: params.id,
        organizationId: params.organizationId,
        planId: params.planId,
        status: params.status,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
      },
    });
  }

  async updateSubscriptionPlan(organizationId: string, planId: string): Promise<OrganizationSubscription> {
    return prisma.organizationSubscription.update({
      where: { organizationId },
      data: {
        planId,
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
    value: number;
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
