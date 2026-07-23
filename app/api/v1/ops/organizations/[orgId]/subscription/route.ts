import { subscriptionsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await subscriptionsController.getSubscription(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await subscriptionsController.assignPlan(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
