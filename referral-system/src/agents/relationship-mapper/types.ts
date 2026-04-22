import type { Champion, ConnectionMap } from '../../db/schema.js';
import type { EnrichedConnection } from '../../integrations/enrichment/interface.js';

export interface NetworkAnalysis {
  champion: {
    id: string;
    name: string;
    title: string;
    company: string;
    networkReachScore: number;
  };
  highValueIntros: ScoredConnection[]; // composite score 7+
  moderateValueIntros: ScoredConnection[]; // composite score 4-6
  networkGaps: NetworkGap[];
  reverseReferralOpportunities: ReverseReferral[];
  totalConnectionsAnalyzed: number;
}

export interface ScoredConnection {
  targetCompany: string;
  targetContact: string;
  targetTitle: string;
  targetLinkedinUrl?: string;
  connectionPath: string;
  connectionStrengthScore: number; // 1-10
  targetAccountPriority: number; // 1-10
  roleMatchScore: number; // 1-10
  painAlignmentScore: number; // 1-10
  timingSignalScore: number; // 1-10
  compositeScore: number; // 1-10 weighted
  suggestedFraming: string;
  existingRelationship?: string;
}

export interface ConnectionScoringInput {
  connectionType: 'former_colleague' | 'linkedin' | 'community' | 'other';
  connectionStrength: number; // raw from enrichment, 1-10
  targetAccountPriority: number; // how much we want this account, 1-10
  buyerTitleMatch: boolean; // does champion know the right buyer?
  painAlignment: number; // does target have the pain we solve? 0-1
  hasTimingSignal: boolean; // is there buying intent?
  intentIntensity?: 'high' | 'medium' | 'low';
}

export interface ConnectionScoringWeights {
  connectionStrength: number; // weight factor
  targetAccountPriority: number;
  roleMatch: number;
  painAlignment: number;
  timingSignal: number;
}

export const DEFAULT_CONNECTION_WEIGHTS: ConnectionScoringWeights = {
  connectionStrength: 0.25,
  targetAccountPriority: 0.25,
  roleMatch: 0.20,
  painAlignment: 0.15,
  timingSignal: 0.15,
};

export interface NetworkGap {
  targetAccount: string;
  reason: string;
  alternativeApproach: string;
}

export interface ReverseReferral {
  contact: string;
  title: string;
  company: string;
  reason: string;
}

export interface WarmPath {
  champion: { id: string; name: string; company: string };
  connectionPath: string;
  compositeScore: number;
  suggestedFraming: string;
}

export interface ICPCriteria {
  industries?: string[];
  minEmployees?: number;
  maxEmployees?: number;
  buyerTitles?: string[];
}
