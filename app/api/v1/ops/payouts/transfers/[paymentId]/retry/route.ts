import { payoutsController } from '../../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await context.params;
    return await payoutsController.retryTransfer(req, paymentId);
  } catch (err) {
    return handleRouteError(err);
  }
}
