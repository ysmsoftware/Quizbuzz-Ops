import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';
import { withApiLogger } from '../../../../../../server/http/logger';

export const runtime = 'nodejs';

export const POST = withApiLogger('auth.login', async (req) => {
  try {
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip');
    return await platformAuthController.login(req, ipAddress);
  } catch (err) {
    return handleRouteError(err);
  }
});
