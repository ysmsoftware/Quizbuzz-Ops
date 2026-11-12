import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    return await invoicesController.issue(req, (await context.params).orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
