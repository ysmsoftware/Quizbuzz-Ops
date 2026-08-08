import { messagingController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

// Renders a template+params combo without sending anything: POST /api/v1/ops/messaging/preview
export async function POST(req: Request) {
  try {
    return await messagingController.previewMessage(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
