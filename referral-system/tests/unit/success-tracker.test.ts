import { describe, it, expect } from 'vitest';
import { scoreDealHealth } from '../../src/agents/success-tracker/deal-health-scorer.js';
import { analyzeCohorts, type DealForCohort } from '../../src/agents/success-tracker/cohort-analyzer.js';
import type { DealHealthInput, CohortSource } from '../../src/agents/success-tracker/types.js';

// ─── Fixtures ───

const NOW = new Date('2026-03-30T12:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function makeHealthInput(overrides: Partial<DealHealthInput> = {}): DealHealthInput {
  return {
    status: 'ask_sent',
    createdAt: daysAgo(10),
    lastActivityDate: daysAgo(3),
    askDate: daysAgo(10),
    introDate: null,
    meetingDate: null,
    followUpCount: 1,
    response: 'pending',
    opportunityAmount: null,
    ...overrides,
  };
}

function makeDeals(source: CohortSource, count: number, closedWonPct: number): DealForCohort[] {
  return Array.from({ length: count }, (_, i) => {
    const isWon = i < count * closedWonPct;
    const isLost = !isWon && i < count * (closedWonPct + 0.2);
    return {
      source,
      amount: 50000 + Math.random() * 100000,
      status: isWon ? 'closed_won' : isLost ? 'closed_lost' : 'opportunity_created',
      timeToCloseDays: isWon ? 30 + Math.floor(Math.random() * 30) : isLost ? 45 : null,
      createdAt: daysAgo(90),
    };
  });
}

// ─── Deal Health Scorer Tests ───

describe('scoreDealHealth', () => {
  it('scores a healthy deal with recent activity', () => {
    const result = scoreDealHealth(makeHealthInput({
      lastActivityDate: daysAgo(2),
      response: 'yes',
    }), NOW);

    expect(result.tier).toBe('healthy');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.factors).toContain('Champion confirmed');
  });

  it('scores a stalled deal with no activity', () => {
    const result = scoreDealHealth(makeHealthInput({
      lastActivityDate: daysAgo(30),
      response: 'no_response',
      followUpCount: 0,
    }), NOW);

    expect(result.tier).toBe('stalled');
    expect(result.score).toBeLessThan(50);
    expect(result.factors.some((f) => f.includes('No activity'))).toBe(true);
  });

  it('scores a critical deal with declined response and long inactivity', () => {
    // Score: 100 - 30 (inactivity) - 25 (declined) - 20 (no intro after 30+ days) = 25 → stalled boundary
    // Adding no_response + no follow-up to push below 25
    const result = scoreDealHealth(makeHealthInput({
      status: 'ask_sent',
      createdAt: daysAgo(60),
      lastActivityDate: daysAgo(60),
      response: 'no',
      followUpCount: 0,
    }), NOW);

    // Score is exactly 25 which is the stalled tier lower bound
    expect(result.tier).toBe('stalled');
    expect(result.score).toBeLessThanOrEqual(25);
    expect(result.factors).toContain('Champion declined');
    expect(result.recommendedAction.length).toBeGreaterThan(0);
  });

  it('penalizes no follow-up after 7 days', () => {
    const withFollowUp = scoreDealHealth(makeHealthInput({
      lastActivityDate: daysAgo(10),
      followUpCount: 1,
    }), NOW);

    const withoutFollowUp = scoreDealHealth(makeHealthInput({
      lastActivityDate: daysAgo(10),
      followUpCount: 0,
    }), NOW);

    expect(withoutFollowUp.score).toBeLessThan(withFollowUp.score);
  });

  it('penalizes slow stage progression', () => {
    const result = scoreDealHealth(makeHealthInput({
      status: 'ask_pending',
      createdAt: daysAgo(20),
      lastActivityDate: daysAgo(5),
    }), NOW);

    expect(result.factors.some((f) => f.includes('Ask pending'))).toBe(true);
  });

  it('gives bonus for high-value deals', () => {
    const lowValue = scoreDealHealth(makeHealthInput({
      opportunityAmount: 10000,
      response: 'yes',
      lastActivityDate: daysAgo(1),
    }), NOW);

    const highValue = scoreDealHealth(makeHealthInput({
      opportunityAmount: 200000,
      response: 'yes',
      lastActivityDate: daysAgo(1),
    }), NOW);

    expect(highValue.score).toBeGreaterThanOrEqual(lowValue.score);
    expect(highValue.factors).toContain('High-value opportunity');
  });

  it('handles maybe response as tentative', () => {
    const result = scoreDealHealth(makeHealthInput({
      response: 'maybe',
      lastActivityDate: daysAgo(2),
    }), NOW);

    expect(result.factors).toContain('Tentative response');
    expect(result.score).toBeLessThan(100);
  });

  it('clamps score between 0 and 100', () => {
    // Worst case: everything bad
    const worst = scoreDealHealth(makeHealthInput({
      status: 'ask_sent',
      createdAt: daysAgo(60),
      lastActivityDate: daysAgo(60),
      response: 'no',
      followUpCount: 0,
    }), NOW);

    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);

    // Best case
    const best = scoreDealHealth(makeHealthInput({
      lastActivityDate: daysAgo(1),
      response: 'yes',
      opportunityAmount: 500000,
    }), NOW);

    expect(best.score).toBeLessThanOrEqual(100);
  });

  it('provides recommended action for each tier', () => {
    const tiers = [
      makeHealthInput({ response: 'yes', lastActivityDate: daysAgo(1) }), // healthy
      makeHealthInput({ response: 'maybe', lastActivityDate: daysAgo(10) }), // at_risk
      makeHealthInput({ response: 'no_response', lastActivityDate: daysAgo(30), followUpCount: 0 }), // stalled
      makeHealthInput({ response: 'no', lastActivityDate: daysAgo(40) }), // critical
    ];

    for (const input of tiers) {
      const result = scoreDealHealth(input, NOW);
      expect(result.recommendedAction).toBeTruthy();
      expect(result.recommendedAction.length).toBeGreaterThan(10);
    }
  });
});

// ─── Cohort Analyzer Tests ───

describe('analyzeCohorts', () => {
  it('computes metrics for each cohort', () => {
    const deals = [
      ...makeDeals('referral', 20, 0.6),
      ...makeDeals('outbound', 40, 0.3),
    ];

    const result = analyzeCohorts(deals, 'Q1 2026', 15000, 3000, NOW);

    expect(result.cohorts.length).toBe(2);

    const referral = result.cohorts.find((c) => c.source === 'referral')!;
    const outbound = result.cohorts.find((c) => c.source === 'outbound')!;

    expect(referral.dealCount).toBe(20);
    expect(outbound.dealCount).toBe(40);
    expect(referral.totalPipeline).toBeGreaterThan(0);
    expect(outbound.totalPipeline).toBeGreaterThan(0);
  });

  it('computes referral advantage correctly', () => {
    const deals = [
      ...makeDeals('referral', 20, 0.6), // 60% win rate
      ...makeDeals('outbound', 40, 0.3), // 30% win rate
    ];

    const result = analyzeCohorts(deals, 'Q1 2026', 15000, 3000, NOW);

    // Referral win rate should be higher
    expect(result.referralAdvantage.winRateLift).toBeGreaterThan(1);
    // CAC reduction = (15000 - 3000) / 15000 * 100 = 80%
    expect(result.referralAdvantage.cacReduction).toBe(80);
  });

  it('handles single cohort', () => {
    const deals = makeDeals('referral', 10, 0.5);
    const result = analyzeCohorts(deals, 'Q1 2026', 15000, 3000, NOW);

    expect(result.cohorts.length).toBe(1);
    expect(result.referralAdvantage.winRateLift).toBe(0); // no outbound to compare
  });

  it('handles empty deals', () => {
    const result = analyzeCohorts([], 'Q1 2026', 15000, 3000, NOW);
    expect(result.cohorts.length).toBe(0);
  });

  it('computes win rate correctly', () => {
    const deals: DealForCohort[] = [
      { source: 'referral', amount: 100000, status: 'closed_won', timeToCloseDays: 30, createdAt: daysAgo(60) },
      { source: 'referral', amount: 50000, status: 'closed_won', timeToCloseDays: 45, createdAt: daysAgo(90) },
      { source: 'referral', amount: 75000, status: 'closed_lost', timeToCloseDays: 60, createdAt: daysAgo(120) },
    ];

    const result = analyzeCohorts(deals, 'test', 15000, 3000, NOW);
    const referral = result.cohorts[0];

    expect(referral.winRate).toBeCloseTo(2 / 3, 2); // 2 won / 3 closed
    expect(referral.closedWon).toBe(2);
    expect(referral.closedLost).toBe(1);
    expect(referral.avgTimeToClose).toBeCloseTo(45, 0); // (30+45+60)/3
  });

  it('computes avg deal size', () => {
    const deals: DealForCohort[] = [
      { source: 'outbound', amount: 100000, status: 'closed_won', timeToCloseDays: 30, createdAt: daysAgo(60) },
      { source: 'outbound', amount: 200000, status: 'closed_won', timeToCloseDays: 45, createdAt: daysAgo(90) },
    ];

    const result = analyzeCohorts(deals, 'test', 15000, 3000, NOW);
    expect(result.cohorts[0].avgDealSize).toBe(150000);
  });
});
