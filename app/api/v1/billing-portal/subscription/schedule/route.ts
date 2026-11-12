import { prisma } from '@/server/db/ops-prisma';
import { verifyJwt, type BillingHandoffPayload } from '@/server/utils/jwt';
import { handoffSecret } from '@/server/features/invoices/handoff-secret';
import { okResponse, errorResponse } from '@/server/http/envelope';
import { canBuyPlan } from '@/server/features/plans/can-buy-plan';
import { changeTiming, scheduleChange } from '@/server/features/subscriptions/plan-change';
import { isValidBillingCycle } from '@/lib/pricing/subscriptionPricing';
import { AppError } from '@/server/http/errors';
import { errorMessage } from '@/lib/errors';

/** Checkout's "Schedule change": a downgrade or shorter cycle, starting when the paid period ends. */
export async function POST(req: Request) {
  try {
    const { token, billingCycle } = await req.json();
    if (!token) return errorResponse('Handoff token is required', 'VALIDATION_ERROR', null, 400);
    if (!isValidBillingCycle(billingCycle)) return errorResponse('billingCycle must be MONTHLY, HALF_YEARLY or ANNUAL', 'VALIDATION_ERROR', null, 400);
    const secret = handoffSecret();
    if (!secret) return errorResponse('Billing is not available right now. Please contact support.', 'GATEWAY_NOT_CONFIGURED', null, 503);
    let payload: BillingHandoffPayload;
    try {
      payload = verifyJwt(token, secret);
    } catch (e) {
      return errorResponse(`Invalid or expired token: ${errorMessage(e)}`, 'UNAUTHENTICATED', null, 401);
    }
    const { organizationId, adminEmail, adminName, planSlug } = payload;
    if (!organizationId || !planSlug) return errorResponse('Invalid handoff payload', 'VALIDATION_ERROR', null, 400);

    const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: planSlug } });
    const current = await prisma.organizationSubscription.findUnique({ where: { organizationId }, include: { plan: true } });
    if (!plan || !canBuyPlan(plan, organizationId, current?.planId)) return errorResponse('Target plan not found or inactive', 'NOT_FOUND', null, 404);
    if (!current || changeTiming(current, { plan, cycle: billingCycle }) !== 'period_end') {
      return errorResponse('This change starts now. Pay for it instead.', 'PAY_INSTEAD', null, 409);
    }
    await scheduleChange(organizationId, plan.id, billingCycle, { id: null, email: adminEmail || 'owner', name: adminName || 'Organization owner', role: 'ORG_ADMIN via billing-portal' }, 'Owner chose it at checkout');
    return okResponse({ on: current.currentPeriodEnd.toISOString() }, 'Change scheduled.');
  } catch (error) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, null, error.statusCode);
    console.error('Error scheduling a plan change:', error);
    return errorResponse('Internal server error', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
