import { organizationsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.reactivate(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
