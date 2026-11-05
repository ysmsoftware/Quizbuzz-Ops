import { env } from '../config/env';

/** Razorpay REST calls with our key. Null auth means no real keys (a dev machine): callers fake ids there, never in production. */

export function razorpayAuth(): string | null {
  const id = env.RAZORPAY_KEY_ID;
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!id || !secret || id.includes('stub')) return null;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

export async function razorpayCall<T>(path: string, method: string, body?: unknown): Promise<T> {
  const header = razorpayAuth();
  if (!header) throw new Error('Razorpay keys are not configured');
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: header },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Razorpay ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
