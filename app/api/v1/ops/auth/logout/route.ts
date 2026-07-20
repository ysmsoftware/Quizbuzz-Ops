import { PlatformAuthController } from '../../../../../../server/features/platform-auth/platform-auth.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const controller = new PlatformAuthController();
    return await controller.logout();
  } catch (err) {
    return handleRouteError(err);
  }
}
