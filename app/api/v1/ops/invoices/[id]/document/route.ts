import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await invoicesController.document((await context.params).id);
  } catch (err) {
    return handleRouteError(err);
  }
}
