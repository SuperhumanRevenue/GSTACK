export type CompanyStage = 'startup' | 'growth' | 'enterprise';
export type ReferrerMotivation = 'altruistic' | 'reciprocal' | 'economic' | 'status';
export type RewardCategory = 'recognition' | 'reciprocal' | 'economic' | 'access' | 'co_marketing';

export interface CompanyProfile {
  name: string;
  stage: CompanyStage;
  arr: number;
  industry: string;
  avgAcv: number;
  acvRange: { low: number; high: number };
  currentOutboundCac: number;
  customerCount: number;
  isRegulated: boolean;
}

export interface ReferrerProfile {
  seniority: 'c_suite' | 'vp' | 'director' | 'manager';
  motivation: ReferrerMotivation;
  superReferrerTier?: 'platinum' | 'gold' | 'silver' | 'bronze';
}

export interface RewardSpec {
  category: RewardCategory;
  description: string;
  cost: number;
  timing: string;
}

export interface IncentivePackage {
  primaryReward: RewardSpec;
  secondaryReward: RewardSpec;
  ongoingBenefits: string[];
  totalCostPerReferral: number;
  rewardCeiling: number;
  cacSavingsPct: number;
  escalationPath: EscalationStep[];
  languageGuidance: LanguageGuidance;
  edgeCaseNotes: string[];
}

export interface EscalationStep {
  referralNumber: number;
  rewardChange: string;
  multiplier: number;
}

export interface LanguageGuidance {
  toUse: string[];
  toAvoid: string[];
}

export interface ProgramDesign {
  company: CompanyProfile;
  defaultPackage: IncentivePackage;
  tierPackages: Record<string, IncentivePackage>;
  annualBudget: number;
  roiProjection: ROIProjection;
}

export interface ROIProjection {
  expectedReferrals: number;
  expectedCloseRate: number;
  expectedRevenue: number;
  programCost: number;
  roiMultiple: number;
}

export interface IndustryNorms {
  industry: string;
  avgRewardValue: number;
  commonRewardTypes: string[];
  complianceNotes: string[];
  benchmarks: { metric: string; value: string }[];
}
