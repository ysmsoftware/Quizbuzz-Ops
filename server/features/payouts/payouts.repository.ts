import { queryMainDb } from '../../db/main-db-pool';
import { prisma } from '../../db/ops-prisma';
import { PayoutAccountsListQueryParams, RouteTransfersListQueryParams } from './payouts.types';

export interface IPayoutsRepository {
  getPlatformPayoutAccounts(params: PayoutAccountsListQueryParams): Promise<{ rows: any[]; total: number }>;
  getOrganizationPayoutAccount(orgId: string): Promise<any | null>;
  getOrganizationTransferSummary(orgId: string): Promise<any>;
  getOrganizationRouteTransfers(orgId: string, params: RouteTransfersListQueryParams): Promise<{ rows: any[]; total: number }>;
  getPlatformRouteTransfers(params: RouteTransfersListQueryParams): Promise<{ rows: any[]; total: number }>;
  attachLinkedAccount(orgId: string, razorpayLinkedAccountId: string): Promise<any | null>;
  updatePayoutStatus(orgId: string, status: string, reason: string): Promise<any | null>;
  getOrganizationDetail(orgId: string): Promise<any | null>;
}

export class PayoutsRepository implements IPayoutsRepository {
  async getPlatformPayoutAccounts(params: PayoutAccountsListQueryParams): Promise<{ rows: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const sqlParams: any[] = [];

    let statusFilter = '';
    if (params.status !== 'all') {
      sqlParams.push(params.status);
      statusFilter = `AND pa.status = $${sqlParams.length}`;
    }

    let searchFilter = '';
    if (params.search) {
      sqlParams.push(`%${params.search}%`);
      const idx = sqlParams.length;
      searchFilter = `AND (o.name ILIKE $${idx} OR o.slug ILIKE $${idx} OR pa."accountName" ILIKE $${idx} OR pa."accountEmail" ILIKE $${idx})`;
    }

    const countQuery = `
      SELECT COUNT(*)::int as count
      FROM organization_payout_accounts pa
      JOIN organizations o ON pa."organizationId" = o.id
      WHERE o."isDeleted" = false ${statusFilter} ${searchFilter}
    `;

    const dataQuery = `
      SELECT
        pa.id,
        pa."organizationId",
        o.name as "organizationName",
        o.slug as "organizationSlug",
        pa."accountName",
        pa."accountEmail",
        pa."contactNumber",
        pa.status,
        pa."onboardingMode",
        pa."razorpayLinkedAccountId",
        pa."activatedAt",
        pa."createdAt",
        (
          SELECT COUNT(*)::int
          FROM payment_route_transfers prt
          WHERE prt."organizationId" = pa."organizationId" AND prt.status = 'PENDING'
        ) as "pendingTransferCount"
      FROM organization_payout_accounts pa
      JOIN organizations o ON pa."organizationId" = o.id
      WHERE o."isDeleted" = false ${statusFilter} ${searchFilter}
      ORDER BY 
        CASE WHEN pa.status = 'PENDING' AND pa."razorpayLinkedAccountId" IS NULL THEN 0 ELSE 1 END ASC,
        pa."createdAt" ASC
      LIMIT ${params.limit} OFFSET ${offset}
    `;

    const countResult = await queryMainDb(countQuery, sqlParams);
    const dataResult = await queryMainDb(dataQuery, sqlParams);

    // Fetch latest payout contact notes from ops DB (prisma)
    const orgIds = dataResult.map((r) => r.organizationId);
    let noteMap = new Map<string, { createdAt: string; body: string }>();

    if (orgIds.length > 0) {
      const notes = await prisma.organizationNote.findMany({
        where: {
          organizationId: { in: orgIds },
          tags: { has: 'payout' },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const note of notes) {
        if (!noteMap.has(note.organizationId)) {
          noteMap.set(note.organizationId, {
            createdAt: note.createdAt.toISOString(),
            body: note.body,
          });
        }
      }
    }

    const rows = dataResult.map((r) => {
      const lastNote = noteMap.get(r.organizationId);
      return {
        ...r,
        lastContactedAt: lastNote ? lastNote.createdAt : null,
        lastContactNote: lastNote ? lastNote.body : null,
        hasContactInfo: Boolean(r.accountName && r.accountEmail),
      };
    });

    return {
      rows,
      total: countResult[0]?.count || 0,
    };
  }

  async getOrganizationPayoutAccount(orgId: string): Promise<any | null> {
    const rows = await queryMainDb(
      `
      SELECT
        pa.id,
        pa."organizationId",
        pa."accountName",
        pa."accountEmail",
        pa."contactNumber",
        pa.status,
        pa."onboardingMode",
        pa."razorpayLinkedAccountId",
        pa."activatedAt",
        pa."createdAt",
        pa."updatedAt"
      FROM organization_payout_accounts pa
      WHERE pa."organizationId" = $1
    `,
      [orgId]
    );

    return rows[0] || null;
  }

  async getOrganizationTransferSummary(orgId: string): Promise<any> {
    const rows = await queryMainDb(
      `
      SELECT
        COUNT(CASE WHEN status = 'PROCESSED' THEN 1 END)::int as processed,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int as failed,
        COUNT(CASE WHEN status = 'PENDING' AND "failureReason" = 'no_active_payout_account' THEN 1 END)::int as "pendingNoAccount",
        COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN "transferAmount" ELSE 0 END), 0)::bigint as "totalTransferredPaise"
      FROM payment_route_transfers
      WHERE "organizationId" = $1
    `,
      [orgId]
    );

    const row = rows[0] || {};
    return {
      processed: row.processed || 0,
      failed: row.failed || 0,
      pendingNoAccount: row.pendingNoAccount || 0,
      totalTransferredAllTime: parseInt(row.totalTransferredPaise || '0', 10) / 100,
      currency: 'INR',
    };
  }

  async getOrganizationRouteTransfers(
    orgId: string,
    params: RouteTransfersListQueryParams
  ): Promise<{ rows: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const sqlParams: any[] = [orgId];

    let statusFilter = '';
    if (params.status !== 'all') {
      sqlParams.push(params.status);
      statusFilter = `AND prt.status = $${sqlParams.length}`;
    }

    const countQuery = `
      SELECT COUNT(*)::int as count
      FROM payment_route_transfers prt
      WHERE prt."organizationId" = $1 ${statusFilter}
    `;

    const dataQuery = `
      SELECT
        prt.id,
        prt."paymentId",
        prt."razorpayPaymentId",
        prt."razorpayTransferId",
        COALESCE(c.title, 'Contest Fee') as "contestTitle",
        prt."grossAmount",
        prt."platformFeeAmount",
        prt."transferAmount",
        prt.currency,
        prt.status,
        prt."failureReason",
        prt."processedAt",
        prt."createdAt"
      FROM payment_route_transfers prt
      LEFT JOIN payments p ON prt."paymentId" = p.id
      LEFT JOIN contests c ON p."contestId" = c.id
      WHERE prt."organizationId" = $1 ${statusFilter}
      ORDER BY prt."createdAt" DESC
      LIMIT ${params.limit} OFFSET ${offset}
    `;

    const countResult = await queryMainDb(countQuery, sqlParams);
    const dataResult = await queryMainDb(dataQuery, sqlParams);

    return {
      rows: dataResult,
      total: countResult[0]?.count || 0,
    };
  }

  async getPlatformRouteTransfers(
    params: RouteTransfersListQueryParams
  ): Promise<{ rows: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const sqlParams: any[] = [];

    let statusFilter = '';
    if (params.status !== 'all') {
      sqlParams.push(params.status);
      statusFilter = `AND prt.status = $${sqlParams.length}`;
    }

    let reasonFilter = '';
    if (params.reason) {
      sqlParams.push(params.reason);
      reasonFilter = `AND prt."failureReason" = $${sqlParams.length}`;
    }

    const countQuery = `
      SELECT COUNT(*)::int as count
      FROM payment_route_transfers prt
      JOIN organizations o ON prt."organizationId" = o.id
      WHERE o."isDeleted" = false ${statusFilter} ${reasonFilter}
    `;

    const dataQuery = `
      SELECT
        prt.id,
        prt."organizationId",
        o.name as "organizationName",
        prt."paymentId",
        prt."razorpayPaymentId",
        prt."razorpayTransferId",
        COALESCE(c.title, 'Contest Fee') as "contestTitle",
        prt."grossAmount",
        prt."platformFeeAmount",
        prt."transferAmount",
        prt.currency,
        prt.status,
        prt."failureReason",
        prt."processedAt",
        prt."createdAt"
      FROM payment_route_transfers prt
      JOIN organizations o ON prt."organizationId" = o.id
      LEFT JOIN payments p ON prt."paymentId" = p.id
      LEFT JOIN contests c ON p."contestId" = c.id
      WHERE o."isDeleted" = false ${statusFilter} ${reasonFilter}
      ORDER BY prt."createdAt" DESC
      LIMIT ${params.limit} OFFSET ${offset}
    `;

    const countResult = await queryMainDb(countQuery, sqlParams);
    const dataResult = await queryMainDb(dataQuery, sqlParams);

    return {
      rows: dataResult,
      total: countResult[0]?.count || 0,
    };
  }

  async attachLinkedAccount(orgId: string, razorpayLinkedAccountId: string): Promise<any | null> {
    const rows = await queryMainDb(
      `
      UPDATE organization_payout_accounts
      SET
        status = 'ACTIVE',
        "razorpayLinkedAccountId" = $1,
        "activatedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "organizationId" = $2
      RETURNING *
    `,
      [razorpayLinkedAccountId, orgId]
    );

    return rows[0] || null;
  }

  async updatePayoutStatus(orgId: string, status: string, reason: string): Promise<any | null> {
    try {
      const rows = await queryMainDb(
        `
        UPDATE organization_payout_accounts
        SET
          status = $1,
          "statusReason" = $2,
          "updatedAt" = NOW()
        WHERE "organizationId" = $3
        RETURNING *
      `,
        [status, reason, orgId]
      );
      return rows[0] || null;
    } catch (err) {
      const rows = await queryMainDb(
        `
        UPDATE organization_payout_accounts
        SET
          status = $1,
          "updatedAt" = NOW()
        WHERE "organizationId" = $2
        RETURNING *
      `,
        [status, orgId]
      );
      return rows[0] || null;
    }
  }

  async getOrganizationDetail(orgId: string): Promise<any | null> {
    const rows = await queryMainDb(
      `
      SELECT id, name, slug FROM organizations WHERE id = $1 AND "isDeleted" = false
    `,
      [orgId]
    );
    return rows[0] || null;
  }
}

export default PayoutsRepository;
