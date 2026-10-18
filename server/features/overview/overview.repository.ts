import { queryMainDb } from '../../db/main-db-pool';
import { ownerEmailSql } from '../organizations/org-owner.sql';
import { PlatformOverviewStats, OrgGrowthPoint, UpcomingContest, RecentOrg } from './overview.types';

export interface IOverviewRepository {
  getOrgStats(): Promise<{ total: number; active: number; suspended: number; deleted: number }>;
  getContestStats(): Promise<{ total: number; byStatus: Record<string, number> }>;
  getParticipantStats(): Promise<{ total: number; byStatus: Record<string, number> }>;
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
    const rows = await queryMainDb(`SELECT status, COUNT(*)::int as count FROM participants GROUP BY status`);
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byStatus[r.status] = r.count;
      total += r.count;
    }
    return { total, byStatus };
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
    // One row per week, zero-filled: a week with no signups must appear as 0, not be skipped.
    // Timestamps are compared as UTC "timestamp without time zone", like the main app stores them.
    const rows = await queryMainDb(
      `
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', LOCALTIMESTAMP) - make_interval(weeks => $1::int - 1),
          date_trunc('week', LOCALTIMESTAMP),
          interval '1 week'
        ) AS w
      ),
      counts AS (
        SELECT date_trunc('week', "createdAt") AS w, COUNT(*)::int AS c
        FROM organizations
        WHERE "isDeleted" = false AND "createdAt" >= (SELECT MIN(w) FROM weeks)
        GROUP BY 1
      )
      SELECT to_char(weeks.w, 'IYYY-"W"IW') AS week, COALESCE(counts.c, 0)::int AS count
      FROM weeks LEFT JOIN counts USING (w)
      ORDER BY weeks.w ASC
      `,
      [weeks]
    );
    return rows.map((r) => ({ week: r.week, count: r.count }));
  }

  async getUpcomingContests(days = 7): Promise<UpcomingContest[]> {
    // "Upcoming" = something an operator should keep an eye on:
    //   - open for registration / about to start (PUBLISHED, REGISTRATION_CLOSED) within the horizon,
    //   - anything LIVE right now,
    //   - WINDOW contests whose window is open right now.
    // Drafts and cancelled contests never qualify.
    const rows = await queryMainDb(
      `
      SELECT
        c.id, c.title, c.status, c."timingMode", c."startTime", c."endTime",
        o.id as "organizationId", o.name as "organizationName",
        COALESCE(p.cnt, 0)::int as "participantCount"
      FROM contests c
      JOIN organizations o ON c."organizationId" = o.id
      LEFT JOIN (
        SELECT "contestId", COUNT(*)::int as cnt FROM participants GROUP BY "contestId"
      ) p ON c.id = p."contestId"
      WHERE c."isDeleted" = false
        AND o."isDeleted" = false
        AND c.status IN ('PUBLISHED', 'REGISTRATION_CLOSED', 'LIVE')
        AND (
          c.status = 'LIVE'
          OR (c."startTime" >= (NOW() AT TIME ZONE 'UTC')
              AND c."startTime" <= (NOW() AT TIME ZONE 'UTC') + make_interval(days => $1::int))
          OR (c."timingMode" = 'WINDOW'
              AND c."startTime" <= (NOW() AT TIME ZONE 'UTC')
              AND c."endTime" >= (NOW() AT TIME ZONE 'UTC'))
        )
      ORDER BY (c.status = 'LIVE') DESC, c."startTime" ASC
      LIMIT 10
      `,
      [days]
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      startTime: new Date(r.startTime).toISOString(),
      endTime: new Date(r.endTime).toISOString(),
      status: r.status,
      timingMode: r.timingMode,
      participantCount: r.participantCount,
    }));
  }

  async getRecentOrgs(limit = 5): Promise<RecentOrg[]> {
    const rows = await queryMainDb(`
      SELECT
        o.id, o.name, o.slug, o."logoUrl", o."planSlug", o."createdAt",
        ${ownerEmailSql('o')} as "ownerEmail"
      FROM organizations o
      WHERE o."isDeleted" = false
      ORDER BY o."createdAt" DESC
      LIMIT $1
    `, [limit]);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: new Date(r.createdAt).toISOString(),
      ownerEmail: r.ownerEmail,
      planSlug: r.planSlug ?? null,
      logoUrl: r.logoUrl ?? null,
    }));
  }
}
export default OverviewRepository;
