import { featureFlagsController } from '../../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function PUT(
  req: Request,
  context: { params: Promise<{ key: string; orgId: string }> }
) {
  try {
    const { key, orgId } = await context.params;
    return await featureFlagsController.setOrgOverride(req, key, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ key: string; orgId: string }> }
) {
  try {
    const { key, orgId } = await context.params;
    return await featureFlagsController.removeOrgOverride(req, key, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
