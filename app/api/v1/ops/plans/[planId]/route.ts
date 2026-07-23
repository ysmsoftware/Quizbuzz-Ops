import { plansController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await context.params;
    return await plansController.getPlanById(planId);
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
    return await plansController.updatePlan(req, planId);
  } catch (err) {
    return handleRouteError(err);
  }
}
