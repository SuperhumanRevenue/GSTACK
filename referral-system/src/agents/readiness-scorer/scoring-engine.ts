import { differenceInDays } from 'date-fns';
import type {
  ScoringInput,
  ScoringResult,
  ScoringDimensions,
  ReadinessTier,
  AcvRange,
} from './types.js';
import { DEFAULT_WEIGHTS, ACV_ADJUSTMENTS, ANTI_TRIGGER_PENALTIES } from './types.js';
import type { Account, Champion, TriggerEvent, Referral } from '../../db/schema.js';

/**
 * Pure function: Score an account+champion pair for referral readiness.
 * Returns a 0-100 score across 5 weighted dimensions, with tier classification.
 */
export function scoreReadiness(
  input: ScoringInput,
  hotThreshold: number = 80,
  warmThreshold: number = 55
): ScoringResult {
  const { account, champion, triggerEvents, referralHistory } = input;

  // 1. Calculate raw dimensional scores
  const dimensions = calculateDimensions(input);

  // 2. Apply ACV-tier adjustments
  const acvRange = getAcvRange(account.currentAcv);
  const adjustments = ACV_ADJUSTMENTS[acvRange];
  const adjustedDimensions = applyAcvAdjustments(dimensions, adjustments);

  // 3. Calculate raw total
  let totalScore = Math.round(
    adjustedDimensions.valueDelivered +
    adjustedDimensions.relationshipStrength +
    adjustedDimensions.recencyOfWin +
    adjustedDimensions.networkValue +
    adjustedDimensions.askHistory
  );

  // 4. Detect anti-triggers
  const antiTriggers = detectAntiTriggers(account, champion, triggerEvents, referralHistory);
  let forceNotYet = false;
  let totalPenalty = 0;

  for (const trigger of antiTriggers) {
    const penalty = ANTI_TRIGGER_PENALTIES[trigger];
    if (penalty === 'force_not_yet') {
      forceNotYet = true;
    } else if (typeof penalty === 'number') {
      totalPenalty += penalty;
    }
  }

  totalScore = Math.max(0, Math.min(100, totalScore + totalPenalty));

  // 5. Assign tier
  let tier: ReadinessTier;
  if (forceNotYet) {
    tier = 'not_yet';
  } else if (totalScore >= hotThreshold) {
    tier = 'hot';
  } else if (totalScore >= warmThreshold) {
    tier = 'warm';
  } else {
    tier = 'not_yet';
  }

  // 6. Find most recent trigger event
  const positiveTriggers = triggerEvents
    .filter((t) => !t.isAntiTrigger)
    .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
  const latestTrigger = positiveTriggers[0] ?? null;

  // 7. Generate rationale
  const rationale = generateRationale(adjustedDimensions, antiTriggers, latestTrigger, acvRange);
  const recommendedAction = generateRecommendation(tier, antiTriggers, adjustments, latestTrigger);

  return {
    totalScore,
    tier,
    dimensions: adjustedDimensions,
    triggerEvent: latestTrigger?.eventDescription ?? null,
    antiTriggers,
    rationale,
    recommendedAction,
  };
}

function calculateDimensions(input: ScoringInput): ScoringDimensions {
  return {
    valueDelivered: scoreValueDelivered(input),
    relationshipStrength: scoreRelationshipStrength(input),
    recencyOfWin: scoreRecencyOfWin(input),
    networkValue: scoreNetworkValue(input),
    askHistory: scoreAskHistory(input),
  };
}

// ─── Dimension Scorers (each a pure function) ───

function scoreValueDelivered(input: ScoringInput): number {
  const { account } = input;
  let score = 0;
  const max = DEFAULT_WEIGHTS.valueDelivered.max;

  // CS Health Score contribution (0-8 points)
  const healthScore = account.csHealthScore ?? 0;
  score += Math.round((healthScore / 100) * 8);

  // NPS contribution (0-7 points)
  const nps = account.npsScore ?? 0;
  if (nps >= 9) score += 7;
  else if (nps >= 7) score += 5;
  else if (nps >= 5) score += 2;

  // Tenure contribution (0-5 points)
  const tenure = account.tenureMonths ?? 0;
  if (tenure >= 24) score += 5;
  else if (tenure >= 12) score += 3;
  else if (tenure >= 6) score += 1;

  // Usage trend (0-5 points)
  if (account.usageTrend === 'growing') score += 5;
  else if (account.usageTrend === 'stable') score += 3;

  return Math.min(score, max);
}

function scoreRelationshipStrength(input: ScoringInput): number {
  const { champion } = input;
  let score = 0;
  const max = DEFAULT_WEIGHTS.relationshipStrength.max;

  // Relationship strength (0-8 points)
  if (champion.relationshipStrength === 'strong') score += 8;
  else if (champion.relationshipStrength === 'warm') score += 5;
  else if (champion.relationshipStrength === 'cold') score += 1;

  // Executive sponsor (0-4 points)
  if (champion.isExecutiveSponsor) score += 4;

  // Seniority (0-4 points)
  if (champion.seniorityLevel === 'c_suite') score += 4;
  else if (champion.seniorityLevel === 'vp') score += 3;
  else if (champion.seniorityLevel === 'director') score += 2;
  else if (champion.seniorityLevel === 'manager') score += 1;

  // Recency of interaction (0-4 points)
  if (champion.lastInteractionDate) {
    const daysSince = differenceInDays(new Date(), champion.lastInteractionDate);
    if (daysSince <= 14) score += 4;
    else if (daysSince <= 30) score += 3;
    else if (daysSince <= 60) score += 2;
    else if (daysSince <= 90) score += 1;
  }

  return Math.min(score, max);
}

function scoreRecencyOfWin(input: ScoringInput): number {
  const { account, triggerEvents } = input;
  let score = 0;
  const max = DEFAULT_WEIGHTS.recencyOfWin.max;

  // QBR outcome (0-8 points)
  if (account.lastQbrOutcome === 'positive') {
    score += 8;
    // Bonus for recent QBR
    if (account.lastQbrDate) {
      const daysSince = differenceInDays(new Date(), account.lastQbrDate);
      if (daysSince <= 30) score += 4;
      else if (daysSince <= 60) score += 2;
    }
  } else if (account.lastQbrOutcome === 'neutral') {
    score += 3;
  }

  // Recent positive trigger events (0-8 points)
  const recentPositive = triggerEvents.filter(
    (t) =>
      !t.isAntiTrigger &&
      differenceInDays(new Date(), t.eventDate) <= 90
  );
  score += Math.min(recentPositive.length * 2, 8);

  return Math.min(score, max);
}

function scoreNetworkValue(input: ScoringInput): number {
  const { champion, enrichmentData } = input;
  let score = 0;
  const max = DEFAULT_WEIGHTS.networkValue.max;

  // Network reach from enrichment (0-8 points)
  const networkReach = enrichmentData?.networkReachScore ?? champion.networkReachScore ?? 0;
  score += Math.round((networkReach / 100) * 8);

  // Former companies (0-4 points)
  const formerCompanies = enrichmentData?.formerCompanies ?? champion.formerCompanies ?? [];
  score += Math.min(formerCompanies.length, 4);

  // Industry communities (0-4 points)
  const communities = enrichmentData?.industryCommunities ?? champion.industryCommunities ?? [];
  score += Math.min(communities.length * 2, 4);

  // Seniority amplifies network value (0-4 points)
  if (champion.seniorityLevel === 'c_suite') score += 4;
  else if (champion.seniorityLevel === 'vp') score += 3;
  else if (champion.seniorityLevel === 'director') score += 2;

  return Math.min(score, max);
}

function scoreAskHistory(input: ScoringInput): number {
  const { referralHistory } = input;
  let score = DEFAULT_WEIGHTS.askHistory.max; // Start at max, deduct for negatives

  if (referralHistory.length === 0) {
    return score; // No history = full points (fresh ask)
  }

  // Deduct for recent failed asks
  const recentAsks = referralHistory.filter(
    (r) => r.askDate && differenceInDays(new Date(), r.askDate) <= 180
  );

  for (const ask of recentAsks) {
    if (ask.response === 'no') score -= 5;
    else if (ask.response === 'no_response') score -= 3;
    else if (ask.response === 'yes' && ask.status === 'closed_won') score += 2; // Past success is good
  }

  return Math.max(0, Math.min(score, DEFAULT_WEIGHTS.askHistory.max));
}

// ─── Helper Functions ───

function getAcvRange(acv: string | null): AcvRange {
  const value = acv ? parseFloat(acv) : 0;
  if (value >= 1000000) return '1m_plus';
  if (value >= 250000) return '250k_plus';
  if (value >= 75000) return '75k_250k';
  return '30k_75k';
}

function applyAcvAdjustments(
  dimensions: ScoringDimensions,
  adjustments: { relationshipStrengthMultiplier: number; networkValueMultiplier: number }
): ScoringDimensions {
  return {
    ...dimensions,
    relationshipStrength: Math.min(
      Math.round(dimensions.relationshipStrength * adjustments.relationshipStrengthMultiplier),
      DEFAULT_WEIGHTS.relationshipStrength.max
    ),
    networkValue: Math.min(
      Math.round(dimensions.networkValue * adjustments.networkValueMultiplier),
      DEFAULT_WEIGHTS.networkValue.max
    ),
  };
}

function detectAntiTriggers(
  account: Account,
  champion: Champion,
  triggerEvents: TriggerEvent[],
  referralHistory: Referral[]
): string[] {
  const antiTriggers: string[] = [];

  // Hard blocks from account state
  if (account.supportEscalationActive) antiTriggers.push('support_escalation_active');
  if (account.churnRiskActive) antiTriggers.push('churn_risk_active');
  if (account.usageTrend === 'declining') antiTriggers.push('usage_declining_20pct');
  if (champion.departedAt) antiTriggers.push('champion_departed');

  // Anti-trigger events
  const recentAntiEvents = triggerEvents.filter(
    (t) => t.isAntiTrigger && differenceInDays(new Date(), t.eventDate) <= 180
  );
  for (const event of recentAntiEvents) {
    if (event.eventType === 'competitor_evaluation') antiTriggers.push('competitor_evaluation');
    if (event.eventType === 'missed_renewal') antiTriggers.push('missed_renewal');
  }

  // Recent ask outcomes
  const recentAsks = referralHistory.filter(
    (r) => r.askDate && differenceInDays(new Date(), r.askDate) <= 180
  );
  for (const ask of recentAsks) {
    if (ask.response === 'no' && !antiTriggers.includes('recent_ask_explicit_no')) {
      antiTriggers.push('recent_ask_explicit_no');
    }
    if (ask.response === 'no_response' && !antiTriggers.includes('recent_ask_no_response')) {
      antiTriggers.push('recent_ask_no_response');
    }
  }

  return antiTriggers;
}

function generateRationale(
  dimensions: ScoringDimensions,
  antiTriggers: string[],
  latestTrigger: { eventDescription: string } | null,
  acvRange: AcvRange
): string {
  const parts: string[] = [];

  const strongDims = [];
  if (dimensions.valueDelivered >= 20) strongDims.push('strong value delivery');
  if (dimensions.relationshipStrength >= 15) strongDims.push('deep relationship');
  if (dimensions.recencyOfWin >= 15) strongDims.push('recent success');
  if (dimensions.networkValue >= 15) strongDims.push('high-value network');
  if (dimensions.askHistory >= 12) strongDims.push('clean ask history');

  if (strongDims.length > 0) {
    parts.push(`Strengths: ${strongDims.join(', ')}.`);
  }

  if (latestTrigger) {
    parts.push(`Recent trigger: ${latestTrigger.eventDescription}.`);
  }

  if (antiTriggers.length > 0) {
    parts.push(`Blockers: ${antiTriggers.join(', ')}.`);
  }

  if (acvRange === '1m_plus') {
    parts.push('High-ACV account requires human review before any ask.');
  }

  return parts.join(' ') || 'Standard scoring applied.';
}

function generateRecommendation(
  tier: ReadinessTier,
  antiTriggers: string[],
  adjustments: { requiresHumanOverride: boolean },
  latestTrigger: { eventDescription: string } | null
): string {
  if (adjustments.requiresHumanOverride) {
    return 'ACV exceeds $1M — requires manual review by sales leadership before referral ask.';
  }

  if (antiTriggers.some((t) => ANTI_TRIGGER_PENALTIES[t] === 'force_not_yet')) {
    return `Blocked: resolve ${antiTriggers.filter((t) => ANTI_TRIGGER_PENALTIES[t] === 'force_not_yet').join(', ')} before considering a referral ask.`;
  }

  switch (tier) {
    case 'hot':
      return latestTrigger
        ? `Ready for referral ask. Use "${latestTrigger.eventDescription}" as the trigger moment.`
        : 'Ready for referral ask. Identify the best trigger moment and proceed.';
    case 'warm':
      return 'Nurture relationship and monitor for trigger events. Schedule a QBR or value review.';
    case 'not_yet':
      return 'Not ready for referral. Focus on delivering value and strengthening the relationship.';
  }
}

// Re-export for use in other agents
export { getAcvRange };
