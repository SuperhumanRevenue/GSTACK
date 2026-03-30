/** Types for Active Success Tracking */

export type DealHealthTier = 'healthy' | 'at_risk' | 'stalled' | 'critical';
export type CohortSource = 'referral' | 'outbound' | 'inbound' | 'partner';

export interface PipelineSnapshot {
  referralId: string;
  accountName: string;
  targetCompany: string;
  status: string;
  daysSinceLastActivity: number;
  dealHealth: DealHealthTier;
  healthScore: number; // 0-100
  healthFactors: string[];
  recommendedAction: string;
}

export interface StalledDealAlert {
  referralId: string;
  accountName: string;
  targetCompany: string;
  status: string;
  daysSinceLastActivity: number;
  stalledReason: string;
  urgency: 'high' | 'medium' | 'low';
  suggestedAction: string;
}

export interface CohortMetrics {
  source: CohortSource;
  dealCount: number;
  totalPipeline: number;
  avgDealSize: number;
  avgTimeToClose: number;
  winRate: number; // 0-1
  closedWon: number;
  closedLost: number;
  openDeals: number;
  avgDaysSinceCreated: number;
}

export interface CohortComparison {
  period: string;
  cohorts: CohortMetrics[];
  referralAdvantage: {
    winRateLift: number; // referral win rate / outbound win rate
    speedAdvantage: number; // days faster for referral
    dealSizeLift: number; // referral avg deal / outbound avg deal
    cacReduction: number; // % lower CAC for referral
  };
}

export interface DealHealthInput {
  status: string;
  createdAt: Date;
  lastActivityDate: Date | null;
  askDate: Date | null;
  introDate: Date | null;
  meetingDate: Date | null;
  followUpCount: number;
  response: string;
  opportunityAmount: number | null;
}

export interface DealHealthResult {
  score: number; // 0-100
  tier: DealHealthTier;
  factors: string[];
  recommendedAction: string;
}

/** Stall thresholds in days by pipeline stage */
export const STALL_THRESHOLDS: Record<string, number> = {
  ask_pending: 7,
  ask_sent: 14,
  intro_pending: 10,
  intro_sent: 21,
  meeting_booked: 14,
  opportunity_created: 30,
};

/** Outbound CAC assumption for comparison (configurable) */
export const DEFAULT_OUTBOUND_CAC = 15000;
export const DEFAULT_REFERRAL_CAC = 3000;
