import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST() {
  try {
    return await platformAuthController.logout();
  } catch (err) {
    return handleRouteError(err);
  }
}
