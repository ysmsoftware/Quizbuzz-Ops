import { Queue } from 'bullmq';
import { redis } from '../../lib/redis';
import { env } from '../../config/env';

const routeTransferQueue = new Queue('route-transfer-queue', {
  connection: redis,
  prefix: env.ROUTE_TRANSFER_QUEUE_PREFIX,
});

export interface RouteTransferQueueHealth {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export async function getRouteTransferQueueHealth(): Promise<RouteTransferQueueHealth> {
  const counts = await routeTransferQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    delayed: counts.delayed || 0,
    failed: counts.failed || 0,
    completed: counts.completed || 0,
  };
}

export interface ForceRetryTransferInput {
  paymentId: string;
  organizationId: string;
  amount: number;
  razorpayPaymentId: string;
  currency: string;
}

/**
 * Enqueues an explicit, human-triggered retry for a payment's Route transfer — the
 * ops-dashboard action behind "this payment wasn't transferred, retry it now" once an
 * admin has looked at the chain of events and decided it's safe to try again.
 *
 * Deliberately does NOT reuse `route-transfer-{paymentId}` as the jobId: that job may
 * already exist in BullMQ's completed/failed set (retained per removeOnComplete/
 * removeOnFail), and BullMQ's jobId-based dedup would silently no-op the add() rather
 * than create a fresh attempt. `forceRetry: true` is what actually lets
 * PayoutService.createRouteTransferForPayment (main app) bypass the "don't auto-retry
 * a FAILED transfer" guard — this queue write only asks for the retry, the main app's
 * worker still owns all the money-movement logic (fee calc, Razorpay call, idempotency).
 */
export async function enqueueForceRetryTransfer(input: ForceRetryTransferInput): Promise<string> {
  const job = await routeTransferQueue.add(
    'create-route-transfer',
    {
      paymentId: input.paymentId,
      organizationId: input.organizationId,
      amount: input.amount,
      razorpayPaymentId: input.razorpayPaymentId,
      currency: input.currency,
      forceRetry: true,
    },
    { jobId: `route-transfer-retry-${input.paymentId}-${Date.now()}` }
  );
  return job.id ?? '';
}
