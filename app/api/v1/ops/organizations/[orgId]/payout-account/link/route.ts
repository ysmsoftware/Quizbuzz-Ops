import { payoutsController } from '../../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await payoutsController.attachLinkedAccount(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
