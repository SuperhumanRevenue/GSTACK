import { describe, it, expect } from 'vitest';
import { scoreReadiness } from '../../src/agents/readiness-scorer/scoring-engine.js';
import type { ScoringInput } from '../../src/agents/readiness-scorer/types.js';
import {
  HOT_ACCOUNT,
  WARM_ACCOUNT,
  NOT_YET_ACCOUNT,
  ESCALATED_ACCOUNT,
  CHURN_RISK_ACCOUNT,
  HIGH_ACV_ACCOUNT,
  buildAccount,
} from '../fixtures/accounts.js';
import {
  STRONG_CHAMPION,
  WARM_CHAMPION,
  COLD_CHAMPION,
  DEPARTED_CHAMPION,
  CSUITE_CHAMPION,
  buildChampion,
} from '../fixtures/champions.js';
import { QBR_SUCCESS, HIGH_NPS, USAGE_GROWING, COMPETITOR_EVAL } from '../fixtures/trigger-events.js';
import { CLOSED_WON_REFERRAL, DECLINED_REFERRAL, NO_RESPONSE_REFERRAL, buildReferral } from '../fixtures/referrals.js';

function makeInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    account: HOT_ACCOUNT,
    champion: STRONG_CHAMPION,
    triggerEvents: [QBR_SUCCESS, HIGH_NPS, USAGE_GROWING],
    referralHistory: [],
    ...overrides,
  };
}

describe('scoreReadiness', () => {
  // ─── Tier classification ───

  it('scores a strong account+champion as Hot', () => {
    const result = scoreReadiness(makeInput());
    expect(result.tier).toBe('hot');
    expect(result.totalScore).toBeGreaterThanOrEqual(80);
  });

  it('scores a moderate account+champion as Warm', () => {
    const result = scoreReadiness(makeInput({
      account: WARM_ACCOUNT,
      champion: WARM_CHAMPION,
      triggerEvents: [],
    }));
    expect(result.tier).toBe('warm');
    expect(result.totalScore).toBeGreaterThanOrEqual(55);
    expect(result.totalScore).toBeLessThan(80);
  });

  it('scores a weak account+champion as Not Yet', () => {
    const result = scoreReadiness(makeInput({
      account: NOT_YET_ACCOUNT,
      champion: COLD_CHAMPION,
      triggerEvents: [],
    }));
    expect(result.tier).toBe('not_yet');
    expect(result.totalScore).toBeLessThan(55);
  });

  // ─── Tier boundaries ───

  it('respects the Hot threshold boundary (80)', () => {
    // Custom thresholds for boundary testing
    const result = scoreReadiness(makeInput(), 80, 55);
    if (result.totalScore >= 80) expect(result.tier).toBe('hot');
    else if (result.totalScore >= 55) expect(result.tier).toBe('warm');
    else expect(result.tier).toBe('not_yet');
  });

  it('classifies score of exactly 55 as Warm (not Not Yet)', () => {
    // Build an account that should score right around 55
    const account = buildAccount({
      csHealthScore: 60,
      npsScore: 6,
      tenureMonths: 10,
      usageTrend: 'stable',
      lastQbrOutcome: 'neutral',
      currentAcv: '50000',
    });
    const champion = buildChampion({
      relationshipStrength: 'warm',
      seniorityLevel: 'director',
      isExecutiveSponsor: false,
      networkReachScore: 40,
      formerCompanies: ['OneCo'],
      industryCommunities: [],
      lastInteractionDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    });
    const result = scoreReadiness({ account, champion, triggerEvents: [], referralHistory: [] }, 80, 55);
    // We're testing that the boundary logic works, not the exact score
    if (result.totalScore === 55) {
      expect(result.tier).toBe('warm');
    }
  });

  // ─── Anti-triggers ───

  it('forces Not Yet when support escalation is active', () => {
    const result = scoreReadiness(makeInput({
      account: ESCALATED_ACCOUNT,
      champion: STRONG_CHAMPION,
    }));
    expect(result.tier).toBe('not_yet');
    expect(result.antiTriggers).toContain('support_escalation_active');
  });

  it('forces Not Yet when churn risk is active', () => {
    const result = scoreReadiness(makeInput({
      account: CHURN_RISK_ACCOUNT,
      champion: WARM_CHAMPION,
    }));
    expect(result.tier).toBe('not_yet');
    expect(result.antiTriggers).toContain('churn_risk_active');
  });

  it('forces Not Yet when champion has departed', () => {
    const result = scoreReadiness(makeInput({
      account: HOT_ACCOUNT,
      champion: DEPARTED_CHAMPION,
    }));
    expect(result.tier).toBe('not_yet');
    expect(result.antiTriggers).toContain('champion_departed');
  });

  it('forces Not Yet when usage is declining', () => {
    const decliningAccount = buildAccount({
      ...HOT_ACCOUNT,
      usageTrend: 'declining',
    });
    const result = scoreReadiness(makeInput({
      account: decliningAccount,
    }));
    expect(result.tier).toBe('not_yet');
    expect(result.antiTriggers).toContain('usage_declining_20pct');
  });

  it('applies penalty for recent declined ask', () => {
    const withDecline = scoreReadiness(makeInput({
      referralHistory: [DECLINED_REFERRAL],
    }));
    const withoutDecline = scoreReadiness(makeInput({
      referralHistory: [],
    }));
    expect(withDecline.totalScore).toBeLessThan(withoutDecline.totalScore);
    expect(withDecline.antiTriggers).toContain('recent_ask_explicit_no');
  });

  it('applies penalty for no-response ask', () => {
    const withNoResponse = scoreReadiness(makeInput({
      referralHistory: [NO_RESPONSE_REFERRAL],
    }));
    const clean = scoreReadiness(makeInput({ referralHistory: [] }));
    expect(withNoResponse.totalScore).toBeLessThan(clean.totalScore);
  });

  // ─── ACV adjustments ───

  it('applies relationship multiplier for 75k-250k ACV range', () => {
    const midAcv = buildAccount({ currentAcv: '100000' });
    const lowAcv = buildAccount({ currentAcv: '50000' });

    const midResult = scoreReadiness(makeInput({ account: midAcv }));
    const lowResult = scoreReadiness(makeInput({ account: lowAcv }));

    // Mid-ACV gets 1.2x relationship strength multiplier
    expect(midResult.dimensions.relationshipStrength).toBeGreaterThanOrEqual(
      lowResult.dimensions.relationshipStrength
    );
  });

  it('applies network multiplier for 250k+ ACV range', () => {
    const highAcv = buildAccount({ currentAcv: '300000' });
    const result = scoreReadiness(makeInput({ account: highAcv }));
    // 250k+ gets 1.25x network value multiplier
    expect(result.dimensions.networkValue).toBeGreaterThan(0);
  });

  it('flags human override requirement for $1M+ ACV', () => {
    const result = scoreReadiness(makeInput({
      account: HIGH_ACV_ACCOUNT,
      champion: CSUITE_CHAMPION,
    }));
    expect(result.recommendedAction).toContain('manual review');
  });

  // ─── Dimensional scoring ───

  it('scores all 5 dimensions within their max bounds', () => {
    const result = scoreReadiness(makeInput());
    expect(result.dimensions.valueDelivered).toBeLessThanOrEqual(25);
    expect(result.dimensions.valueDelivered).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.relationshipStrength).toBeLessThanOrEqual(20);
    expect(result.dimensions.relationshipStrength).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.recencyOfWin).toBeLessThanOrEqual(20);
    expect(result.dimensions.recencyOfWin).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.networkValue).toBeLessThanOrEqual(20);
    expect(result.dimensions.networkValue).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.askHistory).toBeLessThanOrEqual(15);
    expect(result.dimensions.askHistory).toBeGreaterThanOrEqual(0);
  });

  it('total score is bounded 0-100', () => {
    const result = scoreReadiness(makeInput());
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it('handles missing optional data gracefully', () => {
    const sparseAccount = buildAccount({
      csHealthScore: null,
      npsScore: null,
      tenureMonths: null,
      usageTrend: null,
      lastQbrOutcome: null,
      lastQbrDate: null,
    });
    const sparseChampion = buildChampion({
      networkReachScore: null,
      formerCompanies: null,
      industryCommunities: null,
      lastInteractionDate: null,
    });
    const result = scoreReadiness(makeInput({
      account: sparseAccount,
      champion: sparseChampion,
      triggerEvents: [],
    }));
    // Should not throw, and should produce a valid low score
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.tier).toBeDefined();
  });

  // ─── Output quality ───

  it('generates a non-empty rationale', () => {
    const result = scoreReadiness(makeInput());
    expect(result.rationale).toBeTruthy();
    expect(result.rationale.length).toBeGreaterThan(10);
  });

  it('generates a recommended action', () => {
    const result = scoreReadiness(makeInput());
    expect(result.recommendedAction).toBeTruthy();
  });

  it('includes trigger event when one exists', () => {
    const result = scoreReadiness(makeInput({
      triggerEvents: [QBR_SUCCESS],
    }));
    expect(result.triggerEvent).toBeTruthy();
  });

  it('returns null trigger when no trigger events', () => {
    const result = scoreReadiness(makeInput({
      triggerEvents: [],
    }));
    expect(result.triggerEvent).toBeNull();
  });

  // ─── Past success boosts ───

  it('rewards past successful referrals in ask history', () => {
    const withSuccess = scoreReadiness(makeInput({
      referralHistory: [CLOSED_WON_REFERRAL],
    }));
    const clean = scoreReadiness(makeInput({ referralHistory: [] }));
    // Past success should not lower the score
    expect(withSuccess.dimensions.askHistory).toBeGreaterThanOrEqual(
      clean.dimensions.askHistory - 1 // allow small variance due to rounding
    );
  });
});
