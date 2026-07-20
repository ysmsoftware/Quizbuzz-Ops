import { PlansController } from '../../../../../../../server/features/plans/plans.controller';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  context: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await context.params;
    const controller = new PlansController();
    return await controller.deactivatePlan(req, planId);
  } catch (err) {
    return handleRouteError(err);
  }
}
