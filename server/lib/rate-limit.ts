import { redis } from './redis';
import { AppError } from '../http/errors';

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Redis timed out after ${ms}ms`)), ms))]);

/**
 * Fixed-window counter in Redis: throws a 429 once `key` has been hit more than `max` times in
 * `windowSeconds`. Fails open if Redis is down — login must not depend on it, and the per-code OTP
 * attempt cap (in Postgres) still bounds guessing.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  let count: number;
  try {
    const k = `ops:rl:${key}`;
    // The shared client retries forever (BullMQ needs that), so a dead Redis would hang login on
    // a queued command instead of throwing — hence the explicit timeout.
    count = await withTimeout(redis.incr(k), 1000);
    if (count === 1) await withTimeout(redis.expire(k, windowSeconds), 1000);
  } catch (err) {
    console.error('[rate-limit] Redis unavailable, not limiting:', err);
    return;
  }
  if (count > max) {
    throw new AppError('Too many attempts. Please wait a few minutes and try again.', 'RATE_LIMITED', 429);
  }
}
