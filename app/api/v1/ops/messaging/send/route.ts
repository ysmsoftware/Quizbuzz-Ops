import { messagingController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    return await messagingController.sendMessage(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
