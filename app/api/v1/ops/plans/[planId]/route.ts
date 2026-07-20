import { PlansController } from '../../../../../../server/features/plans/plans.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await context.params;
    const controller = new PlansController();
    return await controller.getPlanById(planId);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await context.params;
    const controller = new PlansController();
    return await controller.updatePlan(req, planId);
  } catch (err) {
    return handleRouteError(err);
  }
}
