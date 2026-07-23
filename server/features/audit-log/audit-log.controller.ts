import { getSessionAdmin } from '../../http/auth-guard';
import { parseQueryParams } from '../../http/validation';
import { auditLogListQuerySchema } from './audit-log.validator';
import { IAuditLogService, AuditLogService } from './audit-log.service';
import { okResponse } from '../../http/envelope';

export class AuditLogController {
  constructor(private service: IAuditLogService = new AuditLogService()) {}

  async listAuditLogs(req: Request) {
    // Read-only surface: any authenticated platform admin can view the audit trail,
    // including SUPPORT, who needs suspension/note history for their own workflow.
    await getSessionAdmin();
    const query = parseQueryParams(req, auditLogListQuerySchema);
    const result = await this.service.listAuditLogs(query);
    return okResponse(result, 'Audit log retrieved.');
  }
}
export default AuditLogController;
