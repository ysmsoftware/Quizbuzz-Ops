import { organizationsController } from '../../../../../server/container';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    return await organizationsController.getOrganizationsList(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
