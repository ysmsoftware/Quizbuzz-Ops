import { prisma } from '../../db/ops-prisma';
import { Prisma } from '@prisma/client';
import { AuditLogListQuery } from './audit-log.types';

export interface IAuditLogRepository {
  listAuditLogs(params: AuditLogListQuery): Promise<{ rows: any[]; total: number }>;
}

export class AuditLogRepository implements IAuditLogRepository {
  async listAuditLogs(params: AuditLogListQuery) {
    const { page, limit, action, actionPrefix, targetType, targetId, actorId, actorName, targetLabel, dateFrom, dateTo } = params;

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
}
export default AuditLogRepository;
