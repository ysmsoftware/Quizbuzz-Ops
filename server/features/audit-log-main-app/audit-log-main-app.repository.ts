import { queryMainDb } from '../../db/main-db-pool';
import { MainAppAuditLogListQuery } from './audit-log-main-app.types';

export interface IMainAppAuditLogRepository {
  listAuditLogs(params: MainAppAuditLogListQuery): Promise<{ rows: any[]; total: number }>;
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

    const conditions: string[] = ['1=1'];
    const sqlParams: any[] = [];

    const addParam = (value: any) => {
      sqlParams.push(value);
      return `$${sqlParams.length}`;
    };

    if (action) {
      conditions.push(`"action" = ${addParam(action)}`);
    } else if (actionPrefix) {
      conditions.push(`"action" LIKE ${addParam(`${actionPrefix}.%`)}`);
    }
    if (targetType) conditions.push(`"targetType" = ${addParam(targetType)}::"AuditTargetType"`);
    if (targetId) conditions.push(`"targetId" = ${addParam(targetId)}`);
    if (requestId) conditions.push(`"requestId" = ${addParam(requestId)}`);
    if (organizationId) conditions.push(`"organizationId" = ${addParam(organizationId)}`);
    if (actorId) conditions.push(`"actorId" = ${addParam(actorId)}`);
    if (actorName) conditions.push(`"actorLabel" ILIKE ${addParam(`%${actorName}%`)}`);
    if (targetLabel) conditions.push(`"targetLabel" ILIKE ${addParam(`%${targetLabel}%`)}`);
    if (dateFrom) conditions.push(`"createdAt" >= ${addParam(new Date(dateFrom))}`);
    if (dateTo) conditions.push(`"createdAt" <= ${addParam(new Date(dateTo))}`);

    const whereClause = conditions.join(' AND ');

    const countQuery = `SELECT COUNT(*)::int as count FROM audit_logs WHERE ${whereClause}`;
    const dataQuery = `
      SELECT id, "requestId", "organizationId", "actorId", "actorType", "actorLabel",
        action, "targetType", "targetId", "targetLabel", metadata, "ipAddress", "userAgent", "createdAt"
      FROM audit_logs
      WHERE ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    const [countResult, dataResult] = await Promise.all([
      queryMainDb(countQuery, sqlParams),
      queryMainDb(dataQuery, sqlParams),
    ]);

    return { rows: dataResult, total: countResult[0]?.count || 0 };
  }
}
export default MainAppAuditLogRepository;
