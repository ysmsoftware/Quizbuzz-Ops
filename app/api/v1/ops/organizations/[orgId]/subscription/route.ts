import { SubscriptionsController } from '../../../../../../../server/features/subscriptions/subscriptions.controller';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    const controller = new SubscriptionsController();
    return await controller.getSubscription(orgId);
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
    const controller = new SubscriptionsController();
    return await controller.assignPlan(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
