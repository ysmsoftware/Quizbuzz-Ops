import { handleAccountRequest } from '@/server/features/invoices/billing-account';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    return await handleAccountRequest(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
