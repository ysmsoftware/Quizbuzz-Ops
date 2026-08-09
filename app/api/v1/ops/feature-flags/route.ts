import { featureFlagsController } from '../../../../../server/container';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await featureFlagsController.listFlags();
  } catch (err) {
    return handleRouteError(err);
  }
}
