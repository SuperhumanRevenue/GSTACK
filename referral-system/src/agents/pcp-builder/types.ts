/** Types for the Perfect Customer Profile (PCP) Builder */

export type PcpTier = 'power_law' | 'high_value' | 'core' | 'long_tail';

export interface RevenueDataPoint {
  accountId: string;
  companyName: string;
  revenue: number;
  industry?: string;
  employeeCount?: number;
  dealCount?: number;
  productLines?: string[];
  referralSourced?: boolean;
}

export interface TierThresholds {
  /** Top N% of accounts (by revenue) classified as power_law. Default: 3 */
  powerLawPct: number;
  /** Next N% classified as high_value. Default: 7 (so top 10% total) */
  highValuePct: number;
  /** Next N% classified as core. Default: 40 (so top 50% total) */
  corePct: number;
  // Remainder = long_tail
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  powerLawPct: 3,
  highValuePct: 7,
  corePct: 40,
};

export interface TieredAccount {
  accountId: string;
  companyName: string;
  revenue: number;
  revenuePctOfTotal: number;
  rank: number;
  tier: PcpTier;
}

export interface PowerLawDistribution {
  totalAccounts: number;
  totalRevenue: number;
  giniCoefficient: number;
  tiers: {
    powerLaw: { count: number; revenuePct: number; accounts: TieredAccount[] };
    highValue: { count: number; revenuePct: number; accounts: TieredAccount[] };
    core: { count: number; revenuePct: number; accounts: TieredAccount[] };
    longTail: { count: number; revenuePct: number; accounts: TieredAccount[] };
  };
}

export interface AccountAttribute {
  attribute: string; // e.g. 'industry', 'employee_count_range'
  value: string; // e.g. 'SaaS', '500-2000'
}

export interface AttributeFrequency {
  attribute: string;
  value: string;
  powerLawFrequency: number; // 0-1
  overallFrequency: number; // 0-1
  liftScore: number; // power_law / overall
  weight: number; // normalized 0-1
  sampleSize: number;
}

export interface IcpWeightResult {
  analysisId?: string;
  totalPowerLawAccounts: number;
  totalAccounts: number;
  attributes: AttributeFrequency[];
  topAttributes: { attribute: string; value: string; lift: number }[];
}

export interface TargetScoreInput {
  industry?: string;
  employeeCount?: number;
  acv?: number;
  techStack?: string[];
  usageTrend?: string;
}

export interface TargetScoreResult {
  totalScore: number; // 0-100
  matchedAttributes: { attribute: string; value: string; weight: number; lift: number }[];
  unmatchedTopAttributes: { attribute: string; value: string; lift: number }[];
  tier: 'excellent' | 'good' | 'moderate' | 'weak';
}
