import { messagingController } from '../../../../../server/container';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

// Platform-wide message log: GET /api/v1/ops/messaging?page=&limit=&organizationId=&status=&channel=&template=&search=
export async function GET(req: Request) {
  try {
    return await messagingController.getMessages(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
