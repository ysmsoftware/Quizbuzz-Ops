import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const isProduction = process.env.NODE_ENV === 'production';
const hasSslMode = env.OPS_DATABASE_URL.includes('sslmode=');
const isLocalhost =
  env.OPS_DATABASE_URL.includes('localhost') ||
  env.OPS_DATABASE_URL.includes('127.0.0.1') ||
  env.OPS_DATABASE_URL.includes('::1');

const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: env.OPS_DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...(isProduction && !hasSslMode && !isLocalhost ? { ssl: { rejectUnauthorized: false } } : {}),
  });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export default prisma;
