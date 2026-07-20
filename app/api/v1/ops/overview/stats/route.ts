import { OverviewController } from '../../../../../../server/features/overview/overview.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const controller = new OverviewController();
    return await controller.getStats();
  } catch (err) {
    return handleRouteError(err);
  }
}
