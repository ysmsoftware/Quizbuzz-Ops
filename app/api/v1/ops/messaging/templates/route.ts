import { messagingController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await messagingController.getTemplates();
  } catch (err) {
    return handleRouteError(err);
  }
}
