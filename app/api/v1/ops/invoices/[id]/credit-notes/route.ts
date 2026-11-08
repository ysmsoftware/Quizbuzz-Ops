import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

/** Refund and/or credit note against this invoice. Super admin only. */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return await invoicesController.creditNote(req, id);
  } catch (err) {
    return handleRouteError(err);
  }
}
