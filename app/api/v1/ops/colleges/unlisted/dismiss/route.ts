import { collegesController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    return await collegesController.dismissUnlisted(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
