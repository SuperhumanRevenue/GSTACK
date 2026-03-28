import type { Account, Champion, TriggerEvent, Referral } from '../../db/schema.js';
import type { ScoringDimensions, ScoringResult, ReadinessTier, AcvRange } from '../../shared/types.js';

export interface ScoringInput {
  account: Account;
  champion: Champion;
  triggerEvents: TriggerEvent[];
  referralHistory: Referral[];
  enrichmentData?: {
    networkReachScore: number;
    formerCompanies: string[];
    industryCommunities: string[];
  };
}

export interface ScoringWeights {
  valueDelivered: { max: 25 };
  relationshipStrength: { max: 20 };
  recencyOfWin: { max: 20 };
  networkValue: { max: 20 };
  askHistory: { max: 15 };
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  valueDelivered: { max: 25 },
  relationshipStrength: { max: 20 },
  recencyOfWin: { max: 20 },
  networkValue: { max: 20 },
  askHistory: { max: 15 },
};

export interface AcvAdjustments {
  relationshipStrengthMultiplier: number;
  networkValueMultiplier: number;
  requiresHumanOverride: boolean;
}

export const ACV_ADJUSTMENTS: Record<AcvRange, AcvAdjustments> = {
  '30k_75k': {
    relationshipStrengthMultiplier: 1.0,
    networkValueMultiplier: 1.0,
    requiresHumanOverride: false,
  },
  '75k_250k': {
    relationshipStrengthMultiplier: 1.2,
    networkValueMultiplier: 1.0,
    requiresHumanOverride: false,
  },
  '250k_plus': {
    relationshipStrengthMultiplier: 1.0,
    networkValueMultiplier: 1.25,
    requiresHumanOverride: false,
  },
  '1m_plus': {
    relationshipStrengthMultiplier: 1.0,
    networkValueMultiplier: 1.25,
    requiresHumanOverride: true,
  },
};

/** Anti-trigger conditions that hard-block or penalize scoring */
export const ANTI_TRIGGER_PENALTIES: Record<string, number | 'force_not_yet'> = {
  support_escalation_active: 'force_not_yet',
  usage_declining_20pct: 'force_not_yet',
  champion_departed: 'force_not_yet',
  churn_risk_active: 'force_not_yet',
  recent_ask_explicit_no: -15,
  recent_ask_no_response: -10,
  competitor_evaluation: -10,
  missed_renewal: -8,
};

export type { ScoringDimensions, ScoringResult, ReadinessTier, AcvRange };
