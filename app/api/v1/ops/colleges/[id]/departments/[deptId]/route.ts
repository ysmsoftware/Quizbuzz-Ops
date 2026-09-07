import { collegesController } from '../../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; deptId: string }> }
) {
  try {
    const { id, deptId } = await context.params;
    return await collegesController.updateDepartment(req, id, deptId);
  } catch (err) {
    return handleRouteError(err);
  }
}
