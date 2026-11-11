/**
 * Razorpay sends a phone here (a POST, sometimes a GET) when a UPI app finishes and the checkout page
 * can't be called back. Nothing in the body is trusted or read: it only forwards to the checkout page,
 * which checks the payment with the server. Only the two known query values are carried over.
 */
const TOKEN = /^[A-Za-z0-9._-]{10,2048}$/;
const RESUME = /^(paymentId|subscriptionId)=[A-Za-z0-9_-]{4,64}$/;

function back(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') ?? '';
  const resume = searchParams.get('resume') ?? '';
  const to = new URLSearchParams();
  if (TOKEN.test(token)) to.set('token', token);
  if (RESUME.test(resume)) to.set('resume', resume);
  // A relative Location, so it stays on whatever host the browser used (we may sit behind a proxy).
  return new Response(null, { status: 303, headers: { Location: `/billing/checkout?${to.toString()}`, 'Cache-Control': 'no-store' } });
}

export const GET = back;
export const POST = back;
