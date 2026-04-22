import pino from 'pino';
import type { WebSearchAdapter, SearchOptions, SearchResult, CompanyResearch } from './interface.js';

const logger = pino({ name: 'exa' });

const EXA_API_BASE = 'https://api.exa.ai';

/**
 * Exa (exa.ai) web search adapter.
 * Neural search with structured content extraction.
 */
export class ExaAdapter implements WebSearchAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${EXA_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text, path }, 'Exa API error');
      throw new Error(`Exa API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const numResults = options?.maxResults ?? 10;
    const type = options?.searchDepth === 'advanced' ? 'neural' : 'auto';

    logger.debug({ query, numResults, type }, 'Exa: searching');

    const data = await this.request<ExaSearchResponse>('/search', {
      query,
      numResults,
      type,
      contents: {
        text: { maxCharacters: 2000 },
        highlights: { numSentences: 3 },
      },
      ...(options?.includeDomains?.length ? { includeDomains: options.includeDomains } : {}),
      ...(options?.excludeDomains?.length ? { excludeDomains: options.excludeDomains } : {}),
    });

    return data.results.map((r) => ({
      title: r.title ?? '',
      url: r.url,
      content: r.text ?? r.highlights?.join(' ') ?? '',
      score: r.score,
    }));
  }

  async researchCompany(companyName: string): Promise<CompanyResearch> {
    logger.debug({ companyName }, 'Exa: researching company');

    // Run parallel searches for different aspects
    const [competitorResults, trendResults, newsResults] = await Promise.all([
      this.search(`${companyName} competitors market landscape`, { maxResults: 5 }),
      this.search(`${companyName} industry trends market dynamics`, { maxResults: 5 }),
      this.search(`${companyName} news funding announcements`, { maxResults: 5 }),
    ]);

    // Extract structured data from search results
    const competitors = extractCompetitors(competitorResults, companyName);
    const industryTrends = extractTrends(trendResults);
    const marketDynamics = extractDynamics(trendResults);
    const techLandscape = extractTechStack(competitorResults);
    const recentNews = extractNews(newsResults);

    return {
      companyName,
      competitors,
      industryTrends,
      marketDynamics,
      techLandscape,
      recentNews,
    };
  }
}

// ─── Exa response types ───

interface ExaSearchResponse {
  results: {
    url: string;
    title?: string;
    text?: string;
    highlights?: string[];
    score?: number;
    publishedDate?: string;
    author?: string;
  }[];
}

// ─── Extraction helpers ───

function extractCompetitors(
  results: SearchResult[],
  companyName: string
): CompanyResearch['competitors'] {
  const competitors: CompanyResearch['competitors'] = [];
  const seen = new Set<string>();

  for (const result of results) {
    // Look for company names mentioned alongside the target
    const pattern = /(?:competitors?|alternatives?|vs\.?|compared to|rival)\s+(?:include|like|such as|are)?\s*:?\s*([A-Z][A-Za-z\s,&]+)/gi;
    let match;
    while ((match = pattern.exec(result.content)) !== null) {
      const names = match[1].split(/[,&]/).map((n) => n.trim()).filter((n) => n.length > 2);
      for (const name of names) {
        const cleanName = name.replace(/\s+and\s+.*$/, '').trim();
        if (cleanName.length > 2 && cleanName.toLowerCase() !== companyName.toLowerCase() && !seen.has(cleanName.toLowerCase())) {
          seen.add(cleanName.toLowerCase());
          competitors.push({ name: cleanName });
        }
      }
    }
  }

  return competitors.slice(0, 10);
}

function extractTrends(results: SearchResult[]): string[] {
  const trends: string[] = [];
  for (const result of results) {
    // Extract sentences containing trend keywords
    const sentences = result.content.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (/(?:trend|growing|shift|emerging|transformation|adoption)/i.test(sentence) && sentence.length > 20 && sentence.length < 200) {
        trends.push(sentence.trim());
      }
    }
  }
  return [...new Set(trends)].slice(0, 10);
}

function extractDynamics(results: SearchResult[]): string[] {
  const dynamics: string[] = [];
  for (const result of results) {
    const sentences = result.content.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (/(?:market|demand|budget|spending|regulation|consolidation|disruption)/i.test(sentence) && sentence.length > 20 && sentence.length < 200) {
        dynamics.push(sentence.trim());
      }
    }
  }
  return [...new Set(dynamics)].slice(0, 10);
}

function extractTechStack(results: SearchResult[]): string[] {
  const techTerms = new Set<string>();
  const knownTech = [
    'Salesforce', 'HubSpot', 'Slack', 'AWS', 'Azure', 'GCP', 'Snowflake',
    'Databricks', 'Stripe', 'Twilio', 'SendGrid', 'Segment', 'Amplitude',
    'Mixpanel', 'Zendesk', 'Intercom', 'Jira', 'Confluence', 'GitHub',
    'GitLab', 'Docker', 'Kubernetes', 'Terraform', 'Datadog', 'PagerDuty',
    'Okta', 'Auth0', 'MongoDB', 'PostgreSQL', 'Redis', 'Elasticsearch',
  ];

  for (const result of results) {
    for (const tech of knownTech) {
      if (result.content.includes(tech)) {
        techTerms.add(tech);
      }
    }
  }

  return [...techTerms];
}

function extractNews(results: SearchResult[]): CompanyResearch['recentNews'] {
  return results.slice(0, 5).map((r) => ({
    title: r.title,
    summary: r.content.slice(0, 200),
    date: undefined, // Exa provides publishedDate but it's in the raw response
  }));
}
