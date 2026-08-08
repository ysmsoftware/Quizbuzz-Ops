import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';
import { withApiLogger } from '../../../../../../server/http/logger';

export const runtime = 'nodejs';

export const GET = withApiLogger('auth.me', async () => {
  try {
    return await platformAuthController.me();
  } catch (err) {
    return handleRouteError(err);
  }
});
