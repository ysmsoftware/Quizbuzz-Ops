import { updateLead } from '@/server/features/leads/leads.service';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await updateLead(req, (await context.params).id);
  } catch (err) {
    return handleRouteError(err);
  }
}
