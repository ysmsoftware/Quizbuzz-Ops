import { OrganizationsController } from '../../../../../server/features/organizations/organizations.controller';
import { handleRouteError } from '../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const controller = new OrganizationsController();
    return await controller.getOrganizationsList(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
