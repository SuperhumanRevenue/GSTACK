import { describe, it, expect } from 'vitest';
import { processIntake, buildContextSummary } from '../../src/agents/signal-guide/intake-processor.js';
import { generateCustomGuide, summarizeGuide } from '../../src/agents/signal-guide/guide-generator.js';
import { researchMarket } from '../../src/agents/signal-guide/research-orchestrator.js';
import { ValidationError } from '../../src/shared/errors.js';
import type { CustomerIntakeInput, MasterSignal } from '../../src/agents/signal-guide/types.js';
import type { LLMAdapter } from '../../src/integrations/llm/interface.js';
import type { WebSearchAdapter, SearchResult, CompanyResearch } from '../../src/integrations/web-search/interface.js';

// ─── Test fixtures ───

function buildIntakeInput(overrides: Partial<CustomerIntakeInput> = {}): CustomerIntakeInput {
  return {
    companyName: 'Acme Corp',
    productDescription: 'AI-powered workflow automation for enterprise teams',
    positioning: 'The only automation platform that learns from your team',
    messaging: 'Automate 80% of manual work in 30 days',
    caseStudies: [
      { title: 'BigCo Success', summary: 'Saved 200 hours/month', metrics: ['200 hours saved', '40% cost reduction'] },
    ],
    packaging: [
      { tier: 'Starter', description: 'Up to 10 users', price: '$99/mo' },
      { tier: 'Enterprise', description: 'Unlimited users + SSO', price: 'Custom' },
    ],
    targetIndustries: ['SaaS', 'FinTech'],
    targetPersonas: [
      { title: 'VP Operations', painPoints: ['Manual processes', 'Scaling bottlenecks'], goals: ['Efficiency'] },
      { title: 'CTO', painPoints: ['Integration complexity'], goals: ['Tech consolidation'] },
    ],
    competitors: [
      { name: 'LegacyCo', positioning: 'Market incumbent', weaknesses: ['Slow UI', 'No API'] },
      { name: 'StartupX', positioning: 'Fast mover', weaknesses: ['No enterprise features'] },
    ],
    techStackAdjacencies: ['Salesforce', 'Slack', 'Snowflake'],
    ...overrides,
  };
}

const TEST_SIGNALS: MasterSignal[] = [
  {
    signalName: 'ICP Fit Score Hit',
    whyItMatters: 'They match your target profile perfectly',
    strength: 'high',
    tag: 'sales_led',
    channel: 'dark_funnel',
    funnelStage: 'bottom_conversion',
    hasPlaybook: true,
    playbook: 'Prioritize accounts that match 4+ ICP attributes.',
    categoryOrder: 1,
  },
  {
    signalName: 'Free Tier Signup',
    whyItMatters: 'Top of product-led funnel',
    strength: 'low',
    tag: 'product_led',
    channel: 'product',
    funnelStage: 'top_awareness',
    hasPlaybook: false,
    categoryOrder: 1,
  },
  {
    signalName: 'Partner Referral Received',
    whyItMatters: 'Trusted third-party endorsement',
    strength: 'high',
    tag: 'nearbound',
    channel: 'community',
    funnelStage: 'bottom_conversion',
    hasPlaybook: true,
    playbook: 'Priority fast-track. Warm intro template.',
    categoryOrder: 1,
  },
];

function makeMockLLM(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
  return {
    generateContent: async (prompt: string) => {
      return JSON.stringify({
        customizedName: 'Customized: ICP Fit for Acme Corp',
        customizedDescription: 'Acme Corp matches the ICP perfectly with their enterprise automation focus.',
        customizedPlaybook: 'Route to AE immediately with automation ROI data.',
        relevanceScore: 85,
        exampleTriggers: ['New VP Ops hired at target account', 'Competitor price increase announced'],
      });
    },
    ...overrides,
  };
}

function makeMockWebSearch(): WebSearchAdapter {
  return {
    search: async (query: string): Promise<SearchResult[]> => [
      { title: 'Result 1', url: 'https://example.com', content: `Trend: ${query}`, score: 0.9 },
    ],
    researchCompany: async (companyName: string): Promise<CompanyResearch> => ({
      companyName,
      competitors: [{ name: 'Rival Inc', positioning: 'Legacy player', weaknesses: ['Slow'] }],
      industryTrends: ['AI automation growing 40% YoY'],
      marketDynamics: ['Budget tightening in enterprise'],
      techLandscape: ['Salesforce', 'HubSpot'],
      recentNews: [],
    }),
  };
}

// ─── Intake Processor Tests ───

describe('processIntake', () => {
  it('extracts all fields from a full intake', () => {
    const result = processIntake(buildIntakeInput());

    expect(result.companyName).toBe('Acme Corp');
    expect(result.productDescription).toBe('AI-powered workflow automation for enterprise teams');
    expect(result.valueProposition).toContain('only automation platform');
    expect(result.painPointsSolved).toContain('Manual processes');
    expect(result.painPointsSolved).toContain('Integration complexity');
    expect(result.targetIndustries).toEqual(['SaaS', 'FinTech']);
    expect(result.targetPersonas).toEqual(['VP Operations', 'CTO']);
    expect(result.competitors).toEqual(['LegacyCo', 'StartupX']);
    expect(result.competitorWeaknesses).toContain('Slow UI');
    expect(result.competitorWeaknesses).toContain('No API');
    expect(result.techAdjacencies).toEqual(['Salesforce', 'Slack', 'Snowflake']);
    expect(result.caseStudyMetrics).toContain('200 hours saved');
    expect(result.productTiers.length).toBe(2);
  });

  it('throws ValidationError when company name is missing', () => {
    expect(() => processIntake(buildIntakeInput({ companyName: '' }))).toThrow(ValidationError);
  });

  it('handles minimal intake with only company name', () => {
    const result = processIntake({ companyName: 'Minimal Co' });

    expect(result.companyName).toBe('Minimal Co');
    expect(result.productDescription).toBe('Not provided');
    expect(result.valueProposition).toBe('Not provided');
    expect(result.painPointsSolved).toEqual([]);
    expect(result.competitors).toEqual([]);
    expect(result.techAdjacencies).toEqual([]);
  });

  it('trims whitespace from company name', () => {
    const result = processIntake(buildIntakeInput({ companyName: '  Acme Corp  ' }));
    expect(result.companyName).toBe('Acme Corp');
  });
});

describe('buildContextSummary', () => {
  it('builds a complete summary with all sections', () => {
    const intake = processIntake(buildIntakeInput());
    const summary = buildContextSummary(intake);

    expect(summary).toContain('Company: Acme Corp');
    expect(summary).toContain('Target Industries: SaaS, FinTech');
    expect(summary).toContain('Competitors: LegacyCo, StartupX');
    expect(summary).toContain('Tech Stack Adjacencies: Salesforce, Slack, Snowflake');
  });

  it('omits empty sections', () => {
    const intake = processIntake({ companyName: 'Minimal Co' });
    const summary = buildContextSummary(intake);

    expect(summary).toContain('Company: Minimal Co');
    expect(summary).not.toContain('Competitors:');
    expect(summary).not.toContain('Tech Stack Adjacencies:');
  });
});

// ─── Research Orchestrator Tests ───

describe('researchMarket', () => {
  it('calls web search for company, competitors, industry, and tech', async () => {
    const searchCalls: string[] = [];
    const webSearch = makeMockWebSearch();
    const origSearch = webSearch.search;
    webSearch.search = async (query, opts) => {
      searchCalls.push(query);
      return origSearch(query, opts);
    };

    const intake = processIntake(buildIntakeInput());
    const result = await researchMarket(intake, webSearch);

    // Should have called researchCompany + search for each competitor + industry + tech
    expect(searchCalls.length).toBeGreaterThanOrEqual(3); // 2 competitors + 1 industry + 1 tech
    expect(result.industryTrends.length).toBeGreaterThan(0);
    expect(result.competitorInsights.length).toBeGreaterThan(0);
    expect(result.marketDynamics.length).toBeGreaterThan(0);
    expect(result.techLandscape.length).toBeGreaterThan(0);
  });

  it('handles company with no competitors or tech adjacencies', async () => {
    const intake = processIntake({ companyName: 'Solo Co' });
    const webSearch = makeMockWebSearch();
    const result = await researchMarket(intake, webSearch);

    expect(result.industryTrends.length).toBeGreaterThan(0);
    expect(result.competitorInsights.length).toBeGreaterThan(0); // From researchCompany
  });
});

// ─── Guide Generator Tests ───

describe('generateCustomGuide', () => {
  it('generates customized signals for all master signals', async () => {
    const intake = processIntake(buildIntakeInput());
    const research = {
      industryTrends: ['AI growing'],
      competitorInsights: [{ competitor: 'LegacyCo', findings: ['Losing share'] }],
      marketDynamics: ['Budget tightening'],
      techLandscape: ['Salesforce', 'HubSpot'],
    };

    const result = await generateCustomGuide(
      { masterSignals: TEST_SIGNALS, intake, research },
      makeMockLLM()
    );

    expect(result.length).toBe(TEST_SIGNALS.length);
    for (const signal of result) {
      expect(signal.customizedName).toBeTruthy();
      expect(signal.customizedDescription).toBeTruthy();
      expect(signal.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(signal.relevanceScore).toBeLessThanOrEqual(100);
      expect(typeof signal.active).toBe('boolean');
    }
  });

  it('marks signals below threshold as inactive', async () => {
    const lowRelevanceLLM = makeMockLLM({
      generateContent: async () =>
        JSON.stringify({
          customizedName: 'Low relevance signal',
          customizedDescription: 'Not very relevant.',
          customizedPlaybook: '',
          relevanceScore: 15,
          exampleTriggers: [],
        }),
    });

    const intake = processIntake(buildIntakeInput());
    const research = {
      industryTrends: [],
      competitorInsights: [],
      marketDynamics: [],
      techLandscape: [],
    };

    const result = await generateCustomGuide(
      { masterSignals: TEST_SIGNALS, intake, research },
      lowRelevanceLLM
    );

    for (const signal of result) {
      expect(signal.active).toBe(false);
      expect(signal.relevanceScore).toBeLessThan(30);
    }
  });

  it('falls back to master signal data when LLM fails', async () => {
    const failingLLM = makeMockLLM({
      generateContent: async () => {
        throw new Error('LLM unavailable');
      },
    });

    const intake = processIntake(buildIntakeInput());
    const research = {
      industryTrends: [],
      competitorInsights: [],
      marketDynamics: [],
      techLandscape: [],
    };

    const result = await generateCustomGuide(
      { masterSignals: TEST_SIGNALS, intake, research },
      failingLLM
    );

    expect(result.length).toBe(TEST_SIGNALS.length);
    // Fallback uses relevanceScore = 50 and master signal names
    for (const signal of result) {
      expect(signal.relevanceScore).toBe(50);
      expect(signal.customizedName).toBe(signal.masterSignal.signalName);
      expect(signal.active).toBe(true); // 50 >= 30 threshold
    }
  });

  it('clamps relevance score to 0-100 range', async () => {
    const outOfRangeLLM = makeMockLLM({
      generateContent: async () =>
        JSON.stringify({
          customizedName: 'Over 100',
          customizedDescription: 'Too high.',
          customizedPlaybook: '',
          relevanceScore: 150,
          exampleTriggers: [],
        }),
    });

    const intake = processIntake(buildIntakeInput());
    const research = { industryTrends: [], competitorInsights: [], marketDynamics: [], techLandscape: [] };

    const result = await generateCustomGuide(
      { masterSignals: TEST_SIGNALS, intake, research },
      outOfRangeLLM
    );

    for (const signal of result) {
      expect(signal.relevanceScore).toBeLessThanOrEqual(100);
    }
  });
});

describe('summarizeGuide', () => {
  it('produces correct summary stats', async () => {
    const intake = processIntake(buildIntakeInput());
    const research = {
      industryTrends: [],
      competitorInsights: [],
      marketDynamics: [],
      techLandscape: [],
    };

    const signals = await generateCustomGuide(
      { masterSignals: TEST_SIGNALS, intake, research },
      makeMockLLM()
    );
    const summary = summarizeGuide(signals);

    expect(summary.totalSignals).toBe(3);
    expect(summary.activeSignals + summary.inactiveSignals).toBe(3);
    expect(Object.keys(summary.byTag).length).toBeGreaterThan(0);
    expect(summary.topSignals.length).toBeLessThanOrEqual(10);
    expect(summary.topSignals.length).toBeGreaterThan(0);
  });

  it('groups signals by tag correctly', async () => {
    const intake = processIntake(buildIntakeInput());
    const research = { industryTrends: [], competitorInsights: [], marketDynamics: [], techLandscape: [] };

    const signals = await generateCustomGuide(
      { masterSignals: TEST_SIGNALS, intake, research },
      makeMockLLM()
    );
    const summary = summarizeGuide(signals);

    // TEST_SIGNALS has sales_led, product_led, nearbound
    expect(summary.byTag['sales_led']).toBeDefined();
    expect(summary.byTag['product_led']).toBeDefined();
    expect(summary.byTag['nearbound']).toBeDefined();
    expect(summary.byTag['sales_led'].total).toBe(1);
    expect(summary.byTag['product_led'].total).toBe(1);
    expect(summary.byTag['nearbound'].total).toBe(1);
  });
});
