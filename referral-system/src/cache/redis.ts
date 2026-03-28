import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'cache' });

const DEFAULT_TTL = 86400; // 24 hours in seconds

export class CacheClient {
  private redis: Redis | null = null;

  constructor(redisUrl?: string) {
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          connectTimeout: 3000,
        });
        this.redis.on('error', (err) => {
          logger.warn({ err: err.message }, 'Redis connection error — cache disabled');
          this.redis = null;
        });
        this.redis.connect().catch(() => {
          logger.warn('Redis unavailable — cache disabled, all calls pass through');
          this.redis = null;
        });
      } catch {
        logger.warn('Redis initialization failed — cache disabled');
        this.redis = null;
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttl: number = DEFAULT_TTL): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  async invalidate(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch {
      // Cache invalidation failure is non-fatal
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
