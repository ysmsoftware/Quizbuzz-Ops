import { queryMainDb } from '../../db/main-db-pool';
import { SqlWhere, pageOffset } from '../../db/sql';
import { MainAppAuditLogListQuery } from './audit-log-main-app.types';

export interface IMainAppAuditLogRepository {
  listAuditLogs(params: MainAppAuditLogListQuery): Promise<{ rows: any[]; total: number }>;
  listActions(): Promise<string[]>;
}

/**
 * Read-only — queries the main app's own `audit_logs` table over the
 * existing cross-DB pool (queryMainDb), the same pattern
 * organizations.repository.ts already uses for main-app reads. This app
 * never writes to that table.
 */
export class MainAppAuditLogRepository implements IMainAppAuditLogRepository {
  async listAuditLogs(params: MainAppAuditLogListQuery) {
    const {
      page,
      limit,
      action,
      actionPrefix,
      targetType,
      targetId,
      requestId,
      organizationId,
      actorId,
      actorName,
      targetLabel,
      dateFrom,
      dateTo,
    } = params;

    const where = new SqlWhere();
    if (action) where.and('"action" = ?', action);
    else if (actionPrefix) where.prefix('"action"', actionPrefix);
    if (targetType) where.and('"targetType" = ?::"AuditTargetType"', targetType);
    if (targetId) where.and('"targetId" = ?', targetId);
    if (requestId) where.and('"requestId" = ?', requestId);
    if (organizationId) where.and('"organizationId" = ?', organizationId);
    if (actorId) where.and('"actorId" = ?', actorId);
    if (actorName) where.search(['"actorLabel"'], actorName);
    if (targetLabel) where.search(['"targetLabel"'], targetLabel);
    if (dateFrom) where.and('"createdAt" >= ?', new Date(dateFrom));
    if (dateTo) where.and('"createdAt" <= ?', new Date(dateTo));

    const countQuery = `SELECT COUNT(*)::int as count FROM audit_logs ${where.sql}`;
    const dataQuery = `
      SELECT id, "requestId", "organizationId", "actorId", "actorType", "actorLabel",
        action, "targetType", "targetId", "targetLabel", metadata, "ipAddress", "userAgent", "createdAt"
      FROM audit_logs
      ${where.sql}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${pageOffset(page, limit)}
    `;

    const [countResult, dataResult] = await Promise.all([
      queryMainDb(countQuery, where.params),
      queryMainDb(dataQuery, where.params),
    ]);

    return { rows: dataResult, total: countResult[0]?.count || 0 };
  }

  /** Every action in the table — the main app can add new ones without this app knowing. */
  async listActions() {
    const rows = await queryMainDb('SELECT DISTINCT action FROM audit_logs ORDER BY action', []);
    return rows.map((r: { action: string }) => r.action);
  }
}
export default MainAppAuditLogRepository;
