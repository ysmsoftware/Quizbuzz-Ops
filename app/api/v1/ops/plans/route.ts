import { PlansController } from '../../../../../server/features/plans/plans.controller';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const controller = new PlansController();
    return await controller.getPlans(req);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const controller = new PlansController();
    return await controller.createPlan(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
