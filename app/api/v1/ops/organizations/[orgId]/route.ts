import { organizationsController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.getOrganizationDetail(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}

// Soft delete (hidden, reversible, owner not notified). Body: { reason }.
export async function DELETE(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.softDelete(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
