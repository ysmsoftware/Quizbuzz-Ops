import { institutionController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

// Read-only: how this organization uses institution mode (learners, groups, contests by mode, gradebook).
export async function GET(_req: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    return await institutionController.getOrgSummary(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
