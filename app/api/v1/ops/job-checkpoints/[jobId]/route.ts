import { jobCheckpointsController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    return await jobCheckpointsController.getJobTimeline(jobId);
  } catch (err) {
    return handleRouteError(err);
  }
}
