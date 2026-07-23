import { payoutsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await payoutsController.getOrganizationPayoutAccount(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
