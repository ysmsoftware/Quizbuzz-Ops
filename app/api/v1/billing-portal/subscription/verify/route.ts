import crypto from 'crypto';
import { prisma } from '@/server/db/ops-prisma';
import { env } from '@/server/config/env';
import { okResponse, errorResponse } from '@/server/http/envelope';

/**
 * Called by the browser once Razorpay's checkout.js `handler` fires.
 * This is a UX signal only — it verifies the *payment* signature
 * (HMAC(orderId|paymentId, keySecret)) and, if valid, moves the order from
 * CREATED to PENDING so the admin sees "confirming" instead of "created".
 * It is never allowed to write PAID — only the real Razorpay webhook
 * (server-to-server, its own dedicated secret) does that.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return errorResponse(
        'razorpayOrderId, razorpayPaymentId and razorpaySignature are required',
        'VALIDATION_ERROR',
        null,
        400
      );
    }

    const keySecret = env.RAZORPAY_KEY_SECRET || '';
    if (!keySecret) {
      return errorResponse('Payment gateway is not configured', 'GATEWAY_NOT_CONFIGURED', null, 503);
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(razorpaySignature);
    const isValid =
      expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!isValid) {
      return errorResponse('Payment signature verification failed', 'INVALID_SIGNATURE', null, 400);
    }

    // Guarded: only ever moves CREATED -> PENDING. If the webhook already
    // raced ahead and marked this PAID/FAILED, or another verify call
    // already moved it to PENDING, this matches zero rows and is a no-op —
    // not an error, since the true status is whatever the webhook says.
    try {
      await prisma.opsPayment.update({
        where: { razorpayOrderId, status: 'CREATED' },
        data: { status: 'PENDING', razorpayPaymentId, razorpaySignature },
      });
    } catch (e: any) {
      if (e?.code !== 'P2025') throw e;
    }

    return okResponse({ verified: true }, 'Payment signature verified.');
  } catch (error: any) {
    console.error('Error verifying billing portal payment signature:', error);
    return errorResponse('Internal server error verifying payment', 'INTERNAL_SERVER_ERROR', null, 500);
  }
}
