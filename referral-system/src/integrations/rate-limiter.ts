import pino from 'pino';

const logger = pino({ name: 'rate-limiter' });

/**
 * Simple in-memory rate limiter for external API calls.
 * Per-provider configurable limits with sliding window.
 */
export class RateLimiter {
  private windows = new Map<string, number[]>();
  private limits: Record<string, ProviderLimit>;

  constructor(limits: Record<string, ProviderLimit>) {
    this.limits = limits;
  }

  /**
   * Check if a call to the given provider is allowed.
   * Returns true if allowed, false if rate-limited.
   */
  async acquire(provider: string): Promise<boolean> {
    const limit = this.limits[provider];
    if (!limit) return true; // No limit configured

    const now = Date.now();
    const windowMs = limit.windowSeconds * 1000;

    // Get or create window
    let timestamps = this.windows.get(provider) ?? [];

    // Prune expired entries
    timestamps = timestamps.filter((ts) => now - ts < windowMs);

    if (timestamps.length >= limit.maxRequests) {
      logger.warn({ provider, limit: limit.maxRequests, window: limit.windowSeconds }, 'Rate limit reached');
      return false;
    }

    timestamps.push(now);
    this.windows.set(provider, timestamps);
    return true;
  }

  /**
   * Wait until a call is allowed (with timeout).
   */
  async waitForSlot(provider: string, timeoutMs: number = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.acquire(provider)) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  /** Get current usage stats */
  getStats(provider: string): { used: number; limit: number; windowSeconds: number } | null {
    const limit = this.limits[provider];
    if (!limit) return null;

    const now = Date.now();
    const windowMs = limit.windowSeconds * 1000;
    const timestamps = (this.windows.get(provider) ?? []).filter((ts) => now - ts < windowMs);

    return {
      used: timestamps.length,
      limit: limit.maxRequests,
      windowSeconds: limit.windowSeconds,
    };
  }
}

export interface ProviderLimit {
  maxRequests: number;
  windowSeconds: number;
}

/** Default rate limits for common providers */
export const DEFAULT_RATE_LIMITS: Record<string, ProviderLimit> = {
  hubspot: { maxRequests: 100, windowSeconds: 10 },  // HubSpot: 100/10s
  apollo: { maxRequests: 50, windowSeconds: 60 },     // Apollo: ~50/min
  slack: { maxRequests: 50, windowSeconds: 60 },       // Slack: tier 2
};
