import type { SignalTemplate, CustomerContext, CustomSignalGuide } from '../../db/schema.js';

export type SignalStrength = 'low' | 'medium' | 'high';
export type SignalTag = 'sales_led' | 'product_led' | 'nearbound' | 'event' | 'competitor' | 'community_led';
export type SignalChannel = 'dark_funnel' | 'crm' | 'website' | 'product' | 'community' | 'open_source';
export type FunnelStage = 'top_awareness' | 'mid_consideration' | 'bottom_conversion';

export interface CustomerIntakeInput {
  companyName: string;
  productDescription?: string;
  positioning?: string;
  messaging?: string;
  caseStudies?: { title: string; summary: string; metrics?: string[] }[];
  masterDeckSummary?: string;
  packaging?: { tier: string; description: string; price?: string }[];
  targetIndustries?: string[];
  targetPersonas?: { title: string; painPoints: string[]; goals: string[] }[];
  competitors?: { name: string; positioning?: string; weaknesses?: string[] }[];
  techStackAdjacencies?: string[];
}

export interface CustomizationResult {
  customizedName: string;
  customizedDescription: string;
  customizedPlaybook: string;
  relevanceScore: number;
  exampleTriggers: string[];
}

export interface GuideGenerationResult {
  customerContextId: string;
  totalSignals: number;
  activeSignals: number;
  inactiveSignals: number;
  byTag: Record<string, { total: number; active: number; avgRelevance: number }>;
  topSignals: { name: string; relevance: number; tag: string }[];
}

/** The master signal as a plain object (for seed data and pure functions) */
export interface MasterSignal {
  signalName: string;
  whyItMatters: string;
  strength: SignalStrength;
  tag: SignalTag;
  channel: SignalChannel;
  funnelStage: FunnelStage;
  hasPlaybook: boolean;
  playbook?: string;
  categoryOrder: number;
}
