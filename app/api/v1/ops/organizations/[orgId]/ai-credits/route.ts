import { organizationsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

/** Gives the org one-time bonus AI credits (never reset monthly). */
export async function POST(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.grantAiBonusCredits(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
