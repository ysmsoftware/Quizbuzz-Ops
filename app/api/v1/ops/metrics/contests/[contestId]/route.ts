import { opsMetricsController } from '../../../../../../../server/container';
import { handleRouteError } from '../../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ contestId: string }> }
) {
  try {
    const { contestId } = await context.params;
    return await opsMetricsController.getContestSnapshot(contestId);
  } catch (err) {
    return handleRouteError(err);
  }
}
