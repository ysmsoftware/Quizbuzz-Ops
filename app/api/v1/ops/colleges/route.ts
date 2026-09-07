import { collegesController } from '../../../../../server/container';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await collegesController.listColleges();
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    return await collegesController.createCollege(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
