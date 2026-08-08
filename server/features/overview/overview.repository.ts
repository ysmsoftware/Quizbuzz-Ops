import { queryMainDb } from '../../db/main-db-pool';
import { PlatformOverviewStats, OrgGrowthPoint, UpcomingContest, RecentOrg } from './overview.types';

export interface IOverviewRepository {
  getOrgStats(): Promise<{ total: number; active: number; suspended: number; deleted: number }>;
  getContestStats(): Promise<{ total: number; byStatus: Record<string, number> }>;
  getParticipantStats(): Promise<{ total: number }>;
  getRevenueStats(): Promise<{ allTime: number; thisMonth: number; currency: string }>;
  getOrgGrowth(weeks?: number): Promise<OrgGrowthPoint[]>;
  getUpcomingContests(days?: number): Promise<UpcomingContest[]>;
  getRecentOrgs(limit?: number): Promise<RecentOrg[]>;
}

export class OverviewRepository implements IOverviewRepository {
  async getOrgStats() {
    const rows = await queryMainDb(`
      SELECT 
        COUNT(CASE WHEN "isDeleted" = false THEN 1 END)::int as total,
        COUNT(CASE WHEN "isActive" = true AND "isDeleted" = false THEN 1 END)::int as active,
        COUNT(CASE WHEN "isActive" = false AND "isDeleted" = false THEN 1 END)::int as suspended,
        COUNT(CASE WHEN "isDeleted" = true THEN 1 END)::int as deleted
      FROM organizations
    `);
    const row = rows[0] || {};
    return {
      total: row.total || 0,
      active: row.active || 0,
      suspended: row.suspended || 0,
      deleted: row.deleted || 0,
    };
  }

  async getContestStats() {
    const rows = await queryMainDb(`
      SELECT status, COUNT(*)::int as count 
      FROM contests 
      WHERE "isDeleted" = false 
      GROUP BY status
    `);
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byStatus[r.status] = r.count;
      total += r.count;
    }
    return { total, byStatus };
  }

  async getParticipantStats() {
    const rows = await queryMainDb(`SELECT COUNT(*)::int as count FROM participants`);
    return { total: rows[0]?.count || 0 };
  }

  async getRevenueStats() {
    // Payment.amount is in paise. Divide by 100 to convert to INR.
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
      currency: 'INR',
    };
  }

  async getOrgGrowth(weeks = 12): Promise<OrgGrowthPoint[]> {
    const rows = await queryMainDb(`
      SELECT 
        to_char(date_trunc('week', "createdAt"), 'YYYY-"W"IW') as week,
        COUNT(*)::int as count
      FROM organizations
      WHERE "createdAt" >= CURRENT_DATE - INTERVAL '${weeks} weeks' AND "isDeleted" = false
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    return rows.map((r) => ({ week: r.week, count: r.count }));
  }

  async getUpcomingContests(days = 7): Promise<UpcomingContest[]> {
    const rows = await queryMainDb(`
      SELECT
        c.id, c.title, o.id as "organizationId", o.name as "organizationName", c."startTime",
        COALESCE(p.cnt, 0)::int as "participantCount"
      FROM contests c
      JOIN organizations o ON c."organizationId" = o.id
      LEFT JOIN (
        SELECT "contestId", COUNT(*)::int as cnt FROM participants GROUP BY "contestId"
      ) p ON c.id = p."contestId"
      WHERE c."isDeleted" = false
        AND c."startTime" >= NOW()
        AND c."startTime" <= NOW() + INTERVAL '${days} days'
      ORDER BY c."startTime" ASC
      LIMIT 10
    `);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      startTime: new Date(r.startTime).toISOString(),
      participantCount: r.participantCount,
    }));
  }

  async getRecentOrgs(limit = 5): Promise<RecentOrg[]> {
    const rows = await queryMainDb(`
      SELECT 
        o.id, o.name, o.slug, o."createdAt",
        COALESCE(a.email, c.email, 'unknown@org.com') as "ownerEmail"
      FROM organizations o
      LEFT JOIN org_members om ON om."organizationId" = o.id AND om.role = 'OWNER'
      LEFT JOIN admins a ON om."adminId" = a.id
      LEFT JOIN contacts c ON c."organizationId" = o.id
      WHERE o."isDeleted" = false
      ORDER BY o."createdAt" DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: new Date(r.createdAt).toISOString(),
      ownerEmail: r.ownerEmail,
    }));
  }
}
export default OverviewRepository;
