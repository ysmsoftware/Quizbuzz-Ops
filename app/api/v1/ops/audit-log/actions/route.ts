import { auditLogController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await auditLogController.listActions();
  } catch (err) {
    return handleRouteError(err);
  }
}
