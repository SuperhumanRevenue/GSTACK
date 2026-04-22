import type { WebSearchAdapter, CompanyResearch } from '../../integrations/web-search/interface.js';
import type { ProcessedIntake } from './intake-processor.js';

/**
 * Orchestrates web search calls to build market research for a customer.
 * Calls the WebSearchAdapter to discover competitors, trends, and tech landscape.
 */

export interface ResearchResult {
  industryTrends: string[];
  competitorInsights: { competitor: string; findings: string[] }[];
  marketDynamics: string[];
  techLandscape: string[];
}

export async function researchMarket(
  intake: ProcessedIntake,
  webSearch: WebSearchAdapter
): Promise<ResearchResult> {
  // 1. Research the company itself
  const companyResearch = await webSearch.researchCompany(intake.companyName);

  // 2. Research each known competitor
  const competitorInsights: { competitor: string; findings: string[] }[] = [];
  for (const competitor of intake.competitors) {
    const results = await webSearch.search(
      `${competitor} product strategy weaknesses customer complaints ${new Date().getFullYear()}`,
      { maxResults: 5 }
    );
    competitorInsights.push({
      competitor,
      findings: results.map((r) => r.content).slice(0, 3),
    });
  }

  // 3. Research industry-specific signals
  const industryResults = await webSearch.search(
    `${intake.targetIndustries.join(' ')} industry trends buying signals ${new Date().getFullYear()}`,
    { maxResults: 5 }
  );

  // 4. Research tech stack adjacencies
  const techResults = intake.techAdjacencies.length > 0
    ? await webSearch.search(
        `${intake.techAdjacencies.slice(0, 5).join(' ')} integration market trends`,
        { maxResults: 3 }
      )
    : [];

  return {
    industryTrends: [
      ...companyResearch.industryTrends,
      ...industryResults.map((r) => r.content),
    ],
    competitorInsights: [
      ...companyResearch.competitors.map((c) => ({
        competitor: c.name,
        findings: [c.positioning ?? '', ...(c.weaknesses ?? [])].filter(Boolean),
      })),
      ...competitorInsights,
    ],
    marketDynamics: companyResearch.marketDynamics,
    techLandscape: [
      ...companyResearch.techLandscape,
      ...techResults.map((r) => r.content),
    ],
  };
}
