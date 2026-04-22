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
} from '../enrichment/interface.js';

const logger = pino({ name: 'phantombuster' });

const PB_API_BASE = 'https://api.phantombuster.com/api/v2';

/**
 * PhantomBuster adapter for LinkedIn profile scraping and enrichment.
 * Uses PhantomBuster's API to trigger LinkedIn scraper phantoms.
 *
 * Requires:
 * - PhantomBuster API key
 * - Pre-configured LinkedIn Profile Scraper phantom (agent ID)
 * - LinkedIn session cookie configured in the phantom
 */
export class PhantomBusterAdapter implements EnrichmentAdapter {
  private apiKey: string;
  private profileScraperAgentId: string;
  private companyScraperAgentId?: string;

  constructor(
    apiKey: string,
    profileScraperAgentId: string,
    companyScraperAgentId?: string
  ) {
    this.apiKey = apiKey;
    this.profileScraperAgentId = profileScraperAgentId;
    this.companyScraperAgentId = companyScraperAgentId;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${PB_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Phantombuster-Key-1': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text, path }, 'PhantomBuster API error');
      throw new Error(`PhantomBuster API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private async fetchAgentOutput(agentId: string): Promise<unknown> {
    const res = await fetch(`${PB_API_BASE}/agents/fetch-output?id=${agentId}`, {
      method: 'GET',
      headers: { 'X-Phantombuster-Key-1': this.apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status }, 'PhantomBuster fetch output error');
      throw new Error(`PhantomBuster output error (${res.status}): ${text}`);
    }

    return res.json();
  }

  async enrichPerson(input: PersonEnrichInput): Promise<EnrichedPerson> {
    if (!input.linkedinUrl) {
      throw new Error('PhantomBuster enrichPerson requires linkedinUrl');
    }

    logger.info({ linkedinUrl: input.linkedinUrl }, 'PhantomBuster: scraping LinkedIn profile');

    // Launch the LinkedIn Profile Scraper phantom
    await this.request('/agents/launch', {
      id: this.profileScraperAgentId,
      argument: {
        sessionCookie: 'configured-in-phantom', // Session cookie is stored in phantom config
        profileUrls: [input.linkedinUrl],
      },
    });

    // Wait for phantom to complete (poll with backoff)
    let output: PhantomBusterProfileOutput | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(3000 + attempt * 2000); // 3s, 5s, 7s, ...
      try {
        const result = await this.fetchAgentOutput(this.profileScraperAgentId);
        output = result as PhantomBusterProfileOutput;
        if (output?.status === 'finished') break;
      } catch {
        logger.debug({ attempt }, 'PhantomBuster: waiting for phantom to complete');
      }
    }

    if (!output?.output) {
      logger.warn('PhantomBuster: phantom did not return output, using partial data');
      return {
        id: input.linkedinUrl,
        name: input.name ?? 'Unknown',
        networkReachScore: 50,
        formerCompanies: [],
        industryCommunities: [],
        notableConnections: [],
      };
    }

    // Parse phantom output
    const profile = Array.isArray(output.output) ? output.output[0] : output.output;

    return {
      id: profile.linkedinUrl ?? input.linkedinUrl,
      name: profile.fullName ?? input.name ?? 'Unknown',
      title: profile.headline ?? profile.title,
      company: profile.company ?? profile.companyName,
      linkedinUrl: profile.linkedinUrl ?? input.linkedinUrl,
      networkReachScore: estimateNetworkReach(profile),
      formerCompanies: profile.pastCompanies?.map((c: { name: string }) => c.name) ?? [],
      industryCommunities: [],
      seniorityLevel: inferSeniority(profile.headline ?? ''),
      notableConnections: [],
    };
  }

  async enrichCompany(input: CompanyEnrichInput): Promise<EnrichedCompany> {
    if (!this.companyScraperAgentId) {
      throw new Error('PhantomBuster company scraper agent not configured');
    }

    logger.info({ company: input.name }, 'PhantomBuster: scraping company page');

    await this.request('/agents/launch', {
      id: this.companyScraperAgentId,
      argument: {
        companyUrl: input.domain ? `https://www.linkedin.com/company/${input.domain}` : undefined,
        companyName: input.name,
      },
    });

    // Simple poll
    await sleep(5000);
    const result = await this.fetchAgentOutput(this.companyScraperAgentId);
    const data = result as PhantomBusterCompanyOutput;
    const company = Array.isArray(data?.output) ? data.output[0] : data?.output;

    return {
      id: company?.linkedinUrl ?? input.name ?? 'unknown',
      name: company?.name ?? input.name ?? 'Unknown',
      domain: company?.website ?? input.domain,
      industry: company?.industry,
      employeeCount: company?.employeeCount,
    };
  }

  async getConnections(_personId: string, _filters?: ConnectionFilters): Promise<EnrichedConnection[]> {
    // LinkedIn connections require a separate phantom (LinkedIn Network Booster)
    logger.warn('PhantomBuster getConnections not yet implemented — use Apollo for connection data');
    return [];
  }

  async findMutualConnections(_person1: string, _person2: string): Promise<MutualConnection[]> {
    logger.warn('PhantomBuster findMutualConnections not yet implemented — use Apollo for mutual connections');
    return [];
  }
}

// ─── Types ───

interface PhantomBusterProfileOutput {
  status: string;
  output?: PhantomBusterProfile | PhantomBusterProfile[];
}

interface PhantomBusterProfile {
  fullName?: string;
  headline?: string;
  title?: string;
  company?: string;
  companyName?: string;
  linkedinUrl?: string;
  location?: string;
  connectionsCount?: number;
  followersCount?: number;
  pastCompanies?: { name: string; title?: string }[];
}

interface PhantomBusterCompanyOutput {
  status: string;
  output?: PhantomBusterCompany | PhantomBusterCompany[];
}

interface PhantomBusterCompany {
  name?: string;
  linkedinUrl?: string;
  website?: string;
  industry?: string;
  employeeCount?: number;
}

// ─── Helpers ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateNetworkReach(profile: PhantomBusterProfile): number {
  const connections = profile.connectionsCount ?? 0;
  const followers = profile.followersCount ?? 0;
  const total = connections + followers;

  if (total > 10000) return 95;
  if (total > 5000) return 85;
  if (total > 2000) return 70;
  if (total > 500) return 55;
  if (total > 100) return 35;
  return 20;
}

function inferSeniority(headline: string): string {
  const lower = headline.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|cro|chief|founder|co-founder|president)\b/.test(lower)) return 'c_suite';
  if (/\b(vp|vice president|svp|evp)\b/.test(lower)) return 'vp';
  if (/\b(director|head of)\b/.test(lower)) return 'director';
  if (/\b(manager|lead|principal)\b/.test(lower)) return 'manager';
  return 'individual_contributor';
}
