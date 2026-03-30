/**
 * Cross-Agent Wiring — Connects agent outputs to feed into other agents' inputs.
 *
 * Bridges:
 * 1. PCP ICP weights → Readiness Scorer (boost score for accounts matching power-law ICP)
 * 2. Signal Guide relevance → Ask Architect (timing signals inform when to ask)
 * 3. Portfolio Mapper opportunities → Relationship Mapper (surface second-order connections)
 * 4. Success Tracker health → Program Manager (stalled deals affect champion scoring)
 */

import type { ScoringResult, ScoringDimensions } from '../shared/types.js';
import type { AttributeFrequency, TargetScoreResult } from '../agents/pcp-builder/types.js';
import type { DealHealthResult } from '../agents/success-tracker/types.js';
import { scoreTarget } from '../agents/pcp-builder/icp-weight-builder.js';
import type { Account } from '../db/schema.js';
import { bucketEmployeeCount, bucketAcv } from '../agents/pcp-builder/attribute-extractor.js';

/**
 * Boost readiness score based on how well the target account matches the PCP ICP weights.
 * Accounts that match the power-law profile get a score multiplier.
 *
 * @returns Adjusted scoring result with PCP boost applied
 */
export function applyPcpBoost(
  baseResult: ScoringResult,
  account: Account,
  icpWeights: AttributeFrequency[]
): ScoringResult {
  if (icpWeights.length === 0) return baseResult;

  const targetScore = scoreTarget(
    {
      industry: account.industry ?? undefined,
      employeeCount: account.employeeCount ?? undefined,
      acv: account.currentAcv ? parseFloat(account.currentAcv) : undefined,
      usageTrend: account.usageTrend ?? undefined,
    },
    icpWeights
  );

  // Apply boost: excellent ICP match = up to +10 pts, good = +5, moderate = +2
  let boost = 0;
  if (targetScore.tier === 'excellent') boost = 10;
  else if (targetScore.tier === 'good') boost = 5;
  else if (targetScore.tier === 'moderate') boost = 2;

  if (boost === 0) return baseResult;

  const boostedScore = Math.min(100, baseResult.totalScore + boost);
  const boostedTier = boostedScore >= 80 ? 'hot' as const :
    boostedScore >= 55 ? 'warm' as const : 'not_yet' as const;

  return {
    ...baseResult,
    totalScore: boostedScore,
    tier: boostedTier,
    rationale: baseResult.rationale + ` [PCP boost: +${boost} pts, ICP match: ${targetScore.tier}]`,
  };
}

/**
 * Determine if a referral ask should be delayed based on active signal guide data.
 * If the customer's signal guide shows high-relevance signals firing now,
 * it may be better to wait for the signal to mature before asking.
 *
 * @returns Object with shouldDelay flag and reason
 */
export function evaluateSignalTiming(
  activeSignals: { signalName: string; relevanceScore: number; tag: string; funnelStage: string }[],
  currentStatus: string
): { shouldDelay: boolean; reason: string; recommendedWait?: number } {
  // If there are bottom-conversion signals with high relevance, timing is good
  const hotSignals = activeSignals.filter(
    (s) => s.funnelStage === 'bottom_conversion' && s.relevanceScore >= 70
  );

  if (hotSignals.length >= 2) {
    return {
      shouldDelay: false,
      reason: `${hotSignals.length} high-relevance conversion signals active — optimal timing for ask`,
    };
  }

  // If signals are mostly top-of-funnel, delay
  const topFunnel = activeSignals.filter((s) => s.funnelStage === 'top_awareness');
  const midFunnel = activeSignals.filter((s) => s.funnelStage === 'mid_consideration');

  if (topFunnel.length > midFunnel.length + hotSignals.length) {
    return {
      shouldDelay: true,
      reason: 'Most active signals are top-of-funnel awareness. Wait for consideration signals to develop.',
      recommendedWait: 14,
    };
  }

  // If there are competitor signals firing, act now
  const competitorSignals = activeSignals.filter((s) => s.tag === 'competitor' && s.relevanceScore >= 60);
  if (competitorSignals.length > 0) {
    return {
      shouldDelay: false,
      reason: `${competitorSignals.length} competitor signals active — time-sensitive window, act now`,
    };
  }

  return {
    shouldDelay: false,
    reason: 'No timing blockers detected. Standard cadence applies.',
  };
}

/**
 * Adjust super-referrer scoring based on deal health of their active referrals.
 * Champions with many stalled/critical deals get a velocity penalty.
 */
export function adjustChampionScoreByDealHealth(
  baseScore: number,
  dealHealthResults: DealHealthResult[]
): { adjustedScore: number; adjustment: number; reason: string } {
  if (dealHealthResults.length === 0) {
    return { adjustedScore: baseScore, adjustment: 0, reason: 'No active deals' };
  }

  const criticalCount = dealHealthResults.filter((d) => d.tier === 'critical').length;
  const stalledCount = dealHealthResults.filter((d) => d.tier === 'stalled').length;
  const healthyCount = dealHealthResults.filter((d) => d.tier === 'healthy').length;

  // Penalty for stalled/critical deals
  let penalty = criticalCount * 5 + stalledCount * 2;
  // Bonus for healthy deals
  let bonus = Math.min(5, healthyCount * 2);

  const adjustment = bonus - penalty;
  const adjustedScore = Math.max(0, Math.min(100, baseScore + adjustment));

  const parts: string[] = [];
  if (healthyCount > 0) parts.push(`${healthyCount} healthy (+${bonus})`);
  if (stalledCount > 0) parts.push(`${stalledCount} stalled (-${stalledCount * 2})`);
  if (criticalCount > 0) parts.push(`${criticalCount} critical (-${criticalCount * 5})`);

  return {
    adjustedScore,
    adjustment,
    reason: `Deal health: ${parts.join(', ')}`,
  };
}

/**
 * Enrich portfolio mapper opportunities with PCP ICP scores.
 * Helps prioritize which second-order referral targets to pursue first.
 */
export function scorePortfolioOpportunities(
  opportunities: { targetCompany: string; confidence: number }[],
  icpWeights: AttributeFrequency[],
  targetData: Map<string, { industry?: string; employeeCount?: number; acv?: number }>
): { targetCompany: string; confidence: number; icpScore: number; combinedScore: number }[] {
  return opportunities.map((opp) => {
    const target = targetData.get(opp.targetCompany);
    let icpScore = 0;

    if (target && icpWeights.length > 0) {
      const result = scoreTarget(target, icpWeights);
      icpScore = result.totalScore;
    }

    // Combined score: 60% confidence, 40% ICP match
    const combinedScore = Math.round(opp.confidence * 60 + (icpScore / 100) * 40);

    return {
      targetCompany: opp.targetCompany,
      confidence: opp.confidence,
      icpScore,
      combinedScore,
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore);
}
