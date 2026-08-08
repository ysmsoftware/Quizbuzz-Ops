import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';
import { withApiLogger } from '../../../../../../server/http/logger';

export const runtime = 'nodejs';

export const POST = withApiLogger('auth.logout', async () => {
  try {
    return await platformAuthController.logout();
  } catch (err) {
    return handleRouteError(err);
  }
});
