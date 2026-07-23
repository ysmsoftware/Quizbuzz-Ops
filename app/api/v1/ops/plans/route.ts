import { plansController } from '../../../../../server/container';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    return await plansController.getPlans(req);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    return await plansController.createPlan(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
