import type {
  CompanyProfile,
  ReferrerProfile,
  IncentivePackage,
  RewardSpec,
  LanguageGuidance,
} from './types.js';
import { calculateRewardCeiling, sizeReward, calculateCacSavings } from './economics-engine.js';
import { matchCompany } from './company-matcher.js';
import { matchReferrer } from './referrer-matcher.js';
import { buildEscalationPath } from './escalation-engine.js';

/**
 * Assemble a complete incentive package from company + referrer profiles.
 * Pure function that orchestrates the other engines.
 */

export function buildPackage(
  company: CompanyProfile,
  referrer: ReferrerProfile
): IncentivePackage {
  const rewardCeiling = calculateRewardCeiling(company.currentOutboundCac);
  const baseRewardSize = sizeReward(company.avgAcv, rewardCeiling);

  const companyMatch = matchCompany(company);
  const referrerMatch = matchReferrer(referrer);

  // Primary reward from referrer match, secondary from company match
  const primaryReward = buildReward(
    referrerMatch.recommendedCategory,
    baseRewardSize,
    referrerMatch.examples,
    'On successful introduction'
  );

  const secondaryReward = buildReward(
    companyMatch.secondaryCategory,
    Math.round(baseRewardSize * 0.4),
    [],
    'On closed deal'
  );

  const ongoingBenefits = buildOngoingBenefits(company, referrer);
  const totalCostPerReferral = primaryReward.cost + secondaryReward.cost;
  const cacSavingsPct = calculateCacSavings(company.currentOutboundCac, totalCostPerReferral);

  const escalationPath = buildEscalationPath(baseRewardSize, rewardCeiling);
  const languageGuidance = buildLanguageGuidance(company);
  const edgeCaseNotes = buildEdgeCaseNotes(company, companyMatch.complianceWarnings);

  return {
    primaryReward,
    secondaryReward,
    ongoingBenefits,
    totalCostPerReferral,
    rewardCeiling,
    cacSavingsPct,
    escalationPath,
    languageGuidance,
    edgeCaseNotes,
  };
}

// ─── Helpers ───

function buildReward(
  category: string,
  cost: number,
  examples: string[],
  timing: string
): RewardSpec {
  const descriptions: Record<string, string> = {
    recognition: 'Public recognition and thought leadership opportunity',
    reciprocal: 'Mutual introduction or co-marketing opportunity',
    economic: 'Appreciation gift or professional development stipend',
    access: 'Exclusive access to advisory board or beta features',
    co_marketing: 'Joint content collaboration',
  };

  return {
    category: category as RewardSpec['category'],
    description: examples[0] ?? descriptions[category] ?? 'Custom reward',
    cost,
    timing,
  };
}

function buildOngoingBenefits(company: CompanyProfile, referrer: ReferrerProfile): string[] {
  const benefits: string[] = [
    'Priority support queue',
    'Quarterly business review with executive team',
  ];

  if (referrer.superReferrerTier === 'platinum' || referrer.superReferrerTier === 'gold') {
    benefits.push('Named seat on customer advisory board');
    benefits.push('Early access to product roadmap');
  }

  if (company.stage === 'enterprise') {
    benefits.push('Dedicated customer success manager');
  }

  return benefits;
}

function buildLanguageGuidance(company: CompanyProfile): LanguageGuidance {
  const toUse = [
    'appreciation',
    'thank you',
    'recognition',
    'partnership',
    'mutual benefit',
    'valued relationship',
  ];

  const toAvoid = [
    'commission',
    'payment',
    'payout',
    'bounty',
    'fee',
    'compensation',
    'kickback',
    'referral bonus',
  ];

  if (company.isRegulated) {
    toAvoid.push('incentive', 'reward money', 'cash');
    toUse.push('donation in your name', 'charitable contribution', 'recognition program');
  }

  return { toUse, toAvoid };
}

function buildEdgeCaseNotes(company: CompanyProfile, complianceWarnings: string[]): string[] {
  const notes = [...complianceWarnings];

  if (company.avgAcv >= 1_000_000) {
    notes.push('For $1M+ deals, have leadership personally deliver the thank-you and reward.');
  }

  if (company.stage === 'startup') {
    notes.push('If cash is tight, lead with reciprocal intros — they cost nothing and build real relationships.');
  }

  if (company.customerCount < 20) {
    notes.push('With a small customer base, personalize every interaction. Generic templates will feel hollow.');
  }

  return notes;
}
