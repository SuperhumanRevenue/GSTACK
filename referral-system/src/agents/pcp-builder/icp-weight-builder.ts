/**
 * ICP Weight Builder — Computes empirical ICP weights from attribute frequency analysis.
 *
 * Compares attribute frequencies in power-law accounts vs overall population.
 * Attributes more concentrated in power-law accounts get higher lift scores,
 * which become the basis for target scoring weights.
 */

import type { AccountAttribute, AttributeFrequency, IcpWeightResult, TargetScoreInput, TargetScoreResult } from './types.js';
import { bucketEmployeeCount, bucketAcv } from './attribute-extractor.js';

/**
 * Build ICP weights by comparing attribute frequencies between power-law and all accounts.
 */
export function buildIcpWeights(
  powerLawAttributes: AccountAttribute[][],
  allAttributes: AccountAttribute[][]
): IcpWeightResult {
  const powerLawCount = powerLawAttributes.length;
  const totalCount = allAttributes.length;

  if (powerLawCount === 0 || totalCount === 0) {
    return {
      totalPowerLawAccounts: powerLawCount,
      totalAccounts: totalCount,
      attributes: [],
      topAttributes: [],
    };
  }

  // Count attribute frequencies in each group
  const powerLawFreqs = countFrequencies(powerLawAttributes, powerLawCount);
  const overallFreqs = countFrequencies(allAttributes, totalCount);

  // Compute lift scores
  const results: AttributeFrequency[] = [];

  for (const [key, plFreq] of powerLawFreqs.entries()) {
    const oFreq = overallFreqs.get(key) ?? 0;
    if (oFreq === 0) continue; // avoid division by zero

    const [attribute, value] = key.split('::');
    const lift = plFreq / oFreq;

    results.push({
      attribute,
      value,
      powerLawFrequency: plFreq,
      overallFrequency: oFreq,
      liftScore: lift,
      weight: 0, // computed after normalization
      sampleSize: Math.round(plFreq * powerLawCount),
    });
  }

  // Normalize weights: lift scores normalized to 0-1 range
  normalizeWeights(results);

  // Sort by lift descending
  results.sort((a, b) => b.liftScore - a.liftScore);

  return {
    totalPowerLawAccounts: powerLawCount,
    totalAccounts: totalCount,
    attributes: results,
    topAttributes: results.slice(0, 10).map((r) => ({
      attribute: r.attribute,
      value: r.value,
      lift: r.liftScore,
    })),
  };
}

/**
 * Score a target prospect against empirical ICP weights.
 */
export function scoreTarget(
  target: TargetScoreInput,
  weights: AttributeFrequency[]
): TargetScoreResult {
  // Build target's attribute set
  const targetAttrs = new Map<string, string>();

  if (target.industry) {
    targetAttrs.set('industry', target.industry);
  }
  if (target.employeeCount != null) {
    targetAttrs.set('employee_count_range', bucketEmployeeCount(target.employeeCount));
  }
  if (target.acv != null) {
    targetAttrs.set('acv_range', bucketAcv(target.acv));
  }
  if (target.usageTrend) {
    targetAttrs.set('usage_trend', target.usageTrend);
  }

  const matched: { attribute: string; value: string; weight: number; lift: number }[] = [];
  const highLiftWeights = weights.filter((w) => w.liftScore >= 1.0);

  for (const w of weights) {
    const targetValue = targetAttrs.get(w.attribute);
    if (targetValue === w.value) {
      matched.push({
        attribute: w.attribute,
        value: w.value,
        weight: parseFloat(w.weight.toFixed(4)),
        lift: parseFloat(w.liftScore.toFixed(4)),
      });
    }
  }

  // Find top unmatched attributes for gap analysis
  const matchedKeys = new Set(matched.map((m) => `${m.attribute}::${m.value}`));
  const unmatched = highLiftWeights
    .filter((w) => !matchedKeys.has(`${w.attribute}::${w.value}`))
    .slice(0, 5)
    .map((w) => ({ attribute: w.attribute, value: w.value, lift: parseFloat(w.liftScore.toFixed(4)) }));

  // Score: weighted sum of matched attributes, scaled to 0-100
  const maxPossible = weights.reduce((sum, w) => sum + w.weight, 0);
  const matchedWeight = matched.reduce((sum, m) => sum + m.weight, 0);
  const totalScore = maxPossible > 0 ? Math.round((matchedWeight / maxPossible) * 100) : 0;

  let tier: TargetScoreResult['tier'];
  if (totalScore >= 75) tier = 'excellent';
  else if (totalScore >= 50) tier = 'good';
  else if (totalScore >= 25) tier = 'moderate';
  else tier = 'weak';

  return {
    totalScore,
    matchedAttributes: matched,
    unmatchedTopAttributes: unmatched,
    tier,
  };
}

// ─── Internal helpers ───

function countFrequencies(
  attributeSets: AccountAttribute[][],
  total: number
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const attrs of attributeSets) {
    // Deduplicate within a single account
    const seen = new Set<string>();
    for (const a of attrs) {
      const key = `${a.attribute}::${a.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  // Convert counts to frequencies
  const frequencies = new Map<string, number>();
  for (const [key, count] of counts.entries()) {
    frequencies.set(key, count / total);
  }

  return frequencies;
}

function normalizeWeights(results: AttributeFrequency[]): void {
  if (results.length === 0) return;

  const maxLift = Math.max(...results.map((r) => r.liftScore));
  if (maxLift === 0) return;

  for (const r of results) {
    r.weight = r.liftScore / maxLift;
  }
}
