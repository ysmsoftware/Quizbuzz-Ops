import { listLeads } from '@/server/features/leads/leads.service';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    return await listLeads(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
