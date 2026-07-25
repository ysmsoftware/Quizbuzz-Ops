import { NextRequest } from 'next/server';
import { messagingController } from '../../../../../../server/container';
import { handleRouteError } from '../../../../../../server/http/errors';
import { ValidationError } from '../../../../../../server/http/errors';

export const runtime = 'nodejs';

// organizationId passed as a query param: POST /api/v1/ops/messaging/retry-failed?organizationId=...
export async function POST(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get('organizationId');
    if (!orgId) throw new ValidationError({ organizationId: 'Required' }, 'organizationId query param is required');
    return await messagingController.retryFailedMessages(orgId);
  } catch (err) {
    return handleRouteError(err);
  }
}
