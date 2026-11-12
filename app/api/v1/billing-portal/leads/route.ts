import { createLeadFromToken } from '@/server/features/leads/leads.service';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    return await createLeadFromToken(req);
  } catch (err) {
    return handleRouteError(err);
  }
}
