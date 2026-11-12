import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await invoicesController.recordPayment(req, (await context.params).id);
  } catch (err) {
    return handleRouteError(err);
  }
}
