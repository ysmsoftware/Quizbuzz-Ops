import { PlatformAuthController } from '../../../../../../server/features/platform-auth/platform-auth.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const controller = new PlatformAuthController();
    const userAgent = req.headers.get('user-agent');
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    return await controller.refresh(userAgent, ipAddress);
  } catch (err) {
    return handleRouteError(err);
  }
}
