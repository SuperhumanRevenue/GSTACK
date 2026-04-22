/**
 * Web search adapter interface — used for market research and corporate data discovery.
 */

export interface WebSearchAdapter {
  /** Run a general web search query */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /** Research a specific company — competitors, market position, recent news */
  researchCompany(companyName: string): Promise<CompanyResearch>;
}

export interface SearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface CompanyResearch {
  companyName: string;
  competitors: { name: string; positioning?: string; weaknesses?: string[] }[];
  industryTrends: string[];
  marketDynamics: string[];
  techLandscape: string[];
  recentNews: { title: string; summary: string; date?: string }[];
}
