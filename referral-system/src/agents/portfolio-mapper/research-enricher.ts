/**
 * Research Enricher — Uses web search and enrichment APIs to discover
 * corporate relationships (PE/VC portfolios, parent/subsidiary, partnerships).
 */

import type { WebSearchAdapter } from '../../integrations/web-search/interface.js';
import type { EnrichmentAdapter } from '../../integrations/enrichment/interface.js';
import type { EntityRelationship, CorporateEntity } from './types.js';

/**
 * Research corporate relationships for a company using web search.
 */
export async function researchCorporateRelationships(
  companyName: string,
  webSearch: WebSearchAdapter,
  enrichment: EnrichmentAdapter
): Promise<EntityRelationship[]> {
  const relationships: EntityRelationship[] = [];

  // 1. Search for investor/PE/VC relationships
  const investorResults = await webSearch.search(
    `"${companyName}" investor portfolio "backed by" OR "invested in" OR "portfolio company"`,
    { maxResults: 5 }
  );

  for (const result of investorResults) {
    const investors = extractInvestorNames(result.content, companyName);
    for (const investor of investors) {
      relationships.push({
        parentEntity: {
          name: investor.name,
          entityType: 'investor',
        },
        childEntity: {
          name: companyName,
          entityType: 'company',
        },
        relationType: investor.type === 'pe' ? 'pe_portfolio' : 'vc_portfolio',
        confidence: (result.score ?? 0.8) * 0.8, // slightly discount search results
        source: 'web_search',
      });
    }
  }

  // 2. Search for parent company / subsidiary relationships
  const parentResults = await webSearch.search(
    `"${companyName}" "subsidiary of" OR "parent company" OR "acquired by" OR "division of"`,
    { maxResults: 3 }
  );

  for (const result of parentResults) {
    const parents = extractParentNames(result.content, companyName);
    for (const parent of parents) {
      relationships.push({
        parentEntity: {
          name: parent,
          entityType: 'holding_company',
        },
        childEntity: {
          name: companyName,
          entityType: 'company',
        },
        relationType: 'parent_subsidiary',
        confidence: (result.score ?? 0.7) * 0.7,
        source: 'web_search',
      });
    }
  }

  return relationships;
}

/**
 * Discover portfolio siblings — other companies with the same investor.
 */
export async function discoverPortfolioSiblings(
  investorName: string,
  webSearch: WebSearchAdapter
): Promise<string[]> {
  const results = await webSearch.search(
    `"${investorName}" portfolio companies list`,
    { maxResults: 5 }
  );

  const companies = new Set<string>();
  for (const result of results) {
    // Extract company names from portfolio listings
    const names = extractCompanyNames(result.content);
    for (const name of names) {
      companies.add(name);
    }
  }

  return [...companies];
}

// ─── Extraction helpers (rule-based, LLM can enhance later) ───

function extractInvestorNames(
  content: string,
  companyName: string
): { name: string; type: 'pe' | 'vc' }[] {
  const investors: { name: string; type: 'pe' | 'vc' }[] = [];

  // Common patterns: "backed by X", "X invested in", "portfolio of X"
  const patterns = [
    /backed by\s+([A-Z][A-Za-z\s&]+(?:Capital|Partners|Ventures|Group|Management|Equity))/gi,
    /(?:portfolio (?:company|investment) of|invested in by)\s+([A-Z][A-Za-z\s&]+(?:Capital|Partners|Ventures|Group|Management|Equity))/gi,
    /([A-Z][A-Za-z\s&]+(?:Capital|Partners|Ventures|Group|Management|Equity))\s+(?:invested|backed|led)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (name.length > 3 && name.toLowerCase() !== companyName.toLowerCase()) {
        const type = /(?:equity|buyout|growth)/i.test(name) ? 'pe' : 'vc';
        investors.push({ name, type });
      }
    }
  }

  return investors;
}

function extractParentNames(content: string, companyName: string): string[] {
  const parents: string[] = [];

  const patterns = [
    /subsidiary of\s+([A-Z][A-Za-z\s&]+(?:Inc|Corp|Group|Holdings|Ltd))/gi,
    /acquired by\s+([A-Z][A-Za-z\s&]+)/gi,
    /([A-Z][A-Za-z\s&]+(?:Inc|Corp|Group|Holdings|Ltd))\s+(?:owns|acquired|parent)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (name.length > 3 && name.toLowerCase() !== companyName.toLowerCase()) {
        parents.push(name);
      }
    }
  }

  return parents;
}

function extractCompanyNames(content: string): string[] {
  // Simple extraction — real implementation would use LLM or structured data
  const names: string[] = [];
  const pattern = /(?:^|\n)\s*[-•]\s*([A-Z][A-Za-z\s]+(?:Inc|Corp|\.io|\.ai|\.com|Labs|Tech)?)/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1].trim();
    if (name.length > 3 && name.length < 50) {
      names.push(name);
    }
  }
  return names;
}
