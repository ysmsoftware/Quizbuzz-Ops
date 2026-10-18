import { featureFlagsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

// Compare Ops with the main app's copy of this flag.
export async function GET(_req: Request, context: Ctx) {
  try {
    const { key } = await context.params;
    return await featureFlagsController.getSync(key);
  } catch (err) {
    return handleRouteError(err);
  }
}

// Repair: make the main app match Ops. Body: { extras?: 'keep' | 'adopt' | 'remove' } for grants only the main app has.
export async function POST(req: Request, context: Ctx) {
  try {
    const { key } = await context.params;
    return await featureFlagsController.repairSync(req, key);
  } catch (err) {
    return handleRouteError(err);
  }
}
