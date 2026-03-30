/**
 * Revenue Analyzer — Pure function engine for power-law distribution analysis.
 *
 * Takes revenue data points, sorts by revenue descending, computes:
 * 1. Tier assignments based on configurable percentile thresholds
 * 2. Gini coefficient to measure revenue concentration
 * 3. Per-tier revenue share statistics
 */

import type {
  RevenueDataPoint,
  TierThresholds,
  TieredAccount,
  PowerLawDistribution,
  PcpTier,
} from './types.js';
import { DEFAULT_TIER_THRESHOLDS } from './types.js';
import { ValidationError } from '../../shared/errors.js';

/**
 * Analyze revenue distribution across accounts and assign tiers.
 */
export function analyzeRevenue(
  data: RevenueDataPoint[],
  thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS
): PowerLawDistribution {
  if (data.length === 0) {
    throw new ValidationError('Revenue data cannot be empty');
  }

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  if (totalRevenue <= 0) {
    throw new ValidationError('Total revenue must be positive');
  }

  // Sort by revenue descending
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue);

  // Calculate tier cutoff indices
  const n = sorted.length;
  const powerLawCutoff = Math.max(1, Math.ceil(n * (thresholds.powerLawPct / 100)));
  const highValueCutoff = powerLawCutoff + Math.max(0, Math.ceil(n * (thresholds.highValuePct / 100)));
  const coreCutoff = highValueCutoff + Math.max(0, Math.ceil(n * (thresholds.corePct / 100)));

  // Assign tiers
  const tieredAccounts: TieredAccount[] = sorted.map((d, i) => {
    let tier: PcpTier;
    if (i < powerLawCutoff) tier = 'power_law';
    else if (i < highValueCutoff) tier = 'high_value';
    else if (i < coreCutoff) tier = 'core';
    else tier = 'long_tail';

    return {
      accountId: d.accountId,
      companyName: d.companyName,
      revenue: d.revenue,
      revenuePctOfTotal: (d.revenue / totalRevenue) * 100,
      rank: i + 1,
      tier,
    };
  });

  // Group by tier
  const byTier = (tier: PcpTier) => tieredAccounts.filter((a) => a.tier === tier);
  const tierRevenue = (accounts: TieredAccount[]) =>
    accounts.reduce((sum, a) => sum + a.revenue, 0);

  const powerLawAccounts = byTier('power_law');
  const highValueAccounts = byTier('high_value');
  const coreAccounts = byTier('core');
  const longTailAccounts = byTier('long_tail');

  return {
    totalAccounts: n,
    totalRevenue,
    giniCoefficient: computeGini(sorted.map((d) => d.revenue)),
    tiers: {
      powerLaw: {
        count: powerLawAccounts.length,
        revenuePct: (tierRevenue(powerLawAccounts) / totalRevenue) * 100,
        accounts: powerLawAccounts,
      },
      highValue: {
        count: highValueAccounts.length,
        revenuePct: (tierRevenue(highValueAccounts) / totalRevenue) * 100,
        accounts: highValueAccounts,
      },
      core: {
        count: coreAccounts.length,
        revenuePct: (tierRevenue(coreAccounts) / totalRevenue) * 100,
        accounts: coreAccounts,
      },
      longTail: {
        count: longTailAccounts.length,
        revenuePct: (tierRevenue(longTailAccounts) / totalRevenue) * 100,
        accounts: longTailAccounts,
      },
    },
  };
}

/**
 * Compute the Gini coefficient (0 = perfect equality, 1 = maximum inequality).
 * Uses the relative mean absolute difference formula.
 */
export function computeGini(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;

  // Gini = (2 * Σ(i * x_i)) / (n * Σ(x_i)) - (n + 1) / n
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i];
  }

  const gini = (2 * weightedSum) / (n * n * mean) - (n + 1) / n;
  return Math.max(0, Math.min(1, gini));
}
