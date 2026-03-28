import type { CacheClient } from '../../cache/redis.js';
import type {
  EnrichmentAdapter,
  PersonEnrichInput,
  EnrichedPerson,
  CompanyEnrichInput,
  EnrichedCompany,
  EnrichedConnection,
  ConnectionFilters,
  MutualConnection,
} from './interface.js';

const PERSON_TTL = 86400;  // 24 hours
const COMPANY_TTL = 86400; // 24 hours
const CONNECTION_TTL = 43200; // 12 hours

/**
 * Caching decorator for any EnrichmentAdapter.
 * Wraps an underlying adapter with Redis caching (24h TTL).
 * Falls through to the underlying adapter on cache miss.
 */
export class CachedEnrichmentAdapter implements EnrichmentAdapter {
  constructor(
    private inner: EnrichmentAdapter,
    private cache: CacheClient
  ) {}

  async enrichPerson(input: PersonEnrichInput): Promise<EnrichedPerson> {
    const key = `enrich:person:${input.email ?? input.linkedinUrl ?? input.name}`;
    const cached = await this.cache.get<EnrichedPerson>(key);
    if (cached) return cached;

    const result = await this.inner.enrichPerson(input);
    await this.cache.set(key, result, PERSON_TTL);
    return result;
  }

  async enrichCompany(input: CompanyEnrichInput): Promise<EnrichedCompany> {
    const key = `enrich:company:${input.domain ?? input.name}`;
    const cached = await this.cache.get<EnrichedCompany>(key);
    if (cached) return cached;

    const result = await this.inner.enrichCompany(input);
    await this.cache.set(key, result, COMPANY_TTL);
    return result;
  }

  async getConnections(personId: string, filters?: ConnectionFilters): Promise<EnrichedConnection[]> {
    const filterKey = filters ? JSON.stringify(filters) : 'none';
    const key = `enrich:connections:${personId}:${filterKey}`;
    const cached = await this.cache.get<EnrichedConnection[]>(key);
    if (cached) return cached;

    const result = await this.inner.getConnections(personId, filters);
    await this.cache.set(key, result, CONNECTION_TTL);
    return result;
  }

  async findMutualConnections(person1: string, person2: string): Promise<MutualConnection[]> {
    const key = `enrich:mutual:${[person1, person2].sort().join(':')}`;
    const cached = await this.cache.get<MutualConnection[]>(key);
    if (cached) return cached;

    const result = await this.inner.findMutualConnections(person1, person2);
    await this.cache.set(key, result, CONNECTION_TTL);
    return result;
  }
}
