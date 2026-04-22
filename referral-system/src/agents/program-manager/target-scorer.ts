/**
 * Target scoring — 5 dimensions, 100-point scale.
 * Scores how valuable a referral target is before asking.
 * Pure function: no DB or side effects.
 */

export interface TargetScoringInput {
  icpFit: number;                // 0-10 raw
  painAlignment: number;         // 0-10 raw
  championCredibility: number;   // 0-10 raw
  timing: number;                // 0-10 raw
  dealSize: number;              // 0-10 raw
}

export interface TargetScoring {
  totalScore: number;
  priority: 'high' | 'medium' | 'low';
  icpFitScore: number;           // 0-30
  painAlignmentScore: number;    // 0-25
  championCredibilityScore: number; // 0-20
  timingScore: number;           // 0-15
  dealSizeScore: number;         // 0-10
}

export const TARGET_WEIGHTS = {
  icpFit: 30,
  painAlignment: 25,
  championCredibility: 20,
  timing: 15,
  dealSize: 10,
} as const;

const PRIORITY_THRESHOLDS = {
  high: 70,
  medium: 40,
} as const;

export function scoreTarget(input: TargetScoringInput): TargetScoring {
  const icpFitScore = Math.round(clamp(input.icpFit, 0, 10) * (TARGET_WEIGHTS.icpFit / 10));
  const painAlignmentScore = Math.round(clamp(input.painAlignment, 0, 10) * (TARGET_WEIGHTS.painAlignment / 10));
  const championCredibilityScore = Math.round(clamp(input.championCredibility, 0, 10) * (TARGET_WEIGHTS.championCredibility / 10));
  const timingScore = Math.round(clamp(input.timing, 0, 10) * (TARGET_WEIGHTS.timing / 10));
  const dealSizeScore = Math.round(clamp(input.dealSize, 0, 10) * (TARGET_WEIGHTS.dealSize / 10));

  const totalScore = icpFitScore + painAlignmentScore + championCredibilityScore + timingScore + dealSizeScore;
  const priority = assignPriority(totalScore);

  return {
    totalScore,
    priority,
    icpFitScore,
    painAlignmentScore,
    championCredibilityScore,
    timingScore,
    dealSizeScore,
  };
}

export function assignPriority(score: number): 'high' | 'medium' | 'low' {
  if (score >= PRIORITY_THRESHOLDS.high) return 'high';
  if (score >= PRIORITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
