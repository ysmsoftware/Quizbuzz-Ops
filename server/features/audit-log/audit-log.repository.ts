import { prisma } from '../../db/ops-prisma';
import { Prisma } from '@prisma/client';
import { AuditLogListQuery } from './audit-log.types';

export interface IAuditLogRepository {
  listAuditLogs(params: AuditLogListQuery): Promise<{ rows: any[]; total: number }>;
}

export class AuditLogRepository implements IAuditLogRepository {
  async listAuditLogs(params: AuditLogListQuery) {
    const { page, limit, action, targetType, targetId, actorId, dateFrom, dateTo } = params;

    const where: Prisma.PlatformAuditLogWhereInput = {
      ...(action && { action }),
      ...(targetType && { targetType }),
      ...(targetId && { targetId }),
      ...(actorId && { actorId }),
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
