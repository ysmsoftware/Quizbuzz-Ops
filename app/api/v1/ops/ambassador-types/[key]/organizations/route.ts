import { ambassadorTypesController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await context.params;
    return await ambassadorTypesController.listOrgAccess(key);
  } catch (err) {
    return handleRouteError(err);
  }
}
