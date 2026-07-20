import { OrganizationsController } from '../../../../../../server/features/organizations/organizations.controller';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    const controller = new OrganizationsController();
    return await controller.getOrganizationDetail(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
