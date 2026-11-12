import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const { id, paymentId } = await context.params;
    return await invoicesController.receipt(id, paymentId);
  } catch (err) {
    return handleRouteError(err);
  }
}
