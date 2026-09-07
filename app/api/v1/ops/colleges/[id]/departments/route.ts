import { collegesController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    return await collegesController.listDepartments(id);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    return await collegesController.createDepartment(req, id);
  } catch (err) {
    return handleRouteError(err);
  }
}
