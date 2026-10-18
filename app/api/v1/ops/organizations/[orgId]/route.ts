import { organizationsController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.getOrganizationDetail(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}

// Edit name / logo. The slug is immutable (it is part of public URLs).
export async function PATCH(req: Request, context: Ctx) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.update(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}

// Soft delete (hidden, reversible, owner not notified). Body: { reason }.
export async function DELETE(req: Request, context: Ctx) {
  try {
    const { orgId } = await context.params;
    return await organizationsController.softDelete(req, orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
