import { PlatformAuthController } from '../../../../../../server/features/platform-auth/platform-auth.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const controller = new PlatformAuthController();
    return await controller.login(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
