import type { CompanyProfile, ROIProjection } from './types.js';

/**
 * Economics engine — calculates reward ceilings, budgets, and ROI.
 * Pure functions, no side effects.
 *
 * Key constraint: reward ceiling = 30% of outbound CAC.
 */

/** Calculate the maximum reward per referral (30% of outbound CAC) */
export function calculateRewardCeiling(outboundCac: number): number {
  return Math.round(outboundCac * 0.30);
}

/** Calculate annual program budget based on expected referral volume */
export function calculateAnnualBudget(
  rewardCeiling: number,
  expectedReferralsPerYear: number,
  overheadMultiplier: number = 1.2
): number {
  return Math.round(rewardCeiling * expectedReferralsPerYear * overheadMultiplier);
}

/** Size a reward based on deal ACV — higher ACV = higher reward, but never above ceiling */
export function sizeReward(avgAcv: number, rewardCeiling: number): number {
  // Base: 1% of ACV, capped at ceiling
  const base = Math.round(avgAcv * 0.01);
  return Math.min(base, rewardCeiling);
}

/** Calculate CAC savings percentage: (outbound - referral) / outbound */
export function calculateCacSavings(outboundCac: number, referralCostPerDeal: number): number {
  if (outboundCac <= 0) return 0;
  return (outboundCac - referralCostPerDeal) / outboundCac;
}

/** Project ROI for a referral program */
export function projectROI(input: {
  company: CompanyProfile;
  expectedReferralsPerYear: number;
  expectedCloseRate: number;
  programCost: number;
}): ROIProjection {
  const { company, expectedReferralsPerYear, expectedCloseRate, programCost } = input;
  const expectedClosedDeals = Math.round(expectedReferralsPerYear * expectedCloseRate);
  const expectedRevenue = expectedClosedDeals * company.avgAcv;
  const roiMultiple = programCost > 0 ? expectedRevenue / programCost : 0;

  return {
    expectedReferrals: expectedReferralsPerYear,
    expectedCloseRate,
    expectedRevenue,
    programCost,
    roiMultiple,
  };
}

/** Estimate expected referrals per year based on customer count */
export function estimateReferralVolume(customerCount: number): number {
  // Conservative: 5-10% of customers will refer per year
  return Math.max(1, Math.round(customerCount * 0.07));
}
