import pino from 'pino';
import type { WebSearchAdapter, SearchOptions, SearchResult, CompanyResearch } from './interface.js';

const logger = pino({ name: 'web-search-stub' });

/**
 * Web search stub — returns plausible fixture data for testing.
 * In production, swap for Tavily or Brave Search adapter.
 */
export class WebSearchStub implements WebSearchAdapter {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    logger.debug({ query }, 'Web search stub: searching');
    return [
      {
        title: `Search result for: ${query}`,
        url: 'https://example.com/result-1',
        content: `Relevant information about ${query} found in industry publications.`,
        score: 0.9,
      },
      {
        title: `Industry report: ${query}`,
        url: 'https://example.com/result-2',
        content: `Market analysis covering trends related to ${query}.`,
        score: 0.8,
      },
    ];
  }

  async researchCompany(companyName: string): Promise<CompanyResearch> {
    logger.debug({ companyName }, 'Web search stub: researching company');
    return {
      companyName,
      competitors: [
        { name: 'Competitor A', positioning: 'Market leader in legacy solutions', weaknesses: ['Slow to innovate', 'High pricing'] },
        { name: 'Competitor B', positioning: 'Emerging challenger', weaknesses: ['Limited enterprise features', 'Small team'] },
      ],
      industryTrends: [
        'AI-driven automation replacing manual workflows',
        'Consolidation of point solutions into platforms',
        'Shift from on-premise to cloud-native',
      ],
      marketDynamics: [
        'Budget tightening driving ROI-focused purchasing',
        'Compliance requirements creating urgency',
        'Remote work expanding addressable market',
      ],
      techLandscape: [
        'Salesforce', 'HubSpot', 'Slack', 'Snowflake', 'AWS',
      ],
      recentNews: [
        { title: `${companyName} raises Series B`, summary: 'Growth funding to expand enterprise sales', date: '2026-03-15' },
      ],
    };
  }
}
