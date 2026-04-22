import { describe, it, expect } from 'vitest';
import { scoreSuperReferrer, assignTier, TIER_THRESHOLDS } from '../../src/agents/program-manager/super-referrer.js';
import { buildChampion, STRONG_CHAMPION } from '../fixtures/champions.js';
import { buildReferral } from '../fixtures/referrals.js';

describe('Program Manager: Super-Referrer Scoring', () => {
  describe('scoreSuperReferrer', () => {
    it('scores a champion with multiple closed-won referrals highly', () => {
      const referrals = [
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'closed_won', closedAmount: '100000', timeToCloseDays: 30, introDate: new Date(), meetingDate: new Date(), response: 'yes' }),
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'closed_won', closedAmount: '80000', timeToCloseDays: 25, introDate: new Date(), meetingDate: new Date(), response: 'yes' }),
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'closed_won', closedAmount: '120000', timeToCloseDays: 40, introDate: new Date(), meetingDate: new Date(), response: 'yes' }),
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'intro_sent', introDate: new Date(), response: 'yes' }),
      ];

      const result = scoreSuperReferrer({ champion: STRONG_CHAMPION, referrals });
      expect(result.superScore).toBeGreaterThanOrEqual(60);
      expect(result.tier).toMatch(/platinum|gold/);
    });

    it('scores a champion with no closed deals as bronze', () => {
      const referrals = [
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'ask_sent', response: 'maybe' }),
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'declined', response: 'no' }),
      ];

      const result = scoreSuperReferrer({ champion: STRONG_CHAMPION, referrals });
      expect(result.tier).toBe('bronze');
    });

    it('calculates stats correctly', () => {
      const referrals = [
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'closed_won', closedAmount: '100000', timeToCloseDays: 45, introDate: new Date(), meetingDate: new Date(), response: 'yes' }),
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'intro_sent', introDate: new Date(), response: 'yes' }),
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'declined', response: 'no' }),
      ];

      const result = scoreSuperReferrer({ champion: STRONG_CHAMPION, referrals });
      expect(result.stats.totalReferrals).toBe(3);
      expect(result.stats.totalIntros).toBe(2);
      expect(result.stats.totalClosed).toBe(1);
      expect(result.stats.totalRevenue).toBe(100000);
      expect(result.stats.avgDealSize).toBe(100000);
      expect(result.stats.avgTimeToClose).toBe(45);
    });

    it('returns all 5 dimension scores', () => {
      const referrals = [
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'closed_won', closedAmount: '50000', timeToCloseDays: 30, introDate: new Date(), meetingDate: new Date(), response: 'yes' }),
      ];

      const result = scoreSuperReferrer({ champion: STRONG_CHAMPION, referrals });
      expect(result.volumeScore).toBeGreaterThanOrEqual(0);
      expect(result.volumeScore).toBeLessThanOrEqual(20);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(25);
      expect(result.valueScore).toBeGreaterThanOrEqual(0);
      expect(result.valueScore).toBeLessThanOrEqual(20);
      expect(result.networkScore).toBeGreaterThanOrEqual(0);
      expect(result.networkScore).toBeLessThanOrEqual(20);
      expect(result.velocityScore).toBeGreaterThanOrEqual(0);
      expect(result.velocityScore).toBeLessThanOrEqual(15);
    });

    it('total score is sum of dimensions', () => {
      const referrals = [
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'closed_won', closedAmount: '200000', timeToCloseDays: 20, introDate: new Date(), meetingDate: new Date(), response: 'yes' }),
        buildReferral({ championId: STRONG_CHAMPION.id, status: 'closed_won', closedAmount: '150000', timeToCloseDays: 35, introDate: new Date(), meetingDate: new Date(), response: 'yes' }),
      ];

      const result = scoreSuperReferrer({ champion: STRONG_CHAMPION, referrals });
      const sum = result.volumeScore + result.qualityScore + result.valueScore + result.networkScore + result.velocityScore;
      expect(result.superScore).toBe(sum);
    });

    it('handles champion with no referrals', () => {
      const result = scoreSuperReferrer({ champion: STRONG_CHAMPION, referrals: [] });
      // Network score may still contribute from champion's networkReachScore
      expect(result.volumeScore).toBe(0);
      expect(result.qualityScore).toBe(0);
      expect(result.valueScore).toBe(0);
      expect(result.velocityScore).toBe(0);
      expect(result.tier).toBe('bronze');
      expect(result.stats.totalReferrals).toBe(0);
    });
  });

  describe('assignTier', () => {
    it('assigns platinum at threshold', () => {
      expect(assignTier(80)).toBe('platinum');
      expect(assignTier(100)).toBe('platinum');
    });

    it('assigns gold at threshold', () => {
      expect(assignTier(60)).toBe('gold');
      expect(assignTier(79)).toBe('gold');
    });

    it('assigns silver at threshold', () => {
      expect(assignTier(40)).toBe('silver');
      expect(assignTier(59)).toBe('silver');
    });

    it('assigns bronze below silver', () => {
      expect(assignTier(39)).toBe('bronze');
      expect(assignTier(0)).toBe('bronze');
    });
  });
});
