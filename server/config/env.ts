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
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // If building, do not crash on missing envs
    if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test') {
      return envSchema.parse({});
    }
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment variables configured');
  }
  return result.data;
};

export const env = parseEnv();
