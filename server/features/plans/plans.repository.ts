import { prisma } from '../../db/ops-prisma';

export class PlansRepository {
  async getPlans(includeInactive = false) {
    return prisma.subscriptionPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
        },
      },
      orderBy: { price: 'asc' },
    });
  }

  async getPlanById(id: string) {
    return prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
        },
      },
    });
  }

  async getPlanBySlug(slug: string) {
    return prisma.subscriptionPlan.findUnique({
      where: { slug },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
        },
      },
    });
  }

  async createPlan(data: any) {
    return prisma.subscriptionPlan.create({
      data,
    });
  }

  async updatePlan(id: string, data: any) {
    return prisma.subscriptionPlan.update({
      where: { id },
      data,
    });
  }

  async deactivatePlan(id: string) {
    return prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
export default PlansRepository;
