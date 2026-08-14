import { IMainAppAuditLogRepository, MainAppAuditLogRepository } from './audit-log-main-app.repository';
import { MainAppAuditLogListQuery, MainAppAuditLogListResult } from './audit-log-main-app.types';

export interface IMainAppAuditLogService {
  listAuditLogs(params: MainAppAuditLogListQuery): Promise<MainAppAuditLogListResult>;
}

export class MainAppAuditLogService implements IMainAppAuditLogService {
  constructor(private repo: IMainAppAuditLogRepository = new MainAppAuditLogRepository()) {}

  async listAuditLogs(params: MainAppAuditLogListQuery): Promise<MainAppAuditLogListResult> {
    const { rows, total } = await this.repo.listAuditLogs(params);

    return {
      data: rows.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        organizationId: r.organizationId,
        actorId: r.actorId,
        actorType: r.actorType,
        actorLabel: r.actorLabel,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: r.targetLabel,
        metadata: r.metadata,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  }
}
export default MainAppAuditLogService;
