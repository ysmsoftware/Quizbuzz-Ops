// In-memory cache helper. Safely manages short-TTL data caching.
const memoryCache = new Map<string, { value: any; expires: number }>();

export const cache = {
  async get<T = any>(key: string): Promise<T | null> {
    const cached = memoryCache.get(key);
    if (cached) {
      if (cached.expires > Date.now()) {
        return cached.value as T;
      }
      memoryCache.delete(key);
    }
    return null;
  },

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    memoryCache.set(key, {
      value,
      expires: Date.now() + ttlSeconds * 1000,
    });
  },

  async delete(key: string): Promise<void> {
    memoryCache.delete(key);
  },

  async invalidatePattern(prefix: string): Promise<void> {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }
  },
};

export default cache;
