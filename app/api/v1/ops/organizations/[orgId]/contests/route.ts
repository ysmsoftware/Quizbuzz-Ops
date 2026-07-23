import { organizationsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.getContests(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
