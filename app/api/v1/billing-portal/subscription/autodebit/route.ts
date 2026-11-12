import { prisma } from '@/server/db/ops-prisma';
import { verifyJwt, type BillingHandoffPayload } from '@/server/utils/jwt';
import { env } from '@/server/config/env';
import { handoffSecret } from '@/server/features/invoices/handoff-secret';
import { okResponse, errorResponse } from '@/server/http/envelope';
import { isFeatureEnabled } from '@/server/features/feature-flags/is-feature-enabled';
import { canBuyPlan } from '@/server/features/plans/can-buy-plan';
import { autoDebitCycle, startAutoDebit } from '@/server/features/autodebit/autodebit.service';
import { AppError } from '@/server/http/errors';
import { errorMessage } from '@/lib/errors';

/** Checkout's "Renew automatically": a Razorpay subscription the owner authorises in Razorpay's checkout. */
export async function POST(req: Request) {
  try {
    const { token, billingCycle } = await req.json();
    if (!token) return errorResponse('Handoff token is required', 'VALIDATION_ERROR', null, 400);
    if (typeof billingCycle !== 'string' || !autoDebitCycle(billingCycle)) {
      return errorResponse('Automatic payment is available for monthly and 6-month billing.', 'VALIDATION_ERROR', null, 400);
    }

    const secret = handoffSecret();
    if (!secret) return errorResponse('Billing is not available right now. Please contact support.', 'GATEWAY_NOT_CONFIGURED', null, 503);
    let payload: BillingHandoffPayload;
    try {
      payload = verifyJwt(token, secret);
    } catch (e) {
      return errorResponse(`Invalid or expired token: ${errorMessage(e)}`, 'UNAUTHENTICATED', null, 401);
    }
    const { organizationId, adminEmail, planSlug } = payload;
    if (!organizationId || !planSlug) return errorResponse('Invalid handoff payload', 'VALIDATION_ERROR', null, 400);

    if (!(await isFeatureEnabled('razorpay_gateway_active', organizationId)) || !(await isFeatureEnabled('auto_debit', organizationId))) {
      return errorResponse('Automatic renewal is switched off right now. Please pay once instead.', 'FEATURE_DISABLED', { featureKey: 'auto_debit' }, 403);
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: planSlug } });
    const own = await prisma.organizationSubscription.findUnique({ where: { organizationId }, select: { planId: true } });
    if (!plan || !canBuyPlan(plan, organizationId, own?.planId)) return errorResponse('Target plan not found or inactive', 'NOT_FOUND', null, 404);

    const row = await startAutoDebit({ organizationId, plan, cycle: billingCycle, adminEmail });
    return okResponse(
      {
        subscriptionId: row.id,
        keyId: env.RAZORPAY_KEY_ID || 'rzp_test_stubKey',
        planName: plan.name,
        amount: Number(row.amount),
        firstChargeAt: row.startAt?.toISOString() ?? null,
      },
      'Automatic payment set up. Authorise it in the Razorpay window.',
    );
  } catch (error) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, null, error.statusCode);
    console.error('Error setting up auto-debit:', error);
    return errorResponse('Payment gateway is unavailable right now. Please try again shortly.', 'GATEWAY_ERROR', null, 502);
  }
}
