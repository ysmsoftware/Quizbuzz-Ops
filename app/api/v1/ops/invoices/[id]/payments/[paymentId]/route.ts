import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

/** The proof file. */
export async function GET(_req: Request, context: Ctx) {
  try {
    const { id, paymentId } = await context.params;
    return await invoicesController.proof(id, paymentId);
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Voids the payment. */
export async function DELETE(req: Request, context: Ctx) {
  try {
    const { id, paymentId } = await context.params;
    return await invoicesController.voidPayment(req, id, paymentId);
  } catch (err) {
    return handleRouteError(err);
  }
}
