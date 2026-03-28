import type { ICPCriteria, ScoredConnection } from './types.js';
import type { EnrichedCompany } from '../../integrations/enrichment/interface.js';

interface TargetMatchInput {
  scoredConnections: ScoredConnection[];
  targetAccounts: TargetAccount[];
  icpCriteria?: ICPCriteria;
}

export interface TargetAccount {
  companyName: string;
  industry?: string;
  employeeCount?: number;
  enrichedData?: EnrichedCompany;
  priority?: number; // 1-10
}

export interface TargetMatchResult {
  matched: MatchedTarget[];
  unmatched: UnmatchedTarget[];
}

export interface MatchedTarget {
  targetAccount: TargetAccount;
  connections: ScoredConnection[];
  bestConnection: ScoredConnection;
  icpFitScore: number; // 0-10
}

export interface UnmatchedTarget {
  targetAccount: TargetAccount;
  reason: string;
  suggestion: string;
}

/**
 * Pure function: Cross-reference scored connections against a target account list.
 * Returns matched targets (with their best connection path) and unmatched targets.
 */
export function matchTargets(input: TargetMatchInput): TargetMatchResult {
  const { scoredConnections, targetAccounts, icpCriteria } = input;

  const matched: MatchedTarget[] = [];
  const unmatched: UnmatchedTarget[] = [];

  for (const target of targetAccounts) {
    // Find all connections that lead to this target
    const connections = scoredConnections.filter(
      (c) => c.targetCompany.toLowerCase() === target.companyName.toLowerCase()
    );

    if (connections.length > 0) {
      // Sort by composite score, best first
      connections.sort((a, b) => b.compositeScore - a.compositeScore);

      const icpFitScore = calculateICPFit(target, icpCriteria);

      matched.push({
        targetAccount: target,
        connections,
        bestConnection: connections[0],
        icpFitScore,
      });
    } else {
      unmatched.push({
        targetAccount: target,
        reason: 'No connection paths found in champion network',
        suggestion: suggestApproach(target),
      });
    }
  }

  // Sort matched by best connection score descending
  matched.sort((a, b) => b.bestConnection.compositeScore - a.bestConnection.compositeScore);

  return { matched, unmatched };
}

/**
 * Pure function: Calculate how well a target account fits the ICP.
 */
function calculateICPFit(target: TargetAccount, criteria?: ICPCriteria): number {
  if (!criteria) return 5; // Neutral when no criteria specified

  let score = 5; // Base score
  const enriched = target.enrichedData;

  // Industry match
  if (criteria.industries && criteria.industries.length > 0) {
    const industry = enriched?.industry ?? target.industry;
    if (industry && criteria.industries.some((i) => i.toLowerCase() === industry.toLowerCase())) {
      score += 2;
    } else {
      score -= 1;
    }
  }

  // Employee count range
  if (criteria.minEmployees || criteria.maxEmployees) {
    const employees = enriched?.employeeCount ?? target.employeeCount;
    if (employees) {
      const min = criteria.minEmployees ?? 0;
      const max = criteria.maxEmployees ?? Infinity;
      if (employees >= min && employees <= max) {
        score += 2;
      } else {
        score -= 1;
      }
    }
  }

  return Math.max(1, Math.min(10, score));
}

function suggestApproach(target: TargetAccount): string {
  const parts = [`No warm path to ${target.companyName}.`];

  if (target.priority && target.priority >= 8) {
    parts.push('High-priority target — check other champions or use enrichment to discover indirect connections.');
  } else {
    parts.push('Consider cold outreach with social proof, or monitor for a future warm path.');
  }

  return parts.join(' ');
}
