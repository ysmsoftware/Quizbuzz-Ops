import { prisma } from '@/server/db/ops-prisma';
import { okResponse, errorResponse } from '@/server/http/envelope';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return errorResponse('paymentId query parameter is required', 'VALIDATION_ERROR', null, 400);
    }

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
  } catch (error: any) {
    console.error('Error checking billing portal payment status:', error);
    return errorResponse('Internal server error checking payment status', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
