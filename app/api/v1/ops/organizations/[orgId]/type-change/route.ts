import { organizationsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

// What switching the org to ?to=<type> would change (flags, open contests). Read-only.
export async function GET(req: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.previewTypeChange(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
