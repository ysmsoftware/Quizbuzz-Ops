import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/ops-prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'paymentId query parameter is required' },
        { status: 400 }
      );
    }

    const payment = await prisma.opsPayment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, paidAt: true, refundReason: true },
    });

    if (!payment) {
      return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      },
    });
  } catch (error: any) {
    console.error('Error checking billing portal payment status:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error checking payment status' },
      { status: 500 }
    );
  }
}
