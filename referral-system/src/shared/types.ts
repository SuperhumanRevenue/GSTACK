import type { DbClient } from '../db/client.js';
import type { AppConfig } from '../config.js';
import type { CRMAdapter } from '../integrations/crm/interface.js';
import type { EnrichmentAdapter } from '../integrations/enrichment/interface.js';
import type { ConversationIntelAdapter } from '../integrations/conversation-intel/interface.js';
import type { NotificationAdapter } from '../integrations/notifications/interface.js';
import type { IntentAdapter } from '../integrations/intent/interface.js';
import type { CacheClient } from '../cache/redis.js';

/** Dependency injection container passed to all agents */
export interface ServerDeps {
  db: DbClient;
  cache: CacheClient;
  crm: CRMAdapter;
  enrichment: EnrichmentAdapter;
  conversationIntel: ConversationIntelAdapter;
  notifications: NotificationAdapter;
  intent: IntentAdapter;
  config: AppConfig;
}

// ─── Scoring Types ───

export type ReadinessTier = 'hot' | 'warm' | 'not_yet';
export type AskType = 'live' | 'async' | 'soft_seed';
export type ResponseType = 'yes' | 'maybe' | 'no' | 'no_response' | 'pending';
export type AcvRange = '30k_75k' | '75k_250k' | '250k_plus' | '1m_plus';
export type SeniorityLevel = 'c_suite' | 'vp' | 'director' | 'manager';
export type CommunicationStyle = 'formal' | 'casual';
export type RelationshipStrength = 'strong' | 'warm' | 'cold';

export interface ScoringDimensions {
  valueDelivered: number; // 0-25
  relationshipStrength: number; // 0-20
  recencyOfWin: number; // 0-20
  networkValue: number; // 0-20
  askHistory: number; // 0-15
}

export interface ScoringResult {
  totalScore: number;
  tier: ReadinessTier;
  dimensions: ScoringDimensions;
  triggerEvent: string | null;
  antiTriggers: string[];
  rationale: string;
  recommendedAction: string;
}

// ─── Report Types ───

export interface MonthlyHealthReport {
  period: { month: string; year: number };
  portfolioHealth: {
    totalAccounts: number;
    hot: { count: number; pct: number };
    warm: { count: number; pct: number };
    notYet: { count: number; pct: number };
  };
  activity: {
    asksMade: number;
    introsCompleted: { count: number; conversionFromAsk: number };
    meetingsBooked: { count: number; conversionFromIntro: number };
    opportunitiesCreated: number;
    pipelineValue: number;
  };
  lifetime: {
    totalPipeline: number;
    closedWon: number;
    avgTimeToCloseReferral: number;
    avgTimeToCloseNonReferral: number;
    referralCac: number;
    outboundCac: number;
    referralPctOfPipeline: number;
  };
  leaderboard: {
    championName: string;
    company: string;
    tier: string;
    intros: number;
    closed: number;
    revenue: number;
  }[];
  scoringModel: {
    hotConversionRate: number;
    modelAdjustmentNeeded: boolean;
    recommendedChange: string | null;
  };
  actionsNextMonth: string[];
}

export interface LeadershipSummary {
  headlineMetrics: {
    referralPipelineGenerated: number;
    referralClosedWon: number;
    referralCacVsOutbound: {
      referral: number;
      outbound: number;
      savingsPct: number;
    };
    avgTimeToClose: {
      referral: number;
      nonReferral: number;
      daysFaster: number;
    };
  };
  topWins: {
    company: string;
    revenue: number;
    champion: string;
    timeToClose: number;
  }[];
  programGrowth: {
    members: number;
    platinumCount: number;
    newThisQuarter: number;
  };
  nextQuarterProjection: {
    expectedAsks: number;
    expectedIntros: number;
    expectedPipeline: number;
  };
  investmentVsReturn: {
    programCost: number;
    revenueGenerated: number;
    roiMultiple: number;
  };
}
