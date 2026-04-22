/**
 * Cohort Analyzer — Compares referral vs outbound pipeline performance.
 *
 * Pure function engine that takes deal data grouped by source,
 * computes per-cohort metrics, and quantifies the referral advantage.
 */

import type { CohortMetrics, CohortComparison, CohortSource } from './types.js';
import { DEFAULT_OUTBOUND_CAC, DEFAULT_REFERRAL_CAC } from './types.js';

export interface DealForCohort {
  source: CohortSource;
  amount: number;
  status: string; // referral status from schema
  timeToCloseDays: number | null;
  createdAt: Date;
}

/**
 * Analyze deal cohorts by source and compute comparative metrics.
 */
export function analyzeCohorts(
  deals: DealForCohort[],
  period: string,
  outboundCac: number = DEFAULT_OUTBOUND_CAC,
  referralCac: number = DEFAULT_REFERRAL_CAC,
  now: Date = new Date()
): CohortComparison {
  // Group by source
  const grouped = new Map<CohortSource, DealForCohort[]>();
  for (const deal of deals) {
    const existing = grouped.get(deal.source) ?? [];
    existing.push(deal);
    grouped.set(deal.source, existing);
  }

  const cohorts: CohortMetrics[] = [];
  for (const [source, sourceDeals] of grouped.entries()) {
    cohorts.push(computeCohortMetrics(source, sourceDeals, now));
  }

  // Compute referral advantage vs outbound
  const referralCohort = cohorts.find((c) => c.source === 'referral');
  const outboundCohort = cohorts.find((c) => c.source === 'outbound');

  const referralAdvantage = {
    winRateLift: referralCohort && outboundCohort && outboundCohort.winRate > 0
      ? referralCohort.winRate / outboundCohort.winRate
      : 0,
    speedAdvantage: referralCohort && outboundCohort
      ? outboundCohort.avgTimeToClose - referralCohort.avgTimeToClose
      : 0,
    dealSizeLift: referralCohort && outboundCohort && outboundCohort.avgDealSize > 0
      ? referralCohort.avgDealSize / outboundCohort.avgDealSize
      : 0,
    cacReduction: outboundCac > 0
      ? ((outboundCac - referralCac) / outboundCac) * 100
      : 0,
  };

  return { period, cohorts, referralAdvantage };
}

function computeCohortMetrics(
  source: CohortSource,
  deals: DealForCohort[],
  now: Date
): CohortMetrics {
  const closedWon = deals.filter((d) => d.status === 'closed_won');
  const closedLost = deals.filter((d) => d.status === 'closed_lost');
  const openDeals = deals.filter((d) => !['closed_won', 'closed_lost', 'expired', 'declined'].includes(d.status));

  const totalPipeline = deals.reduce((sum, d) => sum + d.amount, 0);
  const avgDealSize = deals.length > 0 ? totalPipeline / deals.length : 0;

  const closedDeals = [...closedWon, ...closedLost];
  const closedTimes = closedDeals.filter((d) => d.timeToCloseDays != null).map((d) => d.timeToCloseDays!);
  const avgTimeToClose = closedTimes.length > 0
    ? closedTimes.reduce((s, t) => s + t, 0) / closedTimes.length
    : 0;

  const totalClosed = closedWon.length + closedLost.length;
  const winRate = totalClosed > 0 ? closedWon.length / totalClosed : 0;

  const daysSinceCreated = deals.map((d) =>
    Math.floor((now.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24))
  );
  const avgDaysSinceCreated = daysSinceCreated.length > 0
    ? daysSinceCreated.reduce((s, d) => s + d, 0) / daysSinceCreated.length
    : 0;

  return {
    source,
    dealCount: deals.length,
    totalPipeline,
    avgDealSize,
    avgTimeToClose,
    winRate,
    closedWon: closedWon.length,
    closedLost: closedLost.length,
    openDeals: openDeals.length,
    avgDaysSinceCreated,
  };
}
