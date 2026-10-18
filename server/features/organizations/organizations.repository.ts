import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryMainDb, mainDbPool } from '../../db/main-db-pool';
import { prisma } from '../../db/ops-prisma';
import { generateUlid } from '../../utils/ulid';
import { SqlWhere, pageOffset } from '../../db/sql';
import { paiseToRupees } from '../../../lib/format';
import { INSTITUTION_FLAG_KEYS } from '../../../lib/constants/institution';
import { effectiveOptInKeysSql } from '../institution/institution.repository';
import { ownerNameSql, ownerEmailSql } from './org-owner.sql';
import type { OrgSortField } from './organizations.validator';
import { OrgMemberDetail, OrgContestDetail, OrgParticipantDetail } from './organizations.types';

export interface OrgListParams {
  page: number;
  limit: number;
  search?: string;
  status: 'all' | 'active' | 'suspended' | 'deleted';
  /** Main-app plan slug (organizations."planSlug"); 'starter' also matches orgs with no plan recorded. */
  planSlug?: string;
  /** Institution flag key, or 'any'. */
  feature?: string;
  sort?: OrgSortField;
  order?: 'asc' | 'desc';
}

export interface OrgParticipantsParams {
  page: number;
  limit: number;
  search?: string;
  contestId?: string;
  status?: string;
  /** A main-app PaymentStatus, or 'FREE' for participants with no payment row. */
  paymentStatus?: string;
}

export interface CreateOrgWithOwnerInput {
  name: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
}

// Whitelist: the only strings that ever reach ORDER BY.
const ORG_SORT_SQL: Record<OrgSortField, string> = {
  createdAt: 'o."createdAt"',
  name: 'LOWER(o.name)',
  memberCount: '"memberCount"',
  contestCount: '"contestCount"',
  participantCount: '"participantCount"',
};

export interface IOrganizationsRepository {
  getOrganizationsList(params: OrgListParams): Promise<{ rows: any[]; total: number }>;
  getOrganizationDetail(orgId: string, opts?: { includeDeleted?: boolean }): Promise<any | null>;
  getOrganizationNames(ids: string[]): Promise<Record<string, string>>;
  isSlugTaken(slug: string): Promise<boolean>;
  findAdminByEmail(email: string): Promise<{ id: string; isActive: boolean; isDeleted: boolean } | null>;
  createOrganizationWithOwner(input: CreateOrgWithOwnerInput): Promise<{ organizationId: string; adminId: string; createdAdmin: boolean }>;
  updateMainDbOrganization(orgId: string, fields: { name?: string; logoUrl?: string | null }): Promise<void>;
  setMainDbOrganizationDeleted(orgId: string, deleted: boolean, isActiveAfter: boolean): Promise<void>;
  hasOpenSuspension(orgId: string): Promise<boolean>;
  getOwnerContact(orgId: string): Promise<{ name: string; email: string } | null>;
  getOrganizationMembers(orgId: string): Promise<OrgMemberDetail[]>;
  getOrganizationContests(orgId: string): Promise<OrgContestDetail[]>;
  getOrganizationParticipants(orgId: string, params: OrgParticipantsParams): Promise<{ rows: OrgParticipantDetail[]; total: number }>;
  getOrganizationPayments(orgId: string): Promise<any[]>;
  getOrganizationNotes(orgId: string): Promise<any[]>;
  createOrganizationNote(orgId: string, authorId: string, body: string, tags: string[]): Promise<any>;
  getOrganizationSuspensions(orgId: string): Promise<any[]>;
  createOrganizationSuspension(orgId: string, reason: string, suspendedById: string): Promise<any>;
  closeOrganizationSuspension(orgId: string, liftedById: string, liftReason?: string): Promise<any>;
  updateMainDbOrganizationStatus(orgId: string, isActive: boolean): Promise<void>;
  getSubscriptionsForOrgs(orgIds: string[]): Promise<any[]>;
  getSubscriptionForOrg(orgId: string): Promise<any | null>;
  getPlatformAdmin(adminId: string): Promise<any | null>;
  getUsageSnapshot(
    orgId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    contestsUsedThisCycle: number;
    maxParticipantsInAContest: number;
    maxQuestionsInAContest: number;
    memberCountUsed: number;
  }>;
}

export class OrganizationsRepository implements IOrganizationsRepository {
  async getOrganizationsList(params: OrgListParams): Promise<{ rows: any[]; total: number }> {
    const where = new SqlWhere();
    if (params.status === 'active') where.and('o."isActive" = true AND o."isDeleted" = false');
    else if (params.status === 'suspended') where.and('o."isActive" = false AND o."isDeleted" = false');
    else if (params.status === 'deleted') where.and('o."isDeleted" = true');
    else where.and('o."isDeleted" = false'); // 'all' = active + suspended, never deleted
    if (params.search) {
      where.search(['o.name', 'o.slug', ownerEmailSql('o')], params.search);
    }
    if (params.planSlug) {
      // An org with no recorded plan is on the free starter plan (see OrganizationsService).
      if (params.planSlug === 'starter') where.and(`(o."planSlug" = 'starter' OR o."planSlug" IS NULL)`);
      else where.and('o."planSlug" = ?', params.planSlug);
    }

    if (params.feature) {
      const has = effectiveOptInKeysSql('o.id', where.bind(INSTITUTION_FLAG_KEYS));
      if (params.feature === 'any') where.and(`cardinality(${has}) > 0`);
      else where.and(`${has} @> ARRAY[?]::text[]`, params.feature);
    }

    const sortSql = ORG_SORT_SQL[params.sort ?? 'createdAt'];
    const direction = params.order === 'asc' ? 'ASC' : 'DESC';

    const countQuery = `SELECT COUNT(*)::int as count FROM organizations o ${where.sql}`;
    // The select list needs the flag keys too; bind them after every filter so the count query's params stay minimal.
    const dataKeysParam = `$${where.params.length + 1}`;

    const dataQuery = `
      SELECT
        o.id, o.name, o.slug, o."logoUrl", o."planSlug", o."createdAt", o."isActive", o."isDeleted",
        (SELECT COUNT(*)::int FROM org_members WHERE "organizationId" = o.id) as "memberCount",
        (SELECT COUNT(*)::int FROM contests WHERE "organizationId" = o.id AND "isDeleted" = false) as "contestCount",
        (SELECT COUNT(*)::int FROM participants WHERE "organizationId" = o.id) as "participantCount",
        ${ownerNameSql('o')} as "ownerName",
        ${ownerEmailSql('o')} as "ownerEmail",
        ${effectiveOptInKeysSql('o.id', dataKeysParam)} as features
      FROM organizations o
      ${where.sql}
      ORDER BY ${sortSql} ${direction}, o.id ASC
      LIMIT ${params.limit} OFFSET ${pageOffset(params.page, params.limit)}
    `;

    const [countResult, dataResult] = await Promise.all([
      queryMainDb(countQuery, where.params),
      queryMainDb(dataQuery, [...where.params, INSTITUTION_FLAG_KEYS]),
    ]);

    return {
      rows: dataResult,
      total: countResult[0]?.count || 0,
    };
  }

  async getOrganizationDetail(orgId: string, opts: { includeDeleted?: boolean } = {}): Promise<any | null> {
    const rows = await queryMainDb(`
      SELECT 
        o.id, o.name, o.slug, o."logoUrl", o."planSlug", o."createdAt", o."isActive", o."isDeleted", o."onboardingStep", o."onboardingCompleted",
        (SELECT COUNT(*)::int FROM org_members WHERE "organizationId" = o.id) as "memberCount",
        (SELECT COUNT(*)::int FROM contests WHERE "organizationId" = o.id AND "isDeleted" = false) as "contestCount",
        (SELECT COUNT(*)::int FROM participants WHERE "organizationId" = o.id) as "participantCount",
        ${ownerNameSql('o')} as "ownerName",
        ${ownerEmailSql('o')} as "ownerEmail"
      FROM organizations o
      WHERE o.id = $1 ${opts.includeDeleted ? '' : 'AND o."isDeleted" = false'}
    `, [orgId]);
    return rows[0] || null;
  }

  async getOrganizationNames(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const rows = await queryMainDb<{ id: string; name: string }>(
      `SELECT id, name FROM organizations WHERE id = ANY($1::text[])`,
      [ids]
    );
    return Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    // Includes soft-deleted orgs: organizations.slug is UNIQUE across all rows.
    const rows = await queryMainDb(`SELECT 1 FROM organizations WHERE slug = $1 LIMIT 1`, [slug]);
    return rows.length > 0;
  }

  async findAdminByEmail(email: string) {
    const rows = await queryMainDb(
      `SELECT id, "isActive", "isDeleted" FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    return rows[0] ?? null;
  }

  /**
   * Mirrors the main app's own signup transaction (admin-auth.repository.ts#createWithOrganization):
   * admin (if new) + organization at onboarding step IDENTITY + OWNER membership, all-or-nothing.
   * A brand-new owner gets a random, unusable password; they set a real one through the main
   * app's "Forgot password" flow (the welcome email says so).
   */
  async createOrganizationWithOwner(input: CreateOrgWithOwnerInput) {
    const existing = await this.findAdminByEmail(input.ownerEmail);
    if (existing && (existing.isDeleted || !existing.isActive)) {
      throw new Error('An account with this email exists but is inactive');
    }

    const orgId = generateUlid();
    const memberId = generateUlid();
    const adminId = existing?.id ?? generateUlid();
    const passwordHash = existing ? null : await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const client = await mainDbPool.connect();
    try {
      await client.query('BEGIN');
      if (!existing) {
        await client.query(
          `INSERT INTO admins (id, email, "passwordHash", "firstName", "lastName", "isActive", "isDeleted",
                               "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, true, false, true, NOW(), NOW(), NOW())`,
          [adminId, input.ownerEmail, passwordHash, input.ownerFirstName, input.ownerLastName]
        );
      }
      await client.query(
        `INSERT INTO organizations (id, name, slug, "isActive", "isDeleted", "onboardingStep", "onboardingCompleted", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, false, 'IDENTITY', false, NOW(), NOW())`,
        [orgId, input.name, input.slug]
      );
      await client.query(
        `INSERT INTO org_members (id, "organizationId", "adminId", role, "invitedAt", "acceptedAt", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'OWNER', NOW(), NOW(), true, NOW(), NOW())`,
        [memberId, orgId, adminId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { organizationId: orgId, adminId, createdAdmin: !existing };
  }

  async updateMainDbOrganization(orgId: string, fields: { name?: string; logoUrl?: string | null }): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.name !== undefined) {
      params.push(fields.name);
      sets.push(`name = $${params.length}`);
    }
    if (fields.logoUrl !== undefined) {
      params.push(fields.logoUrl);
      sets.push(`"logoUrl" = $${params.length}`);
    }
    if (sets.length === 0) return;
    params.push(orgId);
    await queryMainDb(`UPDATE organizations SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length}`, params);
  }

  async setMainDbOrganizationDeleted(orgId: string, deleted: boolean, isActiveAfter: boolean): Promise<void> {
    await queryMainDb(
      `UPDATE organizations SET "isDeleted" = $1, "isActive" = $2, "updatedAt" = NOW() WHERE id = $3`,
      [deleted, isActiveAfter, orgId]
    );
  }

  async hasOpenSuspension(orgId: string): Promise<boolean> {
    const open = await prisma.organizationSuspension.findFirst({ where: { organizationId: orgId, liftedAt: null }, select: { id: true } });
    return !!open;
  }

  /**
   * Strict owner lookup for actually SENDING mail — unlike getOrganizationDetail's
   * "ownerEmail" (which falls back to any contact, then to a placeholder
   * 'unknown@org.com' purely so the admin UI always has something to render),
   * this returns null when there's no real OrgMemberRole.OWNER row, so
   * callers (OrgOwnerNotifier) can skip sending rather than emailing a
   * placeholder address. Per the decision this system's lifecycle emails go
   * to the OWNER only — not every active admin/member on the org.
   */
  async getOwnerContact(orgId: string): Promise<{ name: string; email: string } | null> {
    const rows = await queryMainDb<{ name: string; email: string }>(`
      SELECT a."firstName" || ' ' || COALESCE(a."lastName", '') as name, a.email
      FROM admins a
      JOIN org_members om ON om."adminId" = a.id
      WHERE om."organizationId" = $1
        AND om.role = 'OWNER'
        AND om."isActive" = true
        AND a."isActive" = true
        AND a."isDeleted" = false
      LIMIT 1
    `, [orgId]);
    if (!rows[0]) return null;
    return { name: rows[0].name.trim(), email: rows[0].email };
  }

  async getOrganizationMembers(orgId: string): Promise<OrgMemberDetail[]> {
    const rows = await queryMainDb(`
      SELECT 
        om.id,
        om."adminId",
        a."firstName" || ' ' || a."lastName" as name,
        a.email,
        om.role,
        om."createdAt" as "joinedDate"
      FROM org_members om
      JOIN admins a ON om."adminId" = a.id
      WHERE om."organizationId" = $1 AND om."isActive" = true
      ORDER BY om.role = 'OWNER' DESC, om."createdAt" ASC
    `, [orgId]);
    
    return rows.map(r => ({
      id: r.id,
      adminId: r.adminId,
      name: r.name,
      email: r.email,
      role: r.role === 'OWNER' ? 'Owner' : r.role === 'ADMIN' ? 'Admin' : 'Viewer',
      joinedDate: new Date(r.joinedDate).toISOString(),
    }));
  }

  async getOrganizationContests(orgId: string): Promise<OrgContestDetail[]> {
    const rows = await queryMainDb(`
      SELECT 
        c.id,
        c.title,
        c.slug,
        c.status,
        c."startTime",
        c."endTime",
        c."registrationDeadline",
        c.duration,
        c."maxParticipants",
        c."timingMode",
        c.audience,
        c."questionSelection",
        COALESCE(pc.amount, 0) as "registrationFee",
        c."createdAt",
        (SELECT COUNT(*)::int FROM participants WHERE "contestId" = c.id) as "participantCount"
      FROM contests c
      LEFT JOIN "PaymentConfig" pc ON pc."contestId" = c.id
      WHERE c."organizationId" = $1 AND c."isDeleted" = false
      ORDER BY c."startTime" DESC
    `, [orgId]);

    const revenueRows = await queryMainDb(`
      SELECT "contestId", COALESCE(SUM(amount), 0)::bigint as total
      FROM payments
      WHERE "organizationId" = $1 AND status = 'SUCCESS' AND "isDeleted" = false
      GROUP BY "contestId"
    `, [orgId]);

    const revenueMap = new Map<string, number>();
    for (const r of revenueRows) {
      revenueMap.set(r.contestId, parseInt(r.total, 10) / 100);
    }

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      status: r.status,
      startTime: new Date(r.startTime).toISOString(),
      endTime: new Date(r.endTime).toISOString(),
      registrationDeadline: new Date(r.registrationDeadline).toISOString(),
      duration: r.duration,
      maxParticipants: r.maxParticipants ?? null,
      timingMode: r.timingMode,
      audience: r.audience,
      questionSelection: r.questionSelection,
      // PaymentConfig.amount is stored in whole rupees (not paise) — see
      // contest.validator.ts / payment.service.ts's `* 100` conversion when
      // building the Razorpay order. No conversion needed here; dividing by
      // 100 previously turned a ₹1 fee into ₹0.01 on this tab.
      registrationFee: r.registrationFee,
      participantCount: r.participantCount,
      revenueCollected: revenueMap.get(r.id) || 0,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }

  async getOrganizationParticipants(orgId: string, params: OrgParticipantsParams) {
    const where = new SqlWhere().and('p."organizationId" = ?', orgId);
    if (params.contestId) where.and('p."contestId" = ?', params.contestId);
    if (params.status) where.and('p.status = ?::"ParticipantStatus"', params.status);
    if (params.paymentStatus === 'FREE') where.and('pay.id IS NULL');
    else if (params.paymentStatus) where.and('pay.status = ?::"PaymentStatus"', params.paymentStatus);
    if (params.search) {
      where.search(
        ['c."firstName" || \' \' || COALESCE(c."lastName", \'\')', 'c.email', 'c.phone', 'p."registrationRef"', 'ct.title'],
        params.search
      );
    }

    const from = `
      FROM participants p
      JOIN contacts c ON p."contactId" = c.id
      JOIN contests ct ON p."contestId" = ct.id
      LEFT JOIN payments pay ON pay."participantId" = p.id
      ${where.sql}
    `;

    const [countRows, rows] = await Promise.all([
      queryMainDb(`SELECT COUNT(*)::int AS count ${from}`, where.params),
      queryMainDb(
        `
        SELECT
          p.id, p."contestId", ct.title AS "contestTitle", p."registrationRef",
          c."firstName", c."lastName", c.email, c.phone,
          p.status, pay.status AS "paymentStatus", COALESCE(pay.amount, 0) AS "paymentAmount",
          p."createdAt" AS "registeredAt"
        ${from}
        ORDER BY p."createdAt" DESC, p.id ASC
        LIMIT ${params.limit} OFFSET ${pageOffset(params.page, params.limit)}
        `,
        where.params
      ),
    ]);

    return {
      total: countRows[0]?.count ?? 0,
      rows: rows.map((r) => ({
        id: r.id,
        contestId: r.contestId,
        contestTitle: r.contestTitle,
        registrationRef: r.registrationRef,
        firstName: r.firstName,
        lastName: r.lastName || '',
        email: r.email,
        phone: r.phone || '',
        status: r.status,
        paymentStatus: r.paymentStatus || 'FREE',
        // payments.amount is stored in paise.
        paymentAmount: paiseToRupees(r.paymentAmount),
        registeredAt: new Date(r.registeredAt).toISOString(),
      })),
    };
  }

  async getOrganizationPayments(orgId: string): Promise<any[]> {
    const contestFeeRows = await queryMainDb(`
      SELECT
        pay.id,
        pay.amount,
        pay.status,
        pay."paidAt" as date,
        pay.provider,
        pay."razorpayPaymentId" as "referenceId",
        c."firstName" || ' ' || COALESCE(c."lastName", '') as "payeeName",
        cont.title as "contestTitle"
      FROM payments pay
      JOIN contacts c ON pay."contactId" = c.id
      JOIN contests cont ON pay."contestId" = cont.id
      WHERE pay."organizationId" = $1 AND pay.status = 'SUCCESS' AND pay."isDeleted" = false
      ORDER BY pay."paidAt" DESC
    `, [orgId]);

    const contestFeePayments = contestFeeRows.map(r => ({
      id: r.id,
      source: 'contest_fee' as const,
      referenceId: r.referenceId || `TXN_${r.id}`,
      payeeName: r.payeeName,
      description: `Quiz Entry Fee: ${r.contestTitle}`,
      amount: r.amount / 100, // paise to INR
      status: 'PAID' as const,
      paymentMethod: r.provider,
      date: new Date(r.date).toISOString(),
    }));

    // Subscription payments live in the ops DB, not the main DB — a fully
    // separate source that this ledger previously never queried, so ops
    // admins had no visibility into subscription receipts here at all.
    const subscriptionPayments = await prisma.opsPayment.findMany({
      where: {
        organizationId: orgId,
        purpose: 'subscription',
        status: { in: ['PAID', 'REFUNDED'] },
      },
      orderBy: { paidAt: 'desc' },
    });

    const planIds = [...new Set(subscriptionPayments.map((p) => p.planId).filter((id): id is string => !!id))];
    const plans = planIds.length
      ? await prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } } })
      : [];
    const planNameById = new Map(plans.map((p) => [p.id, p.name]));

    const mappedSubscriptionPayments = subscriptionPayments.map((p) => {
      const planName = (p.planId && planNameById.get(p.planId)) || 'Subscription';
      const cycleLabel = p.billingCycle === 'ANNUAL' ? 'Annual' : p.billingCycle === 'MONTHLY' ? 'Monthly' : '';
      return {
        id: p.id,
        source: 'subscription' as const,
        referenceId: p.razorpayPaymentId || p.razorpayOrderId || `TXN_${p.id}`,
        payeeName: 'Organization Admin',
        description: `Subscription: ${planName}${cycleLabel ? ` (${cycleLabel})` : ''}`,
        amount: Number(p.amount),
        status: p.status as 'PAID' | 'REFUNDED',
        paymentMethod: 'Razorpay',
        date: (p.paidAt || p.createdAt).toISOString(),
        // Full price breakdown — this is what makes the row a self-contained
        // receipt instead of just a final total, mirroring OpsPayment itself.
        baseAmount: p.baseAmount != null ? Number(p.baseAmount) : undefined,
        gatewayFeeAmount: p.gatewayFeeAmount != null ? Number(p.gatewayFeeAmount) : undefined,
        gstAmount: p.gstAmount != null ? Number(p.gstAmount) : undefined,
        billingCycle: p.billingCycle || undefined,
        periodMonths: p.periodMonths || undefined,
        planName,
      };
    });

    return [...mappedSubscriptionPayments, ...contestFeePayments].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async getOrganizationNotes(orgId: string) {
    return prisma.organizationNote.findMany({
      where: { organizationId: orgId },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrganizationNote(orgId: string, authorId: string, body: string, tags: string[]) {
    return prisma.organizationNote.create({
      data: {
        id: generateUlid(),
        organizationId: orgId,
        authorId,
        body,
        tags,
      },
      include: { author: true },
    });
  }

  async getOrganizationSuspensions(orgId: string) {
    return prisma.organizationSuspension.findMany({
      where: { organizationId: orgId },
      orderBy: { suspendedAt: 'desc' },
    });
  }

  async createOrganizationSuspension(orgId: string, reason: string, suspendedById: string) {
    return prisma.organizationSuspension.create({
      data: {
        id: generateUlid(),
        organizationId: orgId,
        reason,
        suspendedById,
      },
    });
  }

  async closeOrganizationSuspension(orgId: string, liftedById: string, liftReason?: string) {
    const latestSuspension = await prisma.organizationSuspension.findFirst({
      where: { organizationId: orgId, liftedAt: null },
      orderBy: { suspendedAt: 'desc' },
    });

    if (latestSuspension) {
      return prisma.organizationSuspension.update({
        where: { id: latestSuspension.id },
        data: {
          liftedById,
          liftedAt: new Date(),
          liftReason: liftReason || 'Suspension lifted.',
        },
      });
    }
    return null;
  }

  async updateMainDbOrganizationStatus(orgId: string, isActive: boolean): Promise<void> {
    await queryMainDb(`
      UPDATE organizations 
      SET "isActive" = $1, "updatedAt" = NOW() 
      WHERE id = $2
    `, [isActive, orgId]);
  }

  async getSubscriptionsForOrgs(orgIds: string[]): Promise<any[]> {
    return prisma.organizationSubscription.findMany({
      where: { organizationId: { in: orgIds } },
      include: { plan: true },
    });
  }

  async getSubscriptionForOrg(orgId: string): Promise<any | null> {
    return prisma.organizationSubscription.findUnique({
      where: { organizationId: orgId },
      include: { plan: true },
    });
  }

  async getPlatformAdmin(adminId: string): Promise<any | null> {
    return prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });
  }

  /**
   * Real, cycle-scoped usage numbers — replaces the old client-side
   * `getUsageSnapshot()` in lib/api/organizations.ts, which counted
   * every contest the org had EVER created (not scoped to the billing
   * period) and summed participants across all contests against a
   * PER-CONTEST limit. This mirrors exactly what the main app's own
   * enforcement (src/common/plan-entitlements.ts) checks against:
   *  - contestsUsedThisCycle: same `createdAt BETWEEN periodStart AND
   *    periodEnd` window the contests-per-cycle check uses.
   *  - maxParticipantsInAContest / maxQuestionsInAContest: the ceiling is
   *    per-contest, not an org-wide total, so what actually matters for
   *    "how close is this org to hitting it" is their single fullest
   *    contest — not scoped to the cycle, since a contest created in an
   *    earlier cycle can still be actively accepting registrations.
   *  - memberCountUsed: same `isActive: true` count
   *    assertCanInviteMember() uses (includes pending invites).
   */
  async getUsageSnapshot(
    orgId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    contestsUsedThisCycle: number;
    maxParticipantsInAContest: number;
    maxQuestionsInAContest: number;
    memberCountUsed: number;
  }> {
    const rows = await queryMainDb(
      `
      SELECT
        (
          SELECT COUNT(*)::int FROM contests
          WHERE "organizationId" = $1 AND "isDeleted" = false
            AND "createdAt" BETWEEN $2 AND $3
        ) AS "contestsUsedThisCycle",
        (
          SELECT COALESCE(MAX(pc), 0)::int FROM (
            SELECT COUNT(*) AS pc
            FROM participants p
            JOIN contests c ON c.id = p."contestId"
            WHERE c."organizationId" = $1 AND c."isDeleted" = false
            GROUP BY p."contestId"
          ) t
        ) AS "maxParticipantsInAContest",
        (
          SELECT COALESCE(MAX(qc), 0)::int FROM (
            SELECT COUNT(*) AS qc
            FROM contest_questions cq
            JOIN contests c ON c.id = cq."contestId"
            WHERE c."organizationId" = $1 AND c."isDeleted" = false
            GROUP BY cq."contestId"
          ) t
        ) AS "maxQuestionsInAContest",
        (
          SELECT COUNT(*)::int FROM org_members
          WHERE "organizationId" = $1 AND "isActive" = true
        ) AS "memberCountUsed"
      `,
      [orgId, periodStart, periodEnd]
    );

    const row = rows[0] ?? {};
    return {
      contestsUsedThisCycle: row.contestsUsedThisCycle ?? 0,
      maxParticipantsInAContest: row.maxParticipantsInAContest ?? 0,
      maxQuestionsInAContest: row.maxQuestionsInAContest ?? 0,
      memberCountUsed: row.memberCountUsed ?? 0,
    };
  }
}
export default OrganizationsRepository;
