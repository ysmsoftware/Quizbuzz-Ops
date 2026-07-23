import { subscriptionsController } from '../../../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function DELETE(
  req: Request,
  context: { params: Promise<{ orgId: string; overrideId: string }> }
) {
  try {
    const { orgId, overrideId } = await context.params;
    return await subscriptionsController.removeOverride(req, orgId, overrideId);
  } catch (err) {
    return handleRouteError(err);
  }
}
