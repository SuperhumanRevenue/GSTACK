import pino from 'pino';
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

const logger = pino({ name: 'apollo' });

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

/**
 * Apollo.io enrichment adapter — maps Apollo's API to our EnrichmentAdapter interface.
 */
export class ApolloAdapter implements EnrichmentAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const url = `${APOLLO_API_BASE}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text, path }, 'Apollo API error');
      throw new Error(`Apollo API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async enrichPerson(input: PersonEnrichInput): Promise<EnrichedPerson> {
    const data = await this.request<ApolloPersonResponse>('/people/match', {
      name: input.name,
      email: input.email,
      linkedin_url: input.linkedinUrl,
    });

    const person = data.person;
    return {
      id: person.id,
      name: `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim(),
      title: person.title ?? undefined,
      company: person.organization?.name ?? undefined,
      linkedinUrl: person.linkedin_url ?? undefined,
      networkReachScore: estimateNetworkReach(person),
      formerCompanies: (person.employment_history ?? []).map((e: ApolloEmployment) => e.organization_name).filter(Boolean),
      industryCommunities: [], // Apollo doesn't provide this directly
      seniorityLevel: mapSeniority(person.seniority),
      notableConnections: [], // Would require additional API calls
    };
  }

  async enrichCompany(input: CompanyEnrichInput): Promise<EnrichedCompany> {
    const data = await this.request<ApolloOrgResponse>('/organizations/enrich', {
      domain: input.domain,
      name: input.name,
    });

    const org = data.organization;
    return {
      id: org.id,
      name: org.name,
      domain: org.primary_domain ?? undefined,
      industry: org.industry ?? undefined,
      employeeCount: org.estimated_num_employees ?? undefined,
      annualRevenue: org.annual_revenue ?? undefined,
      technologies: org.current_technologies?.map((t: ApolloTech) => t.name) ?? [],
      fundingStage: org.latest_funding_stage ?? undefined,
    };
  }

  async getConnections(personId: string, filters?: ConnectionFilters): Promise<EnrichedConnection[]> {
    // Apollo doesn't have a direct "connections" API — use people search
    // to find people at the same companies the person has worked at
    const searchFilters: Record<string, unknown> = {
      person_ids: [personId],
    };

    if (filters?.titles) {
      searchFilters.person_titles = filters.titles;
    }
    if (filters?.industries) {
      searchFilters.organization_industry_tag_ids = filters.industries;
    }

    const data = await this.request<ApolloSearchResponse>('/mixed_people/search', {
      ...searchFilters,
      per_page: 25,
    });

    return (data.people ?? []).map((p: ApolloPerson) => ({
      id: p.id,
      name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      title: p.title ?? '',
      company: p.organization?.name ?? '',
      connectionType: 'linkedin' as const,
      connectionStrength: 5,
    }));
  }

  async findMutualConnections(person1: string, person2: string): Promise<MutualConnection[]> {
    // Apollo doesn't support mutual connection lookup directly
    // Return empty — this would need LinkedIn API or manual data
    logger.info({ person1, person2 }, 'Mutual connection lookup not supported by Apollo');
    return [];
  }
}

// ─── Apollo Types ───

interface ApolloPersonResponse {
  person: ApolloPerson;
}

interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  seniority?: string;
  linkedin_url?: string;
  organization?: { name: string };
  employment_history?: ApolloEmployment[];
}

interface ApolloEmployment {
  organization_name: string;
  title?: string;
  start_date?: string;
  end_date?: string;
}

interface ApolloOrgResponse {
  organization: ApolloOrg;
}

interface ApolloOrg {
  id: string;
  name: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  annual_revenue?: number;
  current_technologies?: ApolloTech[];
  latest_funding_stage?: string;
}

interface ApolloTech {
  name: string;
}

interface ApolloSearchResponse {
  people?: ApolloPerson[];
}

// ─── Helpers ───

function estimateNetworkReach(person: ApolloPerson): number {
  let score = 30; // Base
  if (person.employment_history && person.employment_history.length > 2) score += 20;
  if (person.seniority === 'c_suite' || person.seniority === 'vp') score += 25;
  if (person.linkedin_url) score += 15;
  if (person.organization) score += 10;
  return Math.min(100, score);
}

function mapSeniority(seniority?: string): string | undefined {
  if (!seniority) return undefined;
  const lower = seniority.toLowerCase();
  if (lower.includes('c_suite') || lower.includes('founder') || lower.includes('ceo') || lower.includes('cto')) return 'c_suite';
  if (lower.includes('vp') || lower.includes('vice president')) return 'vp';
  if (lower.includes('director')) return 'director';
  if (lower.includes('manager')) return 'manager';
  return seniority;
}
