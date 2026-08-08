import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';
import { withApiLogger } from '../../../../../../server/http/logger';

export const runtime = 'nodejs';

export const POST = withApiLogger('auth.login', async (req) => {
  try {
    return await platformAuthController.login(req);
  } catch (err) {
    return handleRouteError(err);
  }
});
