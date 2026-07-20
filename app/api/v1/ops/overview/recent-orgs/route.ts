import { OverviewController } from '../../../../../../server/features/overview/overview.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const controller = new OverviewController();
    return await controller.getRecentOrgs(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
