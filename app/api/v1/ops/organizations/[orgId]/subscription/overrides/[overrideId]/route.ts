import { SubscriptionsController } from '../../../../../../../../../server/features/subscriptions/subscriptions.controller';
import { handleRouteError } from '../../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function DELETE(
  req: Request,
  context: { params: Promise<{ orgId: string; overrideId: string }> }
) {
  try {
    const { orgId, overrideId } = await context.params;
    const controller = new SubscriptionsController();
    return await controller.removeOverride(req, orgId, overrideId);
  } catch (err) {
    return handleRouteError(err);
  }
}
