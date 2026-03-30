import { describe, it, expect } from 'vitest';
import {
  applyPcpBoost,
  evaluateSignalTiming,
  adjustChampionScoreByDealHealth,
  scorePortfolioOpportunities,
} from '../../src/orchestration/cross-agent-wiring.js';
import type { ScoringResult } from '../../src/shared/types.js';
import type { AttributeFrequency } from '../../src/agents/pcp-builder/types.js';
import type { DealHealthResult } from '../../src/agents/success-tracker/types.js';
import type { Account } from '../../src/db/schema.js';

// ─── Fixtures ───

function makeBaseResult(overrides: Partial<ScoringResult> = {}): ScoringResult {
  return {
    totalScore: 72,
    tier: 'warm',
    dimensions: {
      valueDelivered: 20,
      relationshipStrength: 15,
      recencyOfWin: 15,
      networkValue: 12,
      askHistory: 10,
    },
    triggerEvent: 'QBR success',
    antiTriggers: [],
    rationale: 'Warm account with good relationship',
    recommendedAction: 'Nurture for 2 weeks then ask',
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'test-id',
    crmAccountId: null,
    companyName: 'Test Corp',
    industry: 'SaaS',
    employeeCount: 500,
    currentAcv: '150000',
    contractStartDate: null,
    renewalDate: null,
    tenureMonths: 24,
    csHealthScore: 85,
    npsScore: 9,
    lastQbrDate: null,
    lastQbrOutcome: null,
    supportEscalationActive: false,
    churnRiskActive: false,
    usageTrend: 'growing',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Account;
}

const STRONG_ICP_WEIGHTS: AttributeFrequency[] = [
  { attribute: 'industry', value: 'SaaS', powerLawFrequency: 1.0, overallFrequency: 0.3, liftScore: 3.33, weight: 1.0, sampleSize: 3 },
  { attribute: 'employee_count_range', value: '200-499', powerLawFrequency: 0.8, overallFrequency: 0.2, liftScore: 4.0, weight: 0.9, sampleSize: 2 },
  { attribute: 'acv_range', value: '75k_250k', powerLawFrequency: 0.9, overallFrequency: 0.25, liftScore: 3.6, weight: 0.95, sampleSize: 3 },
  { attribute: 'usage_trend', value: 'growing', powerLawFrequency: 1.0, overallFrequency: 0.4, liftScore: 2.5, weight: 0.7, sampleSize: 3 },
];

// ─── PCP Boost Tests ───

describe('applyPcpBoost', () => {
  it('boosts warm account to hot when ICP match is excellent', () => {
    const result = applyPcpBoost(
      makeBaseResult({ totalScore: 75, tier: 'warm' }),
      makeAccount(), // SaaS, 500 emp, 150k ACV, growing — matches well
      STRONG_ICP_WEIGHTS
    );

    expect(result.totalScore).toBeGreaterThan(75);
    expect(result.rationale).toContain('PCP boost');
  });

  it('does not exceed 100', () => {
    const result = applyPcpBoost(
      makeBaseResult({ totalScore: 95, tier: 'hot' }),
      makeAccount(),
      STRONG_ICP_WEIGHTS
    );

    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it('returns unchanged result when no weights provided', () => {
    const base = makeBaseResult();
    const result = applyPcpBoost(base, makeAccount(), []);

    expect(result.totalScore).toBe(base.totalScore);
    expect(result.tier).toBe(base.tier);
  });

  it('gives no boost for weak ICP match', () => {
    const result = applyPcpBoost(
      makeBaseResult(),
      makeAccount({ industry: 'Construction', employeeCount: 5, currentAcv: '1000', usageTrend: 'declining' }),
      STRONG_ICP_WEIGHTS
    );

    // No match = no boost
    expect(result.totalScore).toBe(72);
  });
});

// ─── Signal Timing Tests ───

describe('evaluateSignalTiming', () => {
  it('recommends acting when multiple bottom-conversion signals are active', () => {
    const result = evaluateSignalTiming([
      { signalName: 'RFP Issued', relevanceScore: 85, tag: 'sales_led', funnelStage: 'bottom_conversion' },
      { signalName: 'Pricing Page Visit', relevanceScore: 75, tag: 'sales_led', funnelStage: 'bottom_conversion' },
    ], 'ask_pending');

    expect(result.shouldDelay).toBe(false);
    expect(result.reason).toContain('conversion signals');
  });

  it('recommends delay when signals are mostly top-of-funnel', () => {
    const result = evaluateSignalTiming([
      { signalName: 'Blog Subscribe', relevanceScore: 40, tag: 'community_led', funnelStage: 'top_awareness' },
      { signalName: 'Social Engage', relevanceScore: 35, tag: 'community_led', funnelStage: 'top_awareness' },
      { signalName: 'Webinar Attend', relevanceScore: 45, tag: 'event', funnelStage: 'top_awareness' },
    ], 'ask_pending');

    expect(result.shouldDelay).toBe(true);
    expect(result.recommendedWait).toBeGreaterThan(0);
  });

  it('recommends immediate action for competitor signals', () => {
    const result = evaluateSignalTiming([
      { signalName: 'Competitor Outage', relevanceScore: 80, tag: 'competitor', funnelStage: 'mid_consideration' },
      { signalName: 'Blog Subscribe', relevanceScore: 30, tag: 'community_led', funnelStage: 'top_awareness' },
    ], 'ask_pending');

    expect(result.shouldDelay).toBe(false);
    expect(result.reason).toContain('competitor');
  });

  it('returns no delay for balanced signals', () => {
    const result = evaluateSignalTiming([
      { signalName: 'Feature Adoption', relevanceScore: 60, tag: 'product_led', funnelStage: 'mid_consideration' },
    ], 'ask_pending');

    expect(result.shouldDelay).toBe(false);
  });
});

// ─── Champion Deal Health Adjustment Tests ───

describe('adjustChampionScoreByDealHealth', () => {
  it('gives bonus for healthy deals', () => {
    const result = adjustChampionScoreByDealHealth(70, [
      { score: 85, tier: 'healthy', factors: [], recommendedAction: '' },
      { score: 90, tier: 'healthy', factors: [], recommendedAction: '' },
    ]);

    expect(result.adjustedScore).toBeGreaterThan(70);
    expect(result.adjustment).toBeGreaterThan(0);
  });

  it('penalizes for critical deals', () => {
    const result = adjustChampionScoreByDealHealth(70, [
      { score: 10, tier: 'critical', factors: [], recommendedAction: '' },
      { score: 15, tier: 'critical', factors: [], recommendedAction: '' },
    ]);

    expect(result.adjustedScore).toBeLessThan(70);
    expect(result.adjustment).toBeLessThan(0);
  });

  it('balances healthy and stalled deals', () => {
    const result = adjustChampionScoreByDealHealth(70, [
      { score: 85, tier: 'healthy', factors: [], recommendedAction: '' },
      { score: 30, tier: 'stalled', factors: [], recommendedAction: '' },
    ]);

    // +2 for healthy, -2 for stalled = net 0
    expect(result.adjustedScore).toBe(70);
  });

  it('returns unchanged score for no deals', () => {
    const result = adjustChampionScoreByDealHealth(70, []);
    expect(result.adjustedScore).toBe(70);
    expect(result.adjustment).toBe(0);
  });

  it('clamps to 0-100', () => {
    const low = adjustChampionScoreByDealHealth(5, [
      { score: 5, tier: 'critical', factors: [], recommendedAction: '' },
      { score: 5, tier: 'critical', factors: [], recommendedAction: '' },
    ]);
    expect(low.adjustedScore).toBeGreaterThanOrEqual(0);

    const high = adjustChampionScoreByDealHealth(98, [
      { score: 95, tier: 'healthy', factors: [], recommendedAction: '' },
      { score: 95, tier: 'healthy', factors: [], recommendedAction: '' },
      { score: 95, tier: 'healthy', factors: [], recommendedAction: '' },
    ]);
    expect(high.adjustedScore).toBeLessThanOrEqual(100);
  });
});

// ─── Portfolio Opportunity Scoring Tests ───

describe('scorePortfolioOpportunities', () => {
  it('combines confidence and ICP score', () => {
    const targetData = new Map([
      ['TargetA', { industry: 'SaaS', employeeCount: 300, acv: 100000 }],
      ['TargetB', { industry: 'Construction', employeeCount: 10 }],
    ]);

    const result = scorePortfolioOpportunities(
      [
        { targetCompany: 'TargetA', confidence: 0.9 },
        { targetCompany: 'TargetB', confidence: 0.95 },
      ],
      STRONG_ICP_WEIGHTS,
      targetData
    );

    // TargetA has better ICP match despite slightly lower confidence
    expect(result[0].targetCompany).toBe('TargetA');
    expect(result[0].icpScore).toBeGreaterThan(result[1].icpScore);
  });

  it('falls back to confidence when no target data', () => {
    const result = scorePortfolioOpportunities(
      [
        { targetCompany: 'Unknown1', confidence: 0.9 },
        { targetCompany: 'Unknown2', confidence: 0.7 },
      ],
      STRONG_ICP_WEIGHTS,
      new Map()
    );

    // Without ICP data, higher confidence wins
    expect(result[0].targetCompany).toBe('Unknown1');
    expect(result[0].icpScore).toBe(0);
  });

  it('sorts by combined score descending', () => {
    const targetData = new Map([
      ['A', { industry: 'SaaS' }],
      ['B', { industry: 'SaaS' }],
    ]);

    const result = scorePortfolioOpportunities(
      [
        { targetCompany: 'A', confidence: 0.5 },
        { targetCompany: 'B', confidence: 0.9 },
      ],
      STRONG_ICP_WEIGHTS,
      targetData
    );

    for (let i = 1; i < result.length; i++) {
      expect(result[i].combinedScore).toBeLessThanOrEqual(result[i - 1].combinedScore);
    }
  });
});
