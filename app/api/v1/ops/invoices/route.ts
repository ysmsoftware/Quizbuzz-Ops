import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    return await invoicesController.list(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
