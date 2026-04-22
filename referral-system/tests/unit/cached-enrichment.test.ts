import { describe, it, expect, vi } from 'vitest';
import { CachedEnrichmentAdapter } from '../../src/integrations/enrichment/cached.js';
import type { EnrichmentAdapter, EnrichedPerson, EnrichedCompany } from '../../src/integrations/enrichment/interface.js';

// Mock cache
function createMockCache() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async <T>(key: string): Promise<T | null> => (store.get(key) as T) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    invalidate: vi.fn(async (key: string) => { store.delete(key); }),
    disconnect: vi.fn(async () => {}),
    _store: store,
  };
}

// Mock enrichment adapter
function createMockInner(): EnrichmentAdapter {
  return {
    enrichPerson: vi.fn(async () => ({
      id: '1',
      name: 'Test Person',
      networkReachScore: 75,
      formerCompanies: ['CompA'],
      industryCommunities: [],
      notableConnections: [],
    })) as unknown as EnrichmentAdapter['enrichPerson'],
    enrichCompany: vi.fn(async () => ({
      id: '1',
      name: 'Test Company',
    })) as unknown as EnrichmentAdapter['enrichCompany'],
    getConnections: vi.fn(async () => []) as EnrichmentAdapter['getConnections'],
    findMutualConnections: vi.fn(async () => []) as EnrichmentAdapter['findMutualConnections'],
  };
}

describe('Cached Enrichment Adapter', () => {
  it('calls inner adapter on cache miss', async () => {
    const cache = createMockCache();
    const inner = createMockInner();
    const cached = new CachedEnrichmentAdapter(inner, cache as any);

    await cached.enrichPerson({ email: 'test@example.com' });
    expect(inner.enrichPerson).toHaveBeenCalledTimes(1);
  });

  it('returns cached result on cache hit', async () => {
    const cache = createMockCache();
    const inner = createMockInner();
    const cached = new CachedEnrichmentAdapter(inner, cache as any);

    // First call — cache miss
    await cached.enrichPerson({ email: 'test@example.com' });
    expect(inner.enrichPerson).toHaveBeenCalledTimes(1);

    // Second call — cache hit
    await cached.enrichPerson({ email: 'test@example.com' });
    expect(inner.enrichPerson).toHaveBeenCalledTimes(1); // Not called again
  });

  it('caches company enrichment', async () => {
    const cache = createMockCache();
    const inner = createMockInner();
    const cached = new CachedEnrichmentAdapter(inner, cache as any);

    await cached.enrichCompany({ domain: 'example.com' });
    await cached.enrichCompany({ domain: 'example.com' });
    expect(inner.enrichCompany).toHaveBeenCalledTimes(1);
  });

  it('uses different cache keys for different inputs', async () => {
    const cache = createMockCache();
    const inner = createMockInner();
    const cached = new CachedEnrichmentAdapter(inner, cache as any);

    await cached.enrichPerson({ email: 'a@example.com' });
    await cached.enrichPerson({ email: 'b@example.com' });
    expect(inner.enrichPerson).toHaveBeenCalledTimes(2);
  });

  it('stores results with TTL via cache.set', async () => {
    const cache = createMockCache();
    const inner = createMockInner();
    const cached = new CachedEnrichmentAdapter(inner, cache as any);

    await cached.enrichPerson({ email: 'test@example.com' });
    expect(cache.set).toHaveBeenCalledTimes(1);
    // TTL should be 86400 (24h)
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('enrich:person:'),
      expect.anything(),
      86400
    );
  });
});
