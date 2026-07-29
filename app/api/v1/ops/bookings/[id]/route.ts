import { bookingsController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    return await bookingsController.getBookingById(req, id);
  } catch (err) {
    return handleRouteError(err);
  }
}
