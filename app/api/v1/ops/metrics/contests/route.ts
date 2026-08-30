import { opsMetricsController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await opsMetricsController.listContests();
  } catch (err) {
    return handleRouteError(err);
  }
}
