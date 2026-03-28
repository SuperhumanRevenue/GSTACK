import type { CompanyProfile, CompanyStage, RewardCategory } from './types.js';

/**
 * Company stage → reward category mapping.
 * Pure function: matches company profile to appropriate reward strategy.
 *
 * startup → reciprocal (mutual growth, intros back)
 * growth → recognition + economic (public recognition + modest economics)
 * enterprise → access + status (exclusive access, advisory boards)
 * regulated → recognition + donation (no economic incentives)
 */

export interface CompanyMatchResult {
  primaryCategory: RewardCategory;
  secondaryCategory: RewardCategory;
  rationale: string;
  complianceWarnings: string[];
}

const STAGE_MAP: Record<CompanyStage, { primary: RewardCategory; secondary: RewardCategory; rationale: string }> = {
  startup: {
    primary: 'reciprocal',
    secondary: 'recognition',
    rationale: 'Startups benefit most from mutual introductions and shared growth — economic rewards feel transactional at this stage.',
  },
  growth: {
    primary: 'recognition',
    secondary: 'economic',
    rationale: 'Growth companies can offer public recognition (case studies, events) paired with modest economic rewards to show appreciation.',
  },
  enterprise: {
    primary: 'access',
    secondary: 'recognition',
    rationale: 'Enterprise referrers value exclusive access (advisory boards, early features, executive events) over monetary rewards.',
  },
};

export function matchCompany(company: CompanyProfile): CompanyMatchResult {
  const complianceWarnings: string[] = [];

  // Regulated industry override
  if (company.isRegulated) {
    complianceWarnings.push(
      'Regulated industry detected — avoid monetary incentives. Use recognition and charitable donations instead.',
      'Verify compliance with industry-specific referral regulations before launching.',
    );
    return {
      primaryCategory: 'recognition',
      secondaryCategory: 'co_marketing',
      rationale: 'Regulated industries require non-monetary incentives to avoid compliance issues. Recognition and co-marketing are safest.',
      complianceWarnings,
    };
  }

  const mapping = STAGE_MAP[company.stage];

  // High ACV warning
  if (company.avgAcv >= 1_000_000) {
    complianceWarnings.push(
      'Deals over $1M require human review of incentive packages — automated recommendations may not capture relationship nuances.',
    );
  }

  return {
    primaryCategory: mapping.primary,
    secondaryCategory: mapping.secondary,
    rationale: mapping.rationale,
    complianceWarnings,
  };
}
