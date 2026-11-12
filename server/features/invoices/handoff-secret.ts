import { env } from '../../config/env';

/** The repo once shipped this value, so it must never open anything in production. */
const PUBLISHED_DEV_SECRET = 'billing_handoff_secret_shared_key_998877';

/**
 * The secret the main app signs checkout, Billing page and lead tokens with. In production a guessable
 * value would let anyone read invoices or cancel plans, so it returns null and the caller refuses.
 */
export function handoffSecret(): string | null {
  const secret = env.BILLING_HANDOFF_SECRET;
  if (process.env.NODE_ENV === 'production' && (secret === PUBLISHED_DEV_SECRET || secret.length < 16)) return null;
  return secret;
}
