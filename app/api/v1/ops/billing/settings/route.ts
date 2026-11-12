import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await invoicesController.getSettings();
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(req: Request) {
  try {
    return await invoicesController.saveSettings(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
