import { z } from 'zod';

const envSchema = z.object({
  OPS_DATABASE_URL: z.string().default('postgresql://quizbuzz_ops_owner:ops_password_secure@localhost:5432/quizbuzz_ops?schema=public'),
  MAIN_DATABASE_URL: z.string().default('postgresql://quizbuzz_ops_reader:reader_password@localhost:5432/quizbuzz?schema=public'),
  MAIN_DB_POOL_MAX: z.coerce.number().default(8),
  MAIN_DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(10000),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  OPS_JWT_ACCESS_SECRET: z.string().default('ops_jwt_access_secret_super_secure_key_12345'),
  OPS_JWT_REFRESH_SECRET: z.string().default('ops_jwt_refresh_secret_super_secure_key_12345'),
  OPS_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(30),
  OPS_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  OPS_COOKIE_DOMAIN: z.string().optional(),
  OPS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  BILLING_HANDOFF_SECRET: z.string().min(1, 'BILLING_HANDOFF_SECRET must be set — it signs the checkout handoff token'),
  MAIN_APP_FRONTEND_URL: z.string().default('http://localhost:3000'),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // WhatsApp is fully implemented (provider + templates + worker) but kept
  // OFF by default — WHATSAPP_MESSAGING_ENABLED gates whether the service
  // layer will accept a WHATSAPP channel at all. The public "send message"
  // API only ever accepts EMAIL regardless of this flag; this only affects
  // internal/system-triggered sends. Flip it on later with zero code changes.
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_MESSAGING_ENABLED: z.coerce.boolean().default(false),

  MESSAGE_QUEUE_PREFIX: z.string().default('ops'),
  MESSAGE_QUEUE_RETRY_ATTEMPTS: z.coerce.number().default(3),
  MESSAGE_QUEUE_BACKOFF_DELAY_MS: z.coerce.number().default(5000),
  MESSAGE_WORKER_CONCURRENCY: z.coerce.number().default(10),

  PAYOUTS_SUMMARY_CACHE_TTL_SECONDS: z.coerce.number().default(60),
  ROUTE_TRANSFER_QUEUE_PREFIX: z.string().default('quizbuzz'),
  // Thresholds for the "needs attention" view — mirrors the main app's own grace
  // windows (PAYOUT_RECONCILIATION_GRACE_PERIOD_MS / PAYOUT_STUCK_TRANSFER_RESUME_AFTER_MS)
  // so the dashboard doesn't flag something as a problem before the backend's own
  // reconciliation sweep would even consider it stuck.
  PAYOUT_MISSING_TRANSFER_GRACE_MINUTES: z.coerce.number().default(10),
  PAYOUT_STUCK_TRANSFER_GRACE_MINUTES: z.coerce.number().default(3),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // If building, do not crash on missing envs. BILLING_HANDOFF_SECRET has no
    // default (see below) so the static analysis pass at build time needs a
    // throwaway value here — this placeholder is never read at runtime since a
    // real request only ever executes after process.env is validated for real.
    if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test') {
      return envSchema.parse({
        ...process.env,
        BILLING_HANDOFF_SECRET: process.env.BILLING_HANDOFF_SECRET || 'build_time_placeholder_unused_at_runtime',
      });
    }
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment variables configured');
  }
  return result.data;
};

export const env = parseEnv();
