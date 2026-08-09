import { featureFlagsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await context.params;
    return await featureFlagsController.listOrgOverrides(key);
  } catch (err) {
    return handleRouteError(err);
  }
}
