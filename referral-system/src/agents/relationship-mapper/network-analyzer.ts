import type { Champion } from '../../db/schema.js';
import type { EnrichedConnection, EnrichedPerson } from '../../integrations/enrichment/interface.js';
import type {
  NetworkAnalysis,
  ScoredConnection,
  NetworkGap,
  ReverseReferral,
  ICPCriteria,
} from './types.js';
import {
  scoreConnection,
  generateFraming,
  inferConnectionType,
} from './connection-scorer.js';

interface AnalysisInput {
  champion: Champion;
  accountCompanyName: string;
  connections: EnrichedConnection[];
  enrichedProfile?: EnrichedPerson;
  targetAccountNames?: string[]; // Named targets to cross-reference
  icpCriteria?: ICPCriteria;
  targetAccountPriorities?: Map<string, number>; // company name -> priority 1-10
  painAlignments?: Map<string, number>; // company name -> alignment 0-1
  timingSignals?: Map<string, { hasSignal: boolean; intensity?: 'high' | 'medium' | 'low' }>;
  existingCrmRelationships?: Map<string, string>; // company name -> relationship description
}

/**
 * Pure function: Analyze a champion's network and produce scored connections.
 */
export function analyzeNetwork(input: AnalysisInput): NetworkAnalysis {
  const {
    champion,
    accountCompanyName,
    connections,
    enrichedProfile,
    targetAccountNames = [],
    icpCriteria,
    targetAccountPriorities = new Map(),
    painAlignments = new Map(),
    timingSignals = new Map(),
    existingCrmRelationships = new Map(),
  } = input;

  const formerCompanies = enrichedProfile?.formerCompanies ?? champion.formerCompanies ?? [];
  const communities = enrichedProfile?.industryCommunities ?? champion.industryCommunities ?? [];

  // Score each connection
  const scored: ScoredConnection[] = [];

  for (const conn of connections) {
    // Apply ICP filter if provided
    if (icpCriteria && !matchesICP(conn, icpCriteria)) {
      continue;
    }

    const connectionType = inferConnectionType(
      formerCompanies,
      communities,
      conn.company,
      conn
    );

    const priority = targetAccountPriorities.get(conn.company) ??
      (targetAccountNames.includes(conn.company) ? 8 : 5);

    const pain = painAlignments.get(conn.company) ?? 0.5;
    const timing = timingSignals.get(conn.company) ?? { hasSignal: false };

    const scores = scoreConnection({
      connectionType,
      connectionStrength: conn.connectionStrength,
      targetAccountPriority: priority,
      buyerTitleMatch: isBuyerTitle(conn.title, icpCriteria?.buyerTitles),
      painAlignment: pain,
      hasTimingSignal: timing.hasSignal,
      intentIntensity: timing.intensity,
    });

    const framing = generateFraming(
      champion.name,
      conn.name,
      conn.company,
      connectionType,
      conn.title
    );

    scored.push({
      targetCompany: conn.company,
      targetContact: conn.name,
      targetTitle: conn.title,
      connectionPath: describeConnectionPath(champion.name, conn, connectionType, formerCompanies, communities),
      ...scores,
      suggestedFraming: framing,
      existingRelationship: existingCrmRelationships.get(conn.company),
    });
  }

  // Sort by composite score descending
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  const highValue = scored.filter((s) => s.compositeScore >= 7);
  const moderateValue = scored.filter((s) => s.compositeScore >= 4 && s.compositeScore < 7);

  // Identify gaps: target accounts with no warm path
  const connectedCompanies = new Set(scored.map((s) => s.targetCompany));
  const gaps: NetworkGap[] = targetAccountNames
    .filter((name) => !connectedCompanies.has(name))
    .map((name) => ({
      targetAccount: name,
      reason: `No direct connection found in ${champion.name}'s network`,
      alternativeApproach: suggestAlternativeApproach(name),
    }));

  // Identify reverse referral opportunities
  const reverseReferrals = identifyReverseReferrals(scored, accountCompanyName);

  return {
    champion: {
      id: champion.id,
      name: champion.name,
      title: champion.title,
      company: accountCompanyName,
      networkReachScore: enrichedProfile?.networkReachScore ?? champion.networkReachScore ?? 0,
    },
    highValueIntros: highValue,
    moderateValueIntros: moderateValue,
    networkGaps: gaps,
    reverseReferralOpportunities: reverseReferrals,
    totalConnectionsAnalyzed: connections.length,
  };
}

// ─── Helper Functions ───

function matchesICP(conn: EnrichedConnection, criteria: ICPCriteria): boolean {
  // Title-based filtering
  if (criteria.buyerTitles && criteria.buyerTitles.length > 0) {
    const titleLower = conn.title.toLowerCase();
    const anyTitleMatch = criteria.buyerTitles.some((t) =>
      titleLower.includes(t.toLowerCase())
    );
    // Don't filter out, just note — we still want to show connections
    // even if they're not the exact buyer title
  }
  return true; // Permissive — ICP is used for scoring, not hard filtering
}

function isBuyerTitle(title: string, buyerTitles?: string[]): boolean {
  if (!buyerTitles || buyerTitles.length === 0) {
    // Default buyer titles
    const defaults = ['cto', 'cio', 'vp', 'head of', 'director', 'chief'];
    return defaults.some((d) => title.toLowerCase().includes(d));
  }
  return buyerTitles.some((t) => title.toLowerCase().includes(t.toLowerCase()));
}

function describeConnectionPath(
  championName: string,
  conn: EnrichedConnection,
  connectionType: 'former_colleague' | 'linkedin' | 'community' | 'other',
  formerCompanies: string[],
  communities: string[]
): string {
  switch (connectionType) {
    case 'former_colleague': {
      const sharedCompany = formerCompanies.find(
        (c) => c.toLowerCase() === conn.company.toLowerCase()
      );
      if (sharedCompany) {
        return `${championName} previously worked at ${sharedCompany} → knows ${conn.name} (${conn.title}) at ${conn.company}`;
      }
      return `${championName} is a former colleague of ${conn.name} (${conn.title}) at ${conn.company}`;
    }
    case 'community':
      return `${championName} and ${conn.name} are in shared professional communities → ${conn.title} at ${conn.company}`;
    case 'linkedin':
      return `${championName} is connected with ${conn.name} (${conn.title}) at ${conn.company} via LinkedIn`;
    default:
      return `${championName} → ${conn.name} (${conn.title}) at ${conn.company}`;
  }
}

function suggestAlternativeApproach(targetAccount: string): string {
  return `Consider: (1) Check other champions' networks for paths to ${targetAccount}, (2) Use enrichment to find mutual connections, (3) Cold outreach with social proof from similar customers.`;
}

function identifyReverseReferrals(
  scored: ScoredConnection[],
  currentCompany: string
): ReverseReferral[] {
  // Connections who could refer people TO our champion's company
  return scored
    .filter((s) => s.connectionStrengthScore >= 7 && s.roleMatchScore >= 7)
    .slice(0, 3)
    .map((s) => ({
      contact: s.targetContact,
      title: s.targetTitle,
      company: s.targetCompany,
      reason: `Strong connection (${s.connectionStrengthScore}/10) with buyer-level title — could refer prospects to ${currentCompany} as well`,
    }));
}
