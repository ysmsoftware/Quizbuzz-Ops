import { IAuditLogRepository, AuditLogRepository } from './audit-log.repository';
import { AuditLogListQuery, AuditLogListResult } from './audit-log.types';

export interface IAuditLogService {
  listAuditLogs(params: AuditLogListQuery): Promise<AuditLogListResult>;
}

export class AuditLogService implements IAuditLogService {
  constructor(private repo: IAuditLogRepository = new AuditLogRepository()) {}

  async listAuditLogs(params: AuditLogListQuery): Promise<AuditLogListResult> {
    const { rows, total } = await this.repo.listAuditLogs(params);

    return {
      data: rows.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        actorId: r.actorId,
        actorLabel: r.actorLabel,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: r.targetLabel,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  }
}
export default AuditLogService;
