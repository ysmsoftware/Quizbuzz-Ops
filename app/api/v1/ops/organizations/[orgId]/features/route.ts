import { featureFlagsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

// Every per-org flag with this organization's effective state, why, and what blocks it.
export async function GET(_req: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    return await featureFlagsController.getOrgFeatures(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
