import Redis from 'ioredis';

export async function flushRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const r = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await r.connect();
    await r.flushall();
    await r.quit();
  } catch {
    // Silent catch if Redis is unavailable or already flushed
  }
}
