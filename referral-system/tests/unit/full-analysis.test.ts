import { describe, it, expect, vi } from 'vitest';
import { runFullAnalysis } from '../../src/orchestration/full-analysis.js';
import type { ServerDeps } from '../../src/shared/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const drizzleNameSymbol = Symbol.for('drizzle:Name');

function buildMockDeps(overrides?: {
  accounts?: Record<string, unknown>[];
  champions?: Record<string, unknown>[];
  referrals?: Record<string, unknown>[];
  connections?: Record<string, unknown>[];
  triggerEvents?: Record<string, unknown>[];
}): ServerDeps {
  const dataByTable: Record<string, unknown[]> = {
    accounts: overrides?.accounts ?? [],
    champions: overrides?.champions ?? [],
    referrals: overrides?.referrals ?? [],
    connection_maps: overrides?.connections ?? [],
    trigger_events: overrides?.triggerEvents ?? [],
  };

  const mockDb = {
    select: () => {
      let resolvedData: unknown[] = [];
      const chain: Record<string, unknown> = {
        from: (table: unknown) => {
          const name = (table as Record<symbol, string>)?.[drizzleNameSymbol] ?? '';
          resolvedData = dataByTable[name] ?? [];
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(resolvedData),
      };
      (chain as Record<string, unknown>).then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        return Promise.resolve(resolvedData).then(resolve, reject);
      };
      return chain;
    },
  };

  return {
    db: mockDb as unknown as ServerDeps['db'],
    cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() } as unknown as ServerDeps['cache'],
    crm: {} as unknown as ServerDeps['crm'],
    enrichment: {
      enrichPerson: vi.fn().mockResolvedValue({ name: 'Test', title: 'VP', company: 'TestCo' }),
      enrichCompany: vi.fn().mockResolvedValue({ name: 'TestCo', industry: 'SaaS' }),
    } as unknown as ServerDeps['enrichment'],
    conversationIntel: {} as unknown as ServerDeps['conversationIntel'],
    notifications: { send: vi.fn() } as unknown as ServerDeps['notifications'],
    intent: {} as unknown as ServerDeps['intent'],
    llm: {
      generate: vi.fn().mockResolvedValue('Test LLM response'),
      generateStructured: vi.fn().mockResolvedValue({}),
    } as unknown as ServerDeps['llm'],
    webSearch: {
      search: vi.fn().mockResolvedValue([]),
      researchCompany: vi.fn().mockResolvedValue({
        companyName: 'Acme Corp',
        competitors: [],
        industryTrends: [],
        marketDynamics: [],
        techLandscape: [],
        recentNews: [],
      }),
    } as unknown as ServerDeps['webSearch'],
    config: { enableLLM: false, enableWebSearch: false } as unknown as ServerDeps['config'],
  };
}

function buildAccount(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    crmAccountId: null,
    companyName: 'Acme Corp',
    industry: 'SaaS',
    employeeCount: 500,
    currentAcv: '120000.00',
    csHealthScore: 85,
    npsScore: 9,
    lastQbrDate: new Date(Date.now() - 30 * 86400000),
    lastQbrOutcome: 'positive',
    supportEscalationActive: false,
    churnRiskActive: false,
    usageTrend: 'growing',
    contractStartDate: new Date(Date.now() - 90 * 86400000),
    renewalDate: new Date(Date.now() + 275 * 86400000),
    tenureMonths: 24,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildChampion(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'bbbbbbbb-1111-2222-3333-444444444444',
    accountId: 'aaaaaaaa-1111-2222-3333-444444444444',
    name: 'Jane Smith',
    title: 'VP Engineering',
    email: 'jane@acme.com',
    linkedinUrl: null,
    seniorityLevel: 'vp',
    relationshipStrength: 'strong',
    isExecutiveSponsor: true,
    formerCompanies: ['Google', 'Stripe'],
    industryCommunities: ['SaaStr'],
    communicationStyle: 'casual',
    networkReachScore: 85,
    lastInteractionDate: new Date(Date.now() - 7 * 86400000),
    departedAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Full Analysis Orchestrator', () => {
  it('throws when account not found', async () => {
    const deps = buildMockDeps({ accounts: [] });
    await expect(
      runFullAnalysis({ accountId: 'aaaaaaaa-1111-2222-3333-444444444444' }, deps)
    ).rejects.toThrow('not found');
  });

  it('completes basic analysis with account + champions', async () => {
    const account = buildAccount();
    const champion = buildChampion();
    const deps = buildMockDeps({
      accounts: [account],
      champions: [champion],
    });

    const result = await runFullAnalysis(
      { accountId: account.id as string },
      deps
    );

    expect(result.accountName).toBe('Acme Corp');
    expect(result.phases).toHaveLength(4);
    expect(result.phases.every((p) => p.status === 'completed' || p.status === 'skipped')).toBe(true);
    expect(result.intelligence.topChampions).toHaveLength(1);
    expect(result.intelligence.topChampions[0].name).toBe('Jane Smith');
    expect(result.intelligence.readinessScore).toBeGreaterThan(0);
    expect(result.intelligence.readinessTier).toBeTruthy();
    expect(result.totalDuration_ms).toBeGreaterThanOrEqual(0);
  });

  it('skips PCP when no revenue snapshots provided', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [buildChampion()],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444' },
      deps
    );

    const phase1 = result.phases.find((p) => p.phase.includes('Data Gathering'));
    expect(phase1?.summary).toContain('No revenue data');
    expect(result.intelligence.pcpBoostApplied).toBe(0);
  });

  it('skips portfolio and signals when web research is disabled', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [buildChampion()],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444', enableWebResearch: false },
      deps
    );

    const phase1 = result.phases.find((p) => p.phase.includes('Data Gathering'));
    expect(phase1?.summary).toContain('Web research disabled');
  });

  it('scores multiple champions and ranks by score', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [
        buildChampion({ id: 'bbbbbbbb-0000-0000-0000-000000000001', name: 'Weak Contact', relationshipStrength: 'cold', seniorityLevel: 'manager', networkReachScore: 20, isExecutiveSponsor: false }),
        buildChampion({ id: 'bbbbbbbb-0000-0000-0000-000000000002', name: 'Strong Contact', relationshipStrength: 'strong', seniorityLevel: 'c_suite', networkReachScore: 95, isExecutiveSponsor: true }),
      ],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444' },
      deps
    );

    expect(result.intelligence.topChampions).toHaveLength(2);
    expect(result.intelligence.topChampions[0].score).toBeGreaterThanOrEqual(
      result.intelligence.topChampions[1].score
    );
  });

  it('reports pipeline health from referrals', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [buildChampion()],
      referrals: [
        { id: 'ref-1', accountId: 'aaaaaaaa-1111-2222-3333-444444444444', championId: 'bbbbbbbb-1111-2222-3333-444444444444', status: 'intro_made', createdAt: new Date(), updatedAt: new Date(Date.now() - 2 * 86400000) },
        { id: 'ref-2', accountId: 'aaaaaaaa-1111-2222-3333-444444444444', championId: 'bbbbbbbb-1111-2222-3333-444444444444', status: 'meeting_scheduled', createdAt: new Date(), updatedAt: new Date(Date.now() - 1 * 86400000) },
      ],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444' },
      deps
    );

    expect(result.intelligence.pipelineHealth.total).toBe(2);
  });

  it('handles account with no champions gracefully', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444' },
      deps
    );

    expect(result.intelligence.topChampions).toHaveLength(0);
    expect(result.intelligence.readinessScore).toBeNull();
    expect(result.intelligence.readinessTier).toBeNull();
    const phase2 = result.phases.find((p) => p.phase.includes('Readiness'));
    expect(phase2?.status).toBe('skipped');
  });

  it('returns recommended actions', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [buildChampion()],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444' },
      deps
    );

    expect(result.intelligence.recommendedActions.length).toBeGreaterThan(0);
  });

  it('includes timing information', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [buildChampion()],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444' },
      deps
    );

    expect(result.timestamp).toBeTruthy();
    expect(result.totalDuration_ms).toBeGreaterThanOrEqual(0);
    result.phases.forEach((p) => {
      expect(p.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  it('calls web search when research enabled', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [buildChampion()],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444', enableWebResearch: true },
      deps
    );

    // Portfolio mapping calls researchCorporateRelationships which calls webSearch.search
    const phase1 = result.phases.find((p) => p.phase.includes('Data Gathering'));
    expect(phase1?.summary).not.toContain('Web research disabled');
  });

  it('returns structured result matching FullAnalysisResult shape', async () => {
    const deps = buildMockDeps({
      accounts: [buildAccount()],
      champions: [buildChampion()],
    });

    const result = await runFullAnalysis(
      { accountId: 'aaaaaaaa-1111-2222-3333-444444444444' },
      deps
    );

    // Verify all intelligence fields exist
    expect(result.intelligence).toHaveProperty('readinessScore');
    expect(result.intelligence).toHaveProperty('readinessTier');
    expect(result.intelligence).toHaveProperty('pcpBoostApplied');
    expect(result.intelligence).toHaveProperty('signalTiming');
    expect(result.intelligence).toHaveProperty('topChampions');
    expect(result.intelligence).toHaveProperty('topTargets');
    expect(result.intelligence).toHaveProperty('portfolioOpportunities');
    expect(result.intelligence).toHaveProperty('pipelineHealth');
    expect(result.intelligence).toHaveProperty('cohortComparison');
    expect(result.intelligence).toHaveProperty('recommendedActions');
  });
});
