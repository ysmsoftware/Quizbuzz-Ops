import { getSessionAdmin } from '../../http/auth-guard';
import { parseQueryParams } from '../../http/validation';
import { mainAppAuditLogListQuerySchema } from './audit-log-main-app.validator';
import { IMainAppAuditLogService, MainAppAuditLogService } from './audit-log-main-app.service';
import { okResponse } from '../../http/envelope';

export class MainAppAuditLogController {
  constructor(private service: IMainAppAuditLogService = new MainAppAuditLogService()) {}

  async listAuditLogs(req: Request) {
    // Read-only surface: any authenticated platform admin can view the audit trail.
    await getSessionAdmin();
    const query = parseQueryParams(req, mainAppAuditLogListQuerySchema);
    const result = await this.service.listAuditLogs(query);
    return okResponse(result, 'Main application audit log retrieved.');
  }
}
export default MainAppAuditLogController;
