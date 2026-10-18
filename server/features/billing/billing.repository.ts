import { queryMainDb } from '../../db/main-db-pool';
import { SqlWhere, pageOffset } from '../../db/sql';
import { prisma } from '../../db/ops-prisma';
import { BillingPaymentsListQueryParams } from './billing.types';

export interface IBillingRepository {
  getPlatformPayments(params: BillingPaymentsListQueryParams): Promise<{ rows: any[]; total: number }>;
  getRevenueRollup(): Promise<{ allTime: number; thisMonth: number }>;
  getPaymentsByStatusBreakdown(): Promise<Record<string, number>>;
  getTopOrganizationsByRevenue(limit?: number): Promise<any[]>;
  getActiveSubscriptionsWithPlans(): Promise<any[]>;
}

export class BillingRepository implements IBillingRepository {
  async getPlatformPayments(params: BillingPaymentsListQueryParams): Promise<{ rows: any[]; total: number }> {
    const where = new SqlWhere('pay."isDeleted" = false');
    if (params.status !== 'all') where.and('pay.status = ?::"PaymentStatus"', params.status);
    if (params.orgId) where.and('pay."organizationId" = ?', params.orgId);
    if (params.search) {
      where.search(['o.name', 'o.slug', 'c.title', 'cnt.email', 'pay."razorpayPaymentId"'], params.search);
    }
    if (params.dateFrom) where.and('pay."createdAt" >= ?', new Date(params.dateFrom));
    if (params.dateTo) where.and('pay."createdAt" <= ?', new Date(params.dateTo));
    const offset = pageOffset(params.page, params.limit);

    const countQuery = `
      SELECT COUNT(*)::int as count
      FROM payments pay
      JOIN organizations o ON pay."organizationId" = o.id
      LEFT JOIN contests c ON pay."contestId" = c.id
      LEFT JOIN contacts cnt ON pay."contactId" = cnt.id
      ${where.sql}
    `;

    const dataQuery = `
      SELECT
        pay.id,
        pay."organizationId",
        o.name as "organizationName",
        o.slug as "organizationSlug",
        pay."contestId",
        c.title as "contestTitle",
        COALESCE(cnt."firstName" || ' ' || COALESCE(cnt."lastName", ''), 'Unknown Payee') as "payeeName",
        COALESCE(cnt.email, 'unknown@contact.com') as "payeeEmail",
        pay.amount,
        pay.provider,
        pay."razorpayPaymentId",
        pay.status,
        pay."paidAt",
        pay."createdAt"
      FROM payments pay
      JOIN organizations o ON pay."organizationId" = o.id
      LEFT JOIN contests c ON pay."contestId" = c.id
      LEFT JOIN contacts cnt ON pay."contactId" = cnt.id
      ${where.sql}
      ORDER BY pay."createdAt" DESC
      LIMIT ${params.limit} OFFSET ${offset}
    `;

    const countResult = await queryMainDb(countQuery, where.params);
    const dataResult = await queryMainDb(dataQuery, where.params);

    return {
      rows: dataResult,
      total: countResult[0]?.count || 0,
    };
  }

  async getRevenueRollup(): Promise<{ allTime: number; thisMonth: number }> {
    const allTimeRows = await queryMainDb(`
      SELECT COALESCE(SUM(amount), 0)::bigint as total 
      FROM payments 
      WHERE status = 'SUCCESS' AND "isDeleted" = false
    `);

    const thisMonthRows = await queryMainDb(`
      SELECT COALESCE(SUM(amount), 0)::bigint as total 
      FROM payments 
      WHERE status = 'SUCCESS' AND "isDeleted" = false
        AND "createdAt" >= date_trunc('month', CURRENT_DATE)
    `);

    const allTimePaise = parseInt(allTimeRows[0]?.total || '0', 10);
    const thisMonthPaise = parseInt(thisMonthRows[0]?.total || '0', 10);

    return {
      allTime: allTimePaise / 100,
      thisMonth: thisMonthPaise / 100,
    };
  }

  async getPaymentsByStatusBreakdown(): Promise<Record<string, number>> {
    const rows = await queryMainDb(`
      SELECT status, COUNT(*)::int as count
      FROM payments
      WHERE "isDeleted" = false
      GROUP BY status
    `);

    const breakdown: Record<string, number> = {
      SUCCESS: 0,
      FAILED: 0,
      PENDING: 0,
      REFUNDED: 0,
    };

    for (const r of rows) {
      if (r.status in breakdown) {
        breakdown[r.status] = r.count;
      }
    }

    return breakdown;
  }

  async getTopOrganizationsByRevenue(limit = 5): Promise<any[]> {
    const rows = await queryMainDb(`
      SELECT
        pay."organizationId",
        o.name as "organizationName",
        o.slug as "organizationSlug",
        COALESCE(SUM(pay.amount), 0)::bigint as "totalPaise",
        COUNT(pay.id)::int as "paymentCount"
      FROM payments pay
      JOIN organizations o ON pay."organizationId" = o.id
      WHERE pay.status = 'SUCCESS' AND pay."isDeleted" = false AND o."isDeleted" = false
      GROUP BY pay."organizationId", o.name, o.slug
      ORDER BY "totalPaise" DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => ({
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      organizationSlug: r.organizationSlug,
      totalRevenue: parseInt(r.totalPaise || '0', 10) / 100,
      paymentCount: r.paymentCount,
    }));
  }

  async getActiveSubscriptionsWithPlans(): Promise<any[]> {
    return prisma.organizationSubscription.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: true },
    });
  }
}
