import type { AskType, AcvRange, CommunicationStyle } from '../../shared/types.js';

export interface ComposeInput {
  championName: string;
  championTitle: string;
  championCompany: string;
  targetContact: string;
  targetTitle: string;
  targetCompany: string;
  triggerEvent: string;
  resultsToReference: string;
  acvRange: AcvRange;
  communicationStyle: CommunicationStyle;
  connectionPath: string;
}

export interface ComposedAsk {
  recommendedVersion: AskType;
  recommendationReason: string;
  liveAsk: { script: string; keyMechanics: string[] };
  asyncAsk: { subject: string; body: string; keyMechanics: string[] };
  softSeed: { message: string; keyMechanics: string[] };
}

export interface ResponseHandlerInput {
  response: 'yes' | 'maybe' | 'no';
  championName: string;
  championCompany: string;
  targetContact: string;
  targetTitle: string;
  targetCompany: string;
  triggerEvent: string;
  context?: string;
  owningAe: string;
  aeTitle?: string;
}

export interface YesResponseAssets {
  introEmailTemplate: string;
  aeFirstResponse: string;
  championThankYou: string;
}

export interface MaybeResponseAssets {
  day5Followup: string;
  day12FinalNudge: string;
  frictionRemover: string;
}

export interface NoResponseAssets {
  gracefulClose: string;
  alternativeAsk: string;
}

export type ResponseAssets = YesResponseAssets | MaybeResponseAssets | NoResponseAssets;
