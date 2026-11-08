import { subscriptionsController } from '../../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    return await subscriptionsController.cancelScheduledChange(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
