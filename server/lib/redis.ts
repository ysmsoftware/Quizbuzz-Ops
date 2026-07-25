import Redis from 'ioredis';
import { env } from '../config/env';

const globalForRedis = globalThis as unknown as { opsRedis: Redis | undefined };

// maxRetriesPerRequest: null is required by BullMQ — without it, BullMQ's
// internal blocking commands (used for job polling) throw once ioredis's
// default retry ceiling is hit instead of blocking indefinitely, which
// makes the queue/worker fail intermittently under any connection blip.
export const redis =
  globalForRedis.opsRedis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

redis.on('connect', () => console.log('[ops-redis] connected'));
redis.on('error', (err) => console.error('[ops-redis] error', err));

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.opsRedis = redis;
}
