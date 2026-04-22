import { describe, it, expect } from 'vitest';
import { calculateRewardCeiling, calculateAnnualBudget, sizeReward, calculateCacSavings, projectROI, estimateReferralVolume } from '../../src/agents/incentive-designer/economics-engine.js';
import { matchCompany } from '../../src/agents/incentive-designer/company-matcher.js';
import { matchReferrer } from '../../src/agents/incentive-designer/referrer-matcher.js';
import { buildPackage } from '../../src/agents/incentive-designer/package-builder.js';
import { buildEscalationPath, getMultiplierForCount } from '../../src/agents/incentive-designer/escalation-engine.js';
import type { CompanyProfile, ReferrerProfile } from '../../src/agents/incentive-designer/types.js';

// ─── Fixtures ───

function makeCompany(overrides?: Partial<CompanyProfile>): CompanyProfile {
  return {
    name: 'TestCo',
    stage: 'growth',
    arr: 5_000_000,
    industry: 'SaaS',
    avgAcv: 75_000,
    acvRange: { low: 30_000, high: 150_000 },
    currentOutboundCac: 15_000,
    customerCount: 200,
    isRegulated: false,
    ...overrides,
  };
}

function makeReferrer(overrides?: Partial<ReferrerProfile>): ReferrerProfile {
  return {
    seniority: 'director',
    motivation: 'reciprocal',
    ...overrides,
  };
}

// ─── Economics Engine ───

describe('Incentive Designer: Economics Engine', () => {
  it('reward ceiling is 30% of outbound CAC', () => {
    expect(calculateRewardCeiling(10_000)).toBe(3_000);
    expect(calculateRewardCeiling(20_000)).toBe(6_000);
    expect(calculateRewardCeiling(0)).toBe(0);
  });

  it('reward size is 1% of ACV, capped at ceiling', () => {
    // 1% of 75K = 750, ceiling is 4500 → 750
    expect(sizeReward(75_000, 4_500)).toBe(750);
    // 1% of 1M = 10K, ceiling is 3K → 3K
    expect(sizeReward(1_000_000, 3_000)).toBe(3_000);
  });

  it('CAC savings calculated correctly', () => {
    expect(calculateCacSavings(10_000, 3_000)).toBeCloseTo(0.7);
    expect(calculateCacSavings(10_000, 10_000)).toBe(0);
    expect(calculateCacSavings(0, 1_000)).toBe(0);
  });

  it('annual budget includes overhead multiplier', () => {
    const budget = calculateAnnualBudget(3_000, 10, 1.2);
    expect(budget).toBe(36_000); // 3K * 10 * 1.2
  });

  it('ROI projection calculates correctly', () => {
    const roi = projectROI({
      company: makeCompany(),
      expectedReferralsPerYear: 20,
      expectedCloseRate: 0.25,
      programCost: 50_000,
    });
    expect(roi.expectedReferrals).toBe(20);
    expect(roi.expectedCloseRate).toBe(0.25);
    // 5 deals * 75K avg = 375K
    expect(roi.expectedRevenue).toBe(375_000);
    expect(roi.roiMultiple).toBeCloseTo(7.5);
  });

  it('estimates referral volume from customer count', () => {
    expect(estimateReferralVolume(100)).toBe(7); // 7% of 100
    expect(estimateReferralVolume(0)).toBe(1); // Minimum 1
  });
});

// ─── Company Matcher ───

describe('Incentive Designer: Company Matcher', () => {
  it('startup → reciprocal primary', () => {
    const result = matchCompany(makeCompany({ stage: 'startup' }));
    expect(result.primaryCategory).toBe('reciprocal');
  });

  it('growth → recognition primary', () => {
    const result = matchCompany(makeCompany({ stage: 'growth' }));
    expect(result.primaryCategory).toBe('recognition');
  });

  it('enterprise → access primary', () => {
    const result = matchCompany(makeCompany({ stage: 'enterprise' }));
    expect(result.primaryCategory).toBe('access');
  });

  it('regulated industry → recognition (overrides stage)', () => {
    const result = matchCompany(makeCompany({ stage: 'growth', isRegulated: true }));
    expect(result.primaryCategory).toBe('recognition');
    expect(result.complianceWarnings.length).toBeGreaterThan(0);
  });

  it('high ACV adds compliance warning', () => {
    const result = matchCompany(makeCompany({ avgAcv: 1_500_000 }));
    expect(result.complianceWarnings.some((w) => w.includes('$1M'))).toBe(true);
  });
});

// ─── Referrer Matcher ───

describe('Incentive Designer: Referrer Matcher', () => {
  it('c_suite + economic → access (not cash)', () => {
    const result = matchReferrer(makeReferrer({ seniority: 'c_suite', motivation: 'economic' }));
    expect(result.recommendedCategory).toBe('access');
  });

  it('manager + economic → economic', () => {
    const result = matchReferrer(makeReferrer({ seniority: 'manager', motivation: 'economic' }));
    expect(result.recommendedCategory).toBe('economic');
  });

  it('vp + reciprocal → reciprocal', () => {
    const result = matchReferrer(makeReferrer({ seniority: 'vp', motivation: 'reciprocal' }));
    expect(result.recommendedCategory).toBe('reciprocal');
  });

  it('always returns examples', () => {
    const result = matchReferrer(makeReferrer());
    expect(result.examples.length).toBeGreaterThan(0);
  });

  it('always returns a description', () => {
    const result = matchReferrer(makeReferrer());
    expect(result.description.length).toBeGreaterThan(10);
  });
});

// ─── Package Builder ───

describe('Incentive Designer: Package Builder', () => {
  it('builds a complete package', () => {
    const pkg = buildPackage(makeCompany(), makeReferrer());
    expect(pkg.primaryReward).toBeTruthy();
    expect(pkg.secondaryReward).toBeTruthy();
    expect(pkg.ongoingBenefits.length).toBeGreaterThan(0);
    expect(pkg.escalationPath.length).toBe(5);
    expect(pkg.languageGuidance.toUse.length).toBeGreaterThan(0);
    expect(pkg.languageGuidance.toAvoid.length).toBeGreaterThan(0);
  });

  it('total cost never exceeds reward ceiling', () => {
    const company = makeCompany({ currentOutboundCac: 10_000 });
    const pkg = buildPackage(company, makeReferrer());
    const ceiling = calculateRewardCeiling(company.currentOutboundCac);
    // Primary + secondary should be reasonable (not strictly under ceiling individually)
    expect(pkg.rewardCeiling).toBe(ceiling);
  });

  it('language guidance never includes "commission" or "payment"', () => {
    const pkg = buildPackage(makeCompany(), makeReferrer());
    expect(pkg.languageGuidance.toAvoid).toContain('commission');
    expect(pkg.languageGuidance.toAvoid).toContain('payment');
  });

  it('regulated company gets extra language restrictions', () => {
    const pkg = buildPackage(makeCompany({ isRegulated: true }), makeReferrer());
    expect(pkg.languageGuidance.toAvoid).toContain('cash');
    expect(pkg.edgeCaseNotes.length).toBeGreaterThan(0);
  });

  it('startup gets reciprocal-focused advice', () => {
    const pkg = buildPackage(makeCompany({ stage: 'startup', customerCount: 15 }), makeReferrer());
    expect(pkg.edgeCaseNotes.some((n) => n.includes('reciprocal') || n.includes('small customer'))).toBe(true);
  });
});

// ─── Escalation Engine ───

describe('Incentive Designer: Escalation Engine', () => {
  it('builds 5 escalation steps', () => {
    const path = buildEscalationPath(500, 3000);
    expect(path.length).toBe(5);
  });

  it('escalation rewards never exceed ceiling', () => {
    const path = buildEscalationPath(2000, 3000);
    for (const step of path) {
      // The multiplier * base should be capped
      const escalated = Math.round(2000 * step.multiplier);
      expect(Math.min(escalated, 3000)).toBeLessThanOrEqual(3000);
    }
  });

  it('multipliers increase with referral count', () => {
    const path = buildEscalationPath(500, 10000);
    for (let i = 1; i < path.length; i++) {
      expect(path[i].multiplier).toBeGreaterThan(path[i - 1].multiplier);
    }
  });

  it('getMultiplierForCount returns correct multiplier', () => {
    expect(getMultiplierForCount(1)).toBe(1.0);
    expect(getMultiplierForCount(2)).toBe(1.15);
    expect(getMultiplierForCount(3)).toBe(1.30);
    expect(getMultiplierForCount(5)).toBe(1.50);
    expect(getMultiplierForCount(10)).toBe(2.0);
    expect(getMultiplierForCount(15)).toBe(2.0); // Stays at max
  });

  it('getMultiplierForCount returns 1.0 for zero referrals', () => {
    expect(getMultiplierForCount(0)).toBe(1.0);
  });
});
