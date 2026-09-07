import { appSettingsController } from '../../../../../server/container';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await appSettingsController.getAppLogo();
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    return await appSettingsController.uploadAppLogo(req);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE() {
  try {
    return await appSettingsController.removeAppLogo();
  } catch (err) {
    return handleRouteError(err);
  }
}
