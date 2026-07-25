import { messagingController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return await messagingController.retryMessage(id);
  } catch (err) {
    return handleRouteError(err);
  }
}
