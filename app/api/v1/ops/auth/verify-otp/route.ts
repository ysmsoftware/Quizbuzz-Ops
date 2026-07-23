import { platformAuthController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const userAgent = req.headers.get('user-agent');
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    return await platformAuthController.verifyOtp(req, userAgent, ipAddress);
  } catch (err) {
    return handleRouteError(err);
  }
}
