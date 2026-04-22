import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/integrations/rate-limiter.js';

describe('Rate Limiter', () => {
  it('allows requests within limit', async () => {
    const limiter = new RateLimiter({
      test: { maxRequests: 3, windowSeconds: 10 },
    });

    expect(await limiter.acquire('test')).toBe(true);
    expect(await limiter.acquire('test')).toBe(true);
    expect(await limiter.acquire('test')).toBe(true);
  });

  it('blocks requests exceeding limit', async () => {
    const limiter = new RateLimiter({
      test: { maxRequests: 2, windowSeconds: 10 },
    });

    expect(await limiter.acquire('test')).toBe(true);
    expect(await limiter.acquire('test')).toBe(true);
    expect(await limiter.acquire('test')).toBe(false);
  });

  it('allows requests for unconfigured providers', async () => {
    const limiter = new RateLimiter({});
    expect(await limiter.acquire('unknown')).toBe(true);
  });

  it('tracks separate windows per provider', async () => {
    const limiter = new RateLimiter({
      hubspot: { maxRequests: 1, windowSeconds: 10 },
      apollo: { maxRequests: 1, windowSeconds: 10 },
    });

    expect(await limiter.acquire('hubspot')).toBe(true);
    expect(await limiter.acquire('hubspot')).toBe(false);
    // Apollo should still be available
    expect(await limiter.acquire('apollo')).toBe(true);
  });

  it('returns stats', async () => {
    const limiter = new RateLimiter({
      test: { maxRequests: 5, windowSeconds: 60 },
    });

    await limiter.acquire('test');
    await limiter.acquire('test');

    const stats = limiter.getStats('test');
    expect(stats).not.toBeNull();
    expect(stats!.used).toBe(2);
    expect(stats!.limit).toBe(5);
    expect(stats!.windowSeconds).toBe(60);
  });

  it('returns null stats for unknown provider', () => {
    const limiter = new RateLimiter({});
    expect(limiter.getStats('unknown')).toBeNull();
  });
});
