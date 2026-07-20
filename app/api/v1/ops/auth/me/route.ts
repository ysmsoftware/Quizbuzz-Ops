import { PlatformAuthController } from '../../../../../../server/features/platform-auth/platform-auth.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const controller = new PlatformAuthController();
    return await controller.me();
  } catch (err) {
    return handleRouteError(err);
  }
}
