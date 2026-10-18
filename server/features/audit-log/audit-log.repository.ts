import { prisma } from '../../db/ops-prisma';
import { Prisma } from '@prisma/client';
import { AuditLogListQuery } from './audit-log.types';

export interface IAuditLogRepository {
  listAuditLogs(params: AuditLogListQuery): Promise<{ rows: any[]; total: number }>;
  listActions(): Promise<string[]>;
}

export class AuditLogRepository implements IAuditLogRepository {
  async listAuditLogs(params: AuditLogListQuery) {
    const { page, limit, action, actionPrefix, targetType, targetId, requestId, organizationId, actorId, actorName, targetLabel, dateFrom, dateTo } = params;

    const where: Prisma.PlatformAuditLogWhereInput = {
      // Exact match wins when both are present; actionPrefix only kicks in
      // when the caller picked a parent operation but no specific sub-action.
      ...(action
        ? { action }
        : actionPrefix
        ? { action: { startsWith: `${actionPrefix}.` } }
        : {}),
      ...(targetType && { targetType }),
      ...(targetId && { targetId }),
      ...(requestId && { requestId }),
      ...(organizationId && {
        OR: [
          { targetType: 'ORGANIZATION' as const, targetId: organizationId },
          { metadata: { path: ['organizationId'], equals: organizationId } },
        ],
      }),
      ...(actorId && { actorId }),
      // actorLabel/targetLabel are denormalized display strings (admin name,
      // organization name), so "contains" is the only way to search them —
      // there's no separate name column to exact-match against.
      ...(actorName && { actorLabel: { contains: actorName, mode: 'insensitive' } }),
      ...(targetLabel && { targetLabel: { contains: targetLabel, mode: 'insensitive' } }),
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      }),
    };

    const [rows, total] = await Promise.all([
      prisma.platformAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.platformAuditLog.count({ where }),
    ]);

    return { rows, total };
  }

  /** Every action that has ever been written — feeds the filter dropdowns. */
  async listActions() {
    const rows = await prisma.platformAuditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
    return rows.map((r) => r.action);
  }
}
export default AuditLogRepository;
