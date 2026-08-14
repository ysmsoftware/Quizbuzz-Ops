import { mainAppAuditLogController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    return await mainAppAuditLogController.listAuditLogs(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
