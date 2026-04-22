import type {
  ConnectionScoringInput,
  ConnectionScoringWeights,
  ScoredConnection,
} from './types.js';
import { DEFAULT_CONNECTION_WEIGHTS } from './types.js';
import type { EnrichedConnection } from '../../integrations/enrichment/interface.js';

/**
 * Pure function: Score a single connection on 5 factors, producing a 1-10 composite.
 */
export function scoreConnection(
  input: ConnectionScoringInput,
  weights: ConnectionScoringWeights = DEFAULT_CONNECTION_WEIGHTS
): {
  connectionStrengthScore: number;
  targetAccountPriority: number;
  roleMatchScore: number;
  painAlignmentScore: number;
  timingSignalScore: number;
  compositeScore: number;
} {
  // Factor 1: Connection Strength (1-10)
  // Former colleagues score higher than LinkedIn-only
  let connectionStrengthScore = input.connectionStrength;
  if (input.connectionType === 'former_colleague') {
    connectionStrengthScore = Math.min(10, connectionStrengthScore + 2);
  } else if (input.connectionType === 'community') {
    connectionStrengthScore = Math.min(10, connectionStrengthScore + 1);
  }

  // Factor 2: Target Account Priority (1-10) — passed through
  const targetAccountPriority = Math.max(1, Math.min(10, input.targetAccountPriority));

  // Factor 3: Role Match (1-10)
  const roleMatchScore = input.buyerTitleMatch ? 9 : 4;

  // Factor 4: Pain Alignment (1-10)
  const painAlignmentScore = Math.max(1, Math.round(input.painAlignment * 10));

  // Factor 5: Timing Signal (1-10)
  let timingSignalScore = input.hasTimingSignal ? 7 : 3;
  if (input.hasTimingSignal && input.intentIntensity === 'high') {
    timingSignalScore = 10;
  } else if (input.hasTimingSignal && input.intentIntensity === 'medium') {
    timingSignalScore = 7;
  }

  // Weighted composite
  const composite =
    connectionStrengthScore * weights.connectionStrength +
    targetAccountPriority * weights.targetAccountPriority +
    roleMatchScore * weights.roleMatch +
    painAlignmentScore * weights.painAlignment +
    timingSignalScore * weights.timingSignal;

  const compositeScore = Math.max(1, Math.min(10, Math.round(composite)));

  return {
    connectionStrengthScore,
    targetAccountPriority,
    roleMatchScore,
    painAlignmentScore,
    timingSignalScore,
    compositeScore,
  };
}

/**
 * Pure function: Generate a suggested framing for the introduction.
 */
export function generateFraming(
  championName: string,
  targetContact: string,
  targetCompany: string,
  connectionType: 'former_colleague' | 'linkedin' | 'community' | 'other',
  targetTitle: string
): string {
  switch (connectionType) {
    case 'former_colleague':
      return `${championName} worked with ${targetContact} previously and can make a personal introduction based on their shared experience.`;
    case 'community':
      return `${championName} and ${targetContact} are both active in the same professional community — a warm peer-to-peer introduction.`;
    case 'linkedin':
      return `${championName} is connected with ${targetContact} (${targetTitle} at ${targetCompany}) on LinkedIn — a network-based introduction.`;
    default:
      return `${championName} can introduce you to ${targetContact} at ${targetCompany}.`;
  }
}

/**
 * Pure function: Determine connection type from enrichment data.
 */
export function inferConnectionType(
  championFormerCompanies: string[],
  championCommunities: string[],
  targetCompany: string,
  enrichedConnection?: EnrichedConnection
): 'former_colleague' | 'linkedin' | 'community' | 'other' {
  if (enrichedConnection?.connectionType) {
    return enrichedConnection.connectionType;
  }

  // Check if champion previously worked at the target's company
  if (championFormerCompanies.some((c) => c.toLowerCase() === targetCompany.toLowerCase())) {
    return 'former_colleague';
  }

  // Check shared communities
  if (championCommunities.length > 0) {
    return 'community';
  }

  return 'linkedin';
}
