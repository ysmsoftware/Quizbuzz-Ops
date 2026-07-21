import { queryMainDb } from '../../db/main-db-pool';
import { prisma } from '../../db/ops-prisma';
import { generateUlid } from '../../utils/ulid';
import { OrgMemberDetail, OrgContestDetail, OrgParticipantDetail } from './organizations.types';

export class OrganizationsRepository {
  async getOrganizationsList(params: {
    page: number;
    limit: number;
    search?: string;
    status: 'all' | 'active' | 'suspended' | 'deleted';
  }): Promise<{ rows: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    
    // Status filters
    let statusFilter = '';
    if (params.status === 'active') {
      statusFilter = 'AND o."isActive" = true AND o."isDeleted" = false';
    } else if (params.status === 'suspended') {
      statusFilter = 'AND o."isActive" = false AND o."isDeleted" = false';
    } else if (params.status === 'deleted') {
      statusFilter = 'AND o."isDeleted" = true';
    } else {
      // Default: 'all' maps to active and suspended (excludes deleted)
      statusFilter = 'AND o."isDeleted" = false';
    }

    // Search filters
    let searchFilter = '';
    const sqlParams: any[] = [];
    if (params.search) {
      sqlParams.push(`%${params.search}%`);
      const searchIndex = sqlParams.length;
      searchFilter = `AND (o.name ILIKE $${searchIndex} OR o.slug ILIKE $${searchIndex})`;
    }

    const countQuery = `
      SELECT COUNT(*)::int as count 
      FROM organizations o
      WHERE 1=1 ${statusFilter} ${searchFilter}
    `;

    const dataQuery = `
      SELECT 
        o.id, o.name, o.slug, o."createdAt", o."isActive", o."isDeleted",
        (SELECT COUNT(*)::int FROM org_members WHERE "organizationId" = o.id) as "memberCount",
        (SELECT COUNT(*)::int FROM contests WHERE "organizationId" = o.id AND "isDeleted" = false) as "contestCount",
        (SELECT COUNT(*)::int FROM participants WHERE "organizationId" = o.id) as "participantCount",
        COALESCE(
          (SELECT email FROM admins a JOIN org_members om ON om."adminId" = a.id WHERE om."organizationId" = o.id AND om.role = 'OWNER' LIMIT 1),
          (SELECT email FROM contacts c WHERE c."organizationId" = o.id LIMIT 1),
          'unknown@org.com'
        ) as "ownerEmail"
      FROM organizations o
      WHERE 1=1 ${statusFilter} ${searchFilter}
      ORDER BY o."createdAt" DESC
      LIMIT ${params.limit} OFFSET ${offset}
    `;

    const countResult = await queryMainDb(countQuery, sqlParams);
    const dataResult = await queryMainDb(dataQuery, sqlParams);
    
    return {
      rows: dataResult,
      total: countResult[0]?.count || 0,
    };
  }

  async getOrganizationDetail(orgId: string): Promise<any | null> {
    const rows = await queryMainDb(`
      SELECT 
        o.id, o.name, o.slug, o."createdAt", o."isActive", o."isDeleted", o."onboardingStep", o."onboardingCompleted",
        (SELECT COUNT(*)::int FROM org_members WHERE "organizationId" = o.id) as "memberCount",
        (SELECT COUNT(*)::int FROM contests WHERE "organizationId" = o.id AND "isDeleted" = false) as "contestCount",
        (SELECT COUNT(*)::int FROM participants WHERE "organizationId" = o.id) as "participantCount",
        COALESCE(
          (SELECT a."firstName" || ' ' || a."lastName" FROM admins a JOIN org_members om ON om."adminId" = a.id WHERE om."organizationId" = o.id AND om.role = 'OWNER' LIMIT 1),
          (SELECT c."firstName" || ' ' || COALESCE(c."lastName", '') FROM contacts c WHERE c."organizationId" = o.id LIMIT 1),
          'Unknown Owner'
        ) as "ownerName",
        COALESCE(
          (SELECT email FROM admins a JOIN org_members om ON om."adminId" = a.id WHERE om."organizationId" = o.id AND om.role = 'OWNER' LIMIT 1),
          (SELECT email FROM contacts c WHERE c."organizationId" = o.id LIMIT 1),
          'unknown@org.com'
        ) as "ownerEmail"
      FROM organizations o
      WHERE o.id = $1 AND o."isDeleted" = false
    `, [orgId]);
    return rows[0] || null;
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
        c.duration,
        COALESCE(pc.amount, 0) as "registrationFee",
        c."createdAt",
        (SELECT COUNT(*)::int FROM participants WHERE "contestId" = c.id) as "participantCount"
      FROM contests c
      LEFT JOIN "PaymentConfig" pc ON pc."contestId" = c.id
      WHERE c."organizationId" = $1 AND c."isDeleted" = false
      ORDER BY c."startTime" DESC
    `, [orgId]);

    // Also get the SUCCESS payments count to compute actual revenue per contest
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
      duration: r.duration,
      registrationFee: r.registrationFee / 100, // paise to INR
      participantCount: r.participantCount,
      revenueCollected: revenueMap.get(r.id) || 0,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }

  async getOrganizationParticipants(orgId: string): Promise<OrgParticipantDetail[]> {
    const rows = await queryMainDb(`
      SELECT 
        p.id,
        p."registrationRef",
        c."firstName",
        c."lastName",
        c.email,
        c.phone,
        p.status,
        pay.status as "paymentStatus",
        COALESCE(pay.amount, 0) as "paymentAmount",
        p."createdAt" as "registeredAt"
      FROM participants p
      JOIN contacts c ON p."contactId" = c.id
      LEFT JOIN payments pay ON pay."participantId" = p.id
      WHERE p."organizationId" = $1
      ORDER BY p."createdAt" DESC
    `, [orgId]);

    return rows.map(r => ({
      id: r.id,
      registrationRef: r.registrationRef,
      firstName: r.firstName,
      lastName: r.lastName || '',
      email: r.email,
      phone: r.phone || '',
      status: r.status,
      paymentStatus: r.paymentStatus || 'FREE',
      paymentAmount: r.paymentAmount / 100, // paise to INR
      registeredAt: new Date(r.registeredAt).toISOString(),
    }));
  }

  async getOrganizationPayments(orgId: string): Promise<any[]> {
    const rows = await queryMainDb(`
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

    return rows.map(r => ({
      id: r.id,
      source: 'contest_fee',
      referenceId: r.referenceId || `TXN_${r.id}`,
      payeeName: r.payeeName,
      description: `Quiz Entry Fee: ${r.contestTitle}`,
      amount: r.amount / 100, // paise to INR
      status: 'PAID',
      paymentMethod: r.provider,
      date: new Date(r.date).toISOString(),
    }));
  }

  // --- OPS DATABASE OPERATOR ACTIONS (PRISMA) ---

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
}
export default OrganizationsRepository;
