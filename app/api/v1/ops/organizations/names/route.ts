import { organizationsController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

// GET /api/v1/ops/organizations/names?ids=a,b,c → { a: "Org A", b: "Org B" }
// One query to label a page of rows, instead of one org-detail request per distinct org.
export async function GET(req: Request) {
  try {
    return await organizationsController.getNames(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
