import { subscriptionsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

/** Moves everyone on this plan to another. dryRun (the default) only counts them. */
export async function POST(req: Request, context: { params: Promise<{ planId: string }> }) {
  try {
    const { planId } = await context.params;
    return await subscriptionsController.migrateSubscribers(req, planId);
  } catch (err) {
    return handleRouteError(err);
  }
}
