import { Pool } from 'pg';
import { env } from '../config/env';

const globalForPool = globalThis as unknown as {
  pool: Pool | undefined;
};

export const mainDbPool =
  globalForPool.pool ??
  new Pool({
    connectionString: env.MAIN_DATABASE_URL,
    max: env.MAIN_DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: env.MAIN_DB_STATEMENT_TIMEOUT_MS,
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
