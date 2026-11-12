import { prisma } from '@/server/db/ops-prisma';
import { reconcileMandate, reconcileOrderPayment } from '@/server/features/invoices/reconcile-with-razorpay';
import { okResponse, errorResponse } from '@/server/http/envelope';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');
    const subscriptionId = searchParams.get('subscriptionId');

    // Auto-debit: done once Razorpay says the mandate is authorised.
    if (subscriptionId) {
      // The webhook may not have arrived yet (or the phone was paused); ask Razorpay, then answer from our rows.
      await reconcileMandate(subscriptionId).catch((err) => console.error('[status] mandate check failed:', err));
      const row = await prisma.razorpaySubscription.findUnique({ where: { id: subscriptionId }, select: { status: true } });
      if (!row) return errorResponse('Subscription not found', 'NOT_FOUND', null, 404);
      return okResponse({ subscriptionId, status: row.status }, 'Subscription status retrieved.');
    }

    if (!paymentId) {
      return errorResponse('paymentId query parameter is required', 'VALIDATION_ERROR', null, 400);
    }

    await reconcileOrderPayment(paymentId).catch((err) => console.error('[status] payment check failed:', err));
    const payment = await prisma.opsPayment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, paidAt: true, refundReason: true },
    });

    if (!payment) {
      return errorResponse('Payment not found', 'NOT_FOUND', null, 404);
    }

    return okResponse(
      {
        paymentId: payment.id,
        status: payment.status,
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      },
      'Payment status retrieved.'
    );
  } catch (error) {
    console.error('Error checking billing portal payment status:', error);
    return errorResponse('Internal server error checking payment status', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
