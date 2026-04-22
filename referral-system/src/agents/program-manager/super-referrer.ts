import type { Referral, Champion } from '../../db/schema.js';

/**
 * Super-referrer scoring — 5 dimensions, 100-point scale.
 * Pure function: no DB or side effects.
 */

export interface SuperReferrerInput {
  champion: Champion;
  referrals: Referral[];
}

export interface SuperReferrerScoring {
  superScore: number;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  volumeScore: number;       // 0-20
  qualityScore: number;      // 0-25
  valueScore: number;        // 0-20
  networkScore: number;      // 0-20
  velocityScore: number;     // 0-15
  stats: SuperReferrerStats;
}

export interface SuperReferrerStats {
  totalReferrals: number;
  totalIntros: number;
  totalMeetings: number;
  totalClosed: number;
  totalRevenue: number;
  avgDealSize: number;
  avgTimeToClose: number;
  responseRate: number;
}

export const SUPER_REFERRER_WEIGHTS = {
  volume: 20,
  quality: 25,
  value: 20,
  network: 20,
  velocity: 15,
} as const;

export const TIER_THRESHOLDS = {
  platinum: 80,
  gold: 60,
  silver: 40,
} as const;

export function scoreSuperReferrer(input: SuperReferrerInput): SuperReferrerScoring {
  const stats = calculateStats(input.referrals);

  const volumeScore = scoreVolume(stats.totalReferrals);
  const qualityScore = scoreQuality(stats);
  const valueScore = scoreValue(stats);
  const networkScore = scoreNetwork(input.champion, stats);
  const velocityScore = scoreVelocity(stats);

  const superScore = volumeScore + qualityScore + valueScore + networkScore + velocityScore;
  const tier = assignTier(superScore);

  return {
    superScore,
    tier,
    volumeScore,
    qualityScore,
    valueScore,
    networkScore,
    velocityScore,
    stats,
  };
}

export function assignTier(score: number): 'platinum' | 'gold' | 'silver' | 'bronze' {
  if (score >= TIER_THRESHOLDS.platinum) return 'platinum';
  if (score >= TIER_THRESHOLDS.gold) return 'gold';
  if (score >= TIER_THRESHOLDS.silver) return 'silver';
  return 'bronze';
}

// ─── Dimension Scorers ───

/**
 * Volume: how many referrals has the champion generated?
 * 0-20 scale: 0 referrals = 0, 1 = 5, 2-3 = 10, 4-6 = 15, 7+ = 20
 */
function scoreVolume(totalReferrals: number): number {
  if (totalReferrals >= 7) return 20;
  if (totalReferrals >= 4) return 15;
  if (totalReferrals >= 2) return 10;
  if (totalReferrals >= 1) return 5;
  return 0;
}

/**
 * Quality: intro rate + meeting rate from intros.
 * 0-25 scale based on conversion rates.
 */
function scoreQuality(stats: SuperReferrerStats): number {
  if (stats.totalReferrals === 0) return 0;

  // Intro conversion: what % of referrals become intros?
  const introRate = stats.totalIntros / stats.totalReferrals;
  // Meeting conversion: what % of intros become meetings?
  const meetingRate = stats.totalIntros > 0
    ? stats.totalMeetings / stats.totalIntros
    : 0;

  // Weighted: intro rate (15pts) + meeting rate (10pts)
  const introScore = Math.min(15, Math.round(introRate * 15));
  const meetingScore = Math.min(10, Math.round(meetingRate * 10));

  return introScore + meetingScore;
}

/**
 * Value: revenue generated through referrals.
 * 0-20 scale: $0 = 0, <$50K = 5, <$200K = 10, <$500K = 15, $500K+ = 20
 */
function scoreValue(stats: SuperReferrerStats): number {
  if (stats.totalRevenue >= 500_000) return 20;
  if (stats.totalRevenue >= 200_000) return 15;
  if (stats.totalRevenue >= 50_000) return 10;
  if (stats.totalRevenue > 0) return 5;
  return 0;
}

/**
 * Network: champion's reach + diversity of targets.
 * 0-20 scale based on network reach score + unique companies referred to.
 */
function scoreNetwork(champion: Champion, stats: SuperReferrerStats): number {
  const reachScore = champion.networkReachScore ?? 0;
  // Network reach: 0-100 → 0-10 pts
  const reachPts = Math.min(10, Math.round(reachScore / 10));

  // Unique companies: 1 = 2, 2-3 = 5, 4+ = 10
  const uniqueCompanies = stats.totalReferrals; // Proxy: 1 referral ≈ 1 company
  let diversityPts = 0;
  if (uniqueCompanies >= 4) diversityPts = 10;
  else if (uniqueCompanies >= 2) diversityPts = 5;
  else if (uniqueCompanies >= 1) diversityPts = 2;

  return Math.min(20, reachPts + diversityPts);
}

/**
 * Velocity: how fast do their referrals close?
 * 0-15 scale: no closes = 0, >90 days = 5, 30-90 = 10, <30 = 15
 */
function scoreVelocity(stats: SuperReferrerStats): number {
  if (stats.totalClosed === 0) return 0;
  if (stats.avgTimeToClose <= 30) return 15;
  if (stats.avgTimeToClose <= 90) return 10;
  return 5;
}

// ─── Stats Helper ───

function calculateStats(referrals: Referral[]): SuperReferrerStats {
  const totalReferrals = referrals.length;

  const intros = referrals.filter((r) =>
    r.introDate != null || ['intro_sent', 'meeting_booked', 'opportunity_created', 'closed_won', 'closed_lost'].includes(r.status ?? '')
  );
  const totalIntros = intros.length;

  const meetings = referrals.filter((r) =>
    r.meetingDate != null || ['meeting_booked', 'opportunity_created', 'closed_won', 'closed_lost'].includes(r.status ?? '')
  );
  const totalMeetings = meetings.length;

  const closedWon = referrals.filter((r) => r.status === 'closed_won');
  const totalClosed = closedWon.length;

  const totalRevenue = closedWon.reduce(
    (sum, r) => sum + (r.closedAmount ? parseFloat(r.closedAmount) : 0),
    0
  );

  const avgDealSize = totalClosed > 0 ? totalRevenue / totalClosed : 0;

  const closedWithTime = closedWon.filter((r) => r.timeToCloseDays != null);
  const avgTimeToClose = closedWithTime.length > 0
    ? closedWithTime.reduce((sum, r) => sum + (r.timeToCloseDays ?? 0), 0) / closedWithTime.length
    : 0;

  const responded = referrals.filter((r) => r.response && r.response !== 'pending' && r.response !== 'no_response');
  const responseRate = totalReferrals > 0 ? responded.length / totalReferrals : 0;

  return {
    totalReferrals,
    totalIntros,
    totalMeetings,
    totalClosed,
    totalRevenue,
    avgDealSize,
    avgTimeToClose,
    responseRate,
  };
}
