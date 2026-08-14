import { ambassadorTypesController } from '../../../../../server/container';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await ambassadorTypesController.listTypes();
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    return await ambassadorTypesController.createType(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
