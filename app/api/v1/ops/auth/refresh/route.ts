import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';
import { withApiLogger } from '../../../../../../server/http/logger';

export const runtime = 'nodejs';

export const POST = withApiLogger('auth.refresh', async (req) => {
  try {
    const userAgent = req.headers.get('user-agent');
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    return await platformAuthController.refresh(userAgent, ipAddress, req);
  } catch (err) {
    return handleRouteError(err);
  }
});
