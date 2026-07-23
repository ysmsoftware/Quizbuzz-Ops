import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    return await platformAuthController.login(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
