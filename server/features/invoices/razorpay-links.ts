import { env } from '../../config/env';
import { generateUlid } from '../../utils/ulid';

/** Razorpay Payment Links: a hosted page that expires on a date. Docs: /docs/api/payments/payment-links. */

function auth(): string | null {
  const id = env.RAZORPAY_KEY_ID;
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!id || !secret || id.includes('stub')) return null;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const header = auth();
  if (!header) throw new Error('Razorpay keys are not configured');
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: header },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Razorpay ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function createPaymentLink(input: {
  invoiceId: string;
  reference: string;
  amountRupees: number;
  description: string;
  expiresAt: Date;
  customer: { name: string; email: string | null };
}): Promise<{ id: string; url: string | null }> {
  // Same local convenience as the order route: no keys on a dev machine, a fake id; never in production.
  if (!auth() && process.env.NODE_ENV !== 'production') return { id: `plink_test_${generateUlid()}`, url: null };

  const link = await call<{ id: string; short_url: string }>('payment_links', 'POST', {
    amount: Math.round(input.amountRupees * 100),
    currency: 'INR',
    accept_partial: false,
    reference_id: input.reference,
    description: input.description.slice(0, 2048),
    expire_by: Math.floor(input.expiresAt.getTime() / 1000),
    customer: { name: input.customer.name, ...(input.customer.email ? { email: input.customer.email } : {}) },
    // Our own email carries the link and the amounts; Razorpay's reminders nudge until it expires.
    notify: { email: false, sms: false },
    reminder_enable: true,
    notes: { invoiceId: input.invoiceId },
  });
  return { id: link.id, url: link.short_url };
}

export async function cancelPaymentLink(id: string): Promise<void> {
  if (!auth()) return;
  await call(`payment_links/${id}/cancel`, 'POST');
}

export async function extendPaymentLink(id: string, expiresAt: Date): Promise<void> {
  if (!auth()) return;
  await call(`payment_links/${id}`, 'PATCH', { expire_by: Math.floor(expiresAt.getTime() / 1000) });
}
