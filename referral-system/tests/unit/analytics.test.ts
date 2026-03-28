import { describe, it, expect } from 'vitest';
import { generateMonthlyHealth, generateLeadershipSummary, recalibrateModel } from '../../src/agents/program-manager/analytics.js';
import { buildAccount, HOT_ACCOUNT, WARM_ACCOUNT } from '../fixtures/accounts.js';
import { buildChampion, STRONG_CHAMPION } from '../fixtures/champions.js';
import { buildReferral } from '../fixtures/referrals.js';
import type { ReadinessScore, SuperReferrer } from '../../src/db/schema.js';

// ─── Helpers ───

function buildScore(overrides?: Partial<ReadinessScore>): ReadinessScore {
  return {
    id: '00000000-0000-0000-0004-000000000001',
    accountId: HOT_ACCOUNT.id!,
    championId: STRONG_CHAMPION.id!,
    totalScore: 85,
    tier: 'hot',
    valueDeliveredScore: 22,
    relationshipStrengthScore: 18,
    recencyOfWinScore: 16,
    networkValueScore: 15,
    askHistoryScore: 14,
    triggerEvent: 'qbr_success',
    triggerDate: new Date(),
    antiTriggers: [],
    scoringRationale: 'test',
    scoredAt: new Date(),
    ...overrides,
  } as ReadinessScore;
}

function buildSuperReferrer(overrides?: Partial<SuperReferrer>): SuperReferrer {
  return {
    id: '00000000-0000-0000-0005-000000000001',
    championId: STRONG_CHAMPION.id!,
    superScore: 75,
    tier: 'gold',
    volumeScore: 15,
    qualityScore: 20,
    valueScore: 15,
    networkScore: 15,
    velocityScore: 10,
    totalReferrals: 5,
    totalIntros: 4,
    totalMeetings: 3,
    totalClosed: 2,
    totalRevenue: '240000',
    avgDealSize: '120000',
    avgTimeToClose: 35,
    responseRate: '0.8000',
    lastReferralDate: new Date(),
    programJoinDate: new Date(),
    rewardsDelivered: [],
    recalculatedAt: new Date(),
    ...overrides,
  } as SuperReferrer;
}

// ─── Monthly Health ───

describe('Program Manager: Analytics', () => {
  describe('generateMonthlyHealth', () => {
    it('generates a complete monthly health report', () => {
      const report = generateMonthlyHealth({
        month: 'March',
        year: 2026,
        accounts: [HOT_ACCOUNT, WARM_ACCOUNT],
        readinessScores: [
          buildScore({ accountId: HOT_ACCOUNT.id!, tier: 'hot' }),
          buildScore({ accountId: WARM_ACCOUNT.id!, tier: 'warm', id: 'score-2' }),
        ],
        referrals: [
          buildReferral({ accountId: HOT_ACCOUNT.id!, status: 'closed_won', closedAmount: '100000', askDate: new Date(), introDate: new Date(), meetingDate: new Date(), timeToCloseDays: 30, opportunityAmount: '100000' }),
          buildReferral({ accountId: WARM_ACCOUNT.id!, status: 'ask_sent', askDate: new Date() }),
        ],
        champions: [STRONG_CHAMPION],
        superReferrers: [buildSuperReferrer()],
        outboundCac: 15000,
        programCost: 50000,
      });

      expect(report.period.month).toBe('March');
      expect(report.period.year).toBe(2026);
      expect(report.portfolioHealth.totalAccounts).toBe(2);
      expect(report.portfolioHealth.hot.count).toBe(1);
      expect(report.portfolioHealth.warm.count).toBe(1);
      expect(report.activity.asksMade).toBe(2);
      expect(report.activity.pipelineValue).toBeGreaterThan(0);
      expect(report.lifetime.closedWon).toBe(100000);
      expect(report.lifetime.outboundCac).toBe(15000);
      expect(report.actionsNextMonth.length).toBeGreaterThan(0);
    });

    it('handles empty data gracefully', () => {
      const report = generateMonthlyHealth({
        month: 'January',
        year: 2026,
        accounts: [],
        readinessScores: [],
        referrals: [],
        champions: [],
        superReferrers: [],
        outboundCac: 15000,
        programCost: 0,
      });

      expect(report.portfolioHealth.totalAccounts).toBe(0);
      expect(report.activity.asksMade).toBe(0);
      expect(report.actionsNextMonth.length).toBeGreaterThan(0);
    });
  });

  describe('generateLeadershipSummary', () => {
    it('generates headline metrics', () => {
      const summary = generateLeadershipSummary({
        referrals: [
          buildReferral({ status: 'closed_won', closedAmount: '200000', timeToCloseDays: 40, opportunityAmount: '200000', introDate: new Date() }),
        ],
        champions: [STRONG_CHAMPION],
        superReferrers: [buildSuperReferrer()],
        outboundCac: 15000,
        programCost: 30000,
        quarterLabel: 'Q1 2026',
      });

      expect(summary.headlineMetrics.referralClosedWon).toBe(200000);
      expect(summary.headlineMetrics.referralPipelineGenerated).toBe(200000);
      expect(summary.investmentVsReturn.roiMultiple).toBeGreaterThan(0);
      expect(summary.topWins.length).toBeGreaterThan(0);
    });
  });

  describe('recalibrateModel', () => {
    it('returns insufficient_data when below minimum sample', () => {
      const result = recalibrateModel({
        referrals: [
          buildReferral({ status: 'closed_won' }),
          buildReferral({ status: 'declined' }),
        ],
        readinessScores: [],
        minSampleSize: 50,
      });

      expect(result.status).toBe('insufficient_data');
      expect(result.sampleSize).toBe(2);
    });

    it('runs recalibration with sufficient data', () => {
      // Generate 60 referrals — 30 won, 30 lost
      const refs = [];
      const scores = [];
      for (let i = 0; i < 30; i++) {
        const accountId = `acct-won-${i}`;
        refs.push(buildReferral({ accountId, status: 'closed_won' }));
        scores.push(buildScore({ accountId, totalScore: 85, valueDeliveredScore: 23, relationshipStrengthScore: 18 }));
      }
      for (let i = 0; i < 30; i++) {
        const accountId = `acct-lost-${i}`;
        refs.push(buildReferral({ accountId, status: 'closed_lost' }));
        scores.push(buildScore({ accountId, totalScore: 45, valueDeliveredScore: 8, relationshipStrengthScore: 8, tier: 'not_yet' }));
      }

      const result = recalibrateModel({
        referrals: refs,
        readinessScores: scores,
        minSampleSize: 50,
      });

      expect(result.status).toBe('recalibrated');
      expect(result.sampleSize).toBe(60);
    });
  });
});
