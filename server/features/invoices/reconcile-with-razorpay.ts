import { prisma } from '@/server/db/ops-prisma';
import { razorpayAuth, razorpayCall } from '@/server/lib/razorpay';
import { settleCapture } from '@/server/features/invoices/settle-capture';
import { reconcileRow } from '@/server/features/autodebit/autodebit.service';

/**
 * The webhook is the normal way a payment gets settled. On a phone it can lag or never arrive in time
 * (the page was paused while a UPI app was in front), so every status poll also asks Razorpay directly.
 * Both routes settle through the same code, so whichever comes first wins and the other changes nothing.
 */

const CHECK_ACTOR = { id: null, email: 'razorpay', name: 'Razorpay status check', role: 'razorpay-reconcile' };
const THROTTLE_MS = 4000;

// ponytail: per-process throttle; with several ops instances Razorpay may see a few extra lookups.
const lastCheck = new Map<string, number>();
function due(key: string): boolean {
  const now = Date.now();
  if (now - (lastCheck.get(key) ?? 0) < THROTTLE_MS) return false;
  lastCheck.set(key, now);
  if (lastCheck.size > 5000) lastCheck.clear();
  return true;
}

/** A one-time order: if Razorpay shows a captured payment for the full amount, settle it like the webhook would. */
export async function reconcileOrderPayment(opsPaymentId: string): Promise<void> {
  if (!razorpayAuth() || !due(opsPaymentId)) return;
  const payment = await prisma.opsPayment.findUnique({ where: { id: opsPaymentId } });
  if (!payment || payment.status === 'PAID' || !payment.razorpayOrderId) return;
  const { items } = await razorpayCall<{ items: { id: string; status: string; amount: number }[] }>(`orders/${payment.razorpayOrderId}/payments`, 'GET');
  const paise = Math.round(Number(payment.amount) * 100);
  const captured = items.find((i) => i.status === 'captured' && i.amount === paise);
  if (!captured) return;
  await settleCapture({ opsPayment: payment, razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: captured.id, amountPaise: captured.amount, actor: CHECK_ACTOR });
}

/** A mandate that is not yet authorised: copy Razorpay's state (and any charge already taken) into our rows. */
export async function reconcileMandate(subscriptionId: string): Promise<void> {
  if (!razorpayAuth() || !due(subscriptionId)) return;
  const row = await prisma.razorpaySubscription.findUnique({ where: { id: subscriptionId } });
  if (!row || row.status !== 'created') return;
  await reconcileRow(row);
}
