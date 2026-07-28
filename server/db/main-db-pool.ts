import { Pool } from 'pg';
import { env } from '../config/env';

const globalForPool = globalThis as unknown as {
  pool: Pool | undefined;
};

const isProduction = process.env.NODE_ENV === 'production';
const hasSslMode = env.MAIN_DATABASE_URL.includes('sslmode=');
const isLocalhost =
  env.MAIN_DATABASE_URL.includes('localhost') ||
  env.MAIN_DATABASE_URL.includes('127.0.0.1') ||
  env.MAIN_DATABASE_URL.includes('::1');

export const mainDbPool =
  globalForPool.pool ??
  new Pool({
    connectionString: env.MAIN_DATABASE_URL,
    max: env.MAIN_DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    statement_timeout: env.MAIN_DB_STATEMENT_TIMEOUT_MS,
    ...(isProduction && !hasSslMode && !isLocalhost ? { ssl: { rejectUnauthorized: false } } : {}),
  });

export const queryMainDb = async <T = any>(
  text: string,
  params?: any[]
): Promise<T[]> => {
  const client = await mainDbPool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
};

if (process.env.NODE_ENV !== 'production') globalForPool.pool = mainDbPool;
export default mainDbPool;
