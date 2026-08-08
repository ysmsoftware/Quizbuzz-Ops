import { subscriptionsController } from '../../../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  context: { params: Promise<{ orgId: string; paymentId: string }> }
) {
  try {
    const { orgId, paymentId } = await context.params;
    return await subscriptionsController.resendReceipt(orgId, paymentId);
  } catch (err) {
    return handleRouteError(err);
  }
}
