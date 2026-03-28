import type { EscalationStep } from './types.js';

/**
 * 5-step escalation ladder with increasing multipliers.
 * Rewards increase with each successful referral to incentivize repeat behavior.
 * Pure function.
 */

const ESCALATION_MULTIPLIERS = [
  { referralNumber: 1, multiplier: 1.0, label: 'Base reward' },
  { referralNumber: 2, multiplier: 1.15, label: '15% increase' },
  { referralNumber: 3, multiplier: 1.30, label: '30% increase' },
  { referralNumber: 5, multiplier: 1.50, label: '50% increase — unlock Gold tier perks' },
  { referralNumber: 10, multiplier: 2.0, label: 'Double reward — Platinum tier recognition' },
];

/**
 * Build escalation path for a referral program.
 * Each step's reward cost is capped at the reward ceiling.
 */
export function buildEscalationPath(
  baseRewardSize: number,
  rewardCeiling: number
): EscalationStep[] {
  return ESCALATION_MULTIPLIERS.map((step) => {
    const escalatedReward = Math.round(baseRewardSize * step.multiplier);
    const cappedReward = Math.min(escalatedReward, rewardCeiling);

    return {
      referralNumber: step.referralNumber,
      rewardChange: cappedReward === escalatedReward
        ? step.label
        : `${step.label} (capped at ceiling)`,
      multiplier: step.multiplier,
    };
  });
}

/**
 * Get the appropriate multiplier for a given referral count.
 */
export function getMultiplierForCount(referralCount: number): number {
  // Walk backwards to find the highest applicable tier
  for (let i = ESCALATION_MULTIPLIERS.length - 1; i >= 0; i--) {
    if (referralCount >= ESCALATION_MULTIPLIERS[i].referralNumber) {
      return ESCALATION_MULTIPLIERS[i].multiplier;
    }
  }
  return 1.0;
}
