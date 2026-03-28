import type { Referral, Champion, Account, SuperReferrer, ReadinessScore } from '../../db/schema.js';
import type { MonthlyHealthReport, LeadershipSummary } from '../../shared/types.js';
import { formatCurrency } from '../../shared/formatting.js';

/**
 * Pure functions for generating reports from referral data.
 * No DB access — callers must fetch and pass all data.
 */

// ─── Monthly Health Report ───

export interface MonthlyHealthInput {
  month: string; // 'January', 'February', etc.
  year: number;
  accounts: Account[];
  readinessScores: ReadinessScore[];
  referrals: Referral[];
  champions: Champion[];
  superReferrers: SuperReferrer[];
  outboundCac: number;
  programCost: number;
}

export function generateMonthlyHealth(input: MonthlyHealthInput): MonthlyHealthReport {
  const { month, year, accounts, readinessScores, referrals, champions, superReferrers, outboundCac, programCost } = input;

  // Portfolio health from latest scores
  const latestScores = getLatestScoresPerAccount(readinessScores);
  const totalAccounts = accounts.length;
  const hot = latestScores.filter((s) => s.tier === 'hot');
  const warm = latestScores.filter((s) => s.tier === 'warm');
  const notYet = latestScores.filter((s) => s.tier === 'not_yet');

  // Activity metrics — all referrals (not just this month for lifetime)
  const allReferrals = referrals;
  const asksMade = allReferrals.filter((r) => r.askDate != null).length;
  const introsCompleted = allReferrals.filter((r) => r.introDate != null);
  const meetingsBooked = allReferrals.filter((r) => r.meetingDate != null);
  const opportunitiesCreated = allReferrals.filter((r) =>
    ['opportunity_created', 'closed_won', 'closed_lost'].includes(r.status ?? '')
  );
  const closedWon = allReferrals.filter((r) => r.status === 'closed_won');
  const pipelineValue = allReferrals
    .filter((r) => r.opportunityAmount != null)
    .reduce((sum, r) => sum + parseFloat(r.opportunityAmount!), 0);
  const closedWonRevenue = closedWon.reduce(
    (sum, r) => sum + (r.closedAmount ? parseFloat(r.closedAmount) : 0),
    0
  );

  // Time-to-close
  const closedWithTime = closedWon.filter((r) => r.timeToCloseDays != null);
  const avgTimeToCloseReferral = closedWithTime.length > 0
    ? Math.round(closedWithTime.reduce((s, r) => s + (r.timeToCloseDays ?? 0), 0) / closedWithTime.length)
    : 0;

  // Referral CAC = program cost / closed deals
  const referralCac = closedWon.length > 0 ? Math.round(programCost / closedWon.length) : 0;

  // Referral % of pipeline
  const referralPctOfPipeline = pipelineValue > 0 ? closedWonRevenue / pipelineValue : 0;

  // Leaderboard
  const leaderboard = buildLeaderboard(champions, superReferrers, allReferrals);

  // Scoring model check
  const hotConversionRate = hot.length > 0
    ? closedWon.filter((r) => {
        const score = latestScores.find((s) => s.accountId === r.accountId);
        return score?.tier === 'hot';
      }).length / hot.length
    : 0;
  const modelAdjustmentNeeded = hotConversionRate < 0.15 && closedWon.length >= 50;

  return {
    period: { month, year },
    portfolioHealth: {
      totalAccounts,
      hot: { count: hot.length, pct: totalAccounts > 0 ? hot.length / totalAccounts : 0 },
      warm: { count: warm.length, pct: totalAccounts > 0 ? warm.length / totalAccounts : 0 },
      notYet: { count: notYet.length, pct: totalAccounts > 0 ? notYet.length / totalAccounts : 0 },
    },
    activity: {
      asksMade,
      introsCompleted: {
        count: introsCompleted.length,
        conversionFromAsk: asksMade > 0 ? introsCompleted.length / asksMade : 0,
      },
      meetingsBooked: {
        count: meetingsBooked.length,
        conversionFromIntro: introsCompleted.length > 0 ? meetingsBooked.length / introsCompleted.length : 0,
      },
      opportunitiesCreated: opportunitiesCreated.length,
      pipelineValue,
    },
    lifetime: {
      totalPipeline: pipelineValue,
      closedWon: closedWonRevenue,
      avgTimeToCloseReferral,
      avgTimeToCloseNonReferral: 0, // Would come from CRM data
      referralCac,
      outboundCac,
      referralPctOfPipeline,
    },
    leaderboard,
    scoringModel: {
      hotConversionRate,
      modelAdjustmentNeeded,
      recommendedChange: modelAdjustmentNeeded
        ? 'Hot tier conversion is below 15%. Consider raising the hot threshold or adjusting dimension weights.'
        : null,
    },
    actionsNextMonth: generateActionItems(input),
  };
}

// ─── Leadership Summary ───

export interface LeadershipSummaryInput {
  referrals: Referral[];
  champions: Champion[];
  superReferrers: SuperReferrer[];
  outboundCac: number;
  programCost: number;
  quarterLabel: string;
}

export function generateLeadershipSummary(input: LeadershipSummaryInput): LeadershipSummary {
  const { referrals, champions, superReferrers, outboundCac, programCost } = input;

  const closedWon = referrals.filter((r) => r.status === 'closed_won');
  const totalRevenue = closedWon.reduce(
    (sum, r) => sum + (r.closedAmount ? parseFloat(r.closedAmount) : 0),
    0
  );
  const pipelineValue = referrals
    .filter((r) => r.opportunityAmount != null)
    .reduce((sum, r) => sum + parseFloat(r.opportunityAmount!), 0);

  const closedWithTime = closedWon.filter((r) => r.timeToCloseDays != null);
  const avgTimeToClose = closedWithTime.length > 0
    ? Math.round(closedWithTime.reduce((s, r) => s + (r.timeToCloseDays ?? 0), 0) / closedWithTime.length)
    : 0;

  const referralCac = closedWon.length > 0 ? Math.round(programCost / closedWon.length) : 0;
  const cacSavingsPct = outboundCac > 0 ? (outboundCac - referralCac) / outboundCac : 0;

  // Top wins
  const topWins = closedWon
    .sort((a, b) => parseFloat(b.closedAmount ?? '0') - parseFloat(a.closedAmount ?? '0'))
    .slice(0, 5)
    .map((r) => {
      const champ = champions.find((c) => c.id === r.championId);
      return {
        company: r.targetCompany,
        revenue: r.closedAmount ? parseFloat(r.closedAmount) : 0,
        champion: champ?.name ?? 'Unknown',
        timeToClose: r.timeToCloseDays ?? 0,
      };
    });

  // Program growth
  const platinumCount = superReferrers.filter((s) => s.tier === 'platinum').length;

  // Projection (simple: last quarter * 1.1 growth)
  const askCount = referrals.filter((r) => r.askDate != null).length;
  const introRate = askCount > 0 ? referrals.filter((r) => r.introDate != null).length / askCount : 0;
  const expectedAsks = Math.round(askCount * 1.1);
  const expectedIntros = Math.round(expectedAsks * introRate);

  const avgDealSize = closedWon.length > 0 ? totalRevenue / closedWon.length : 0;
  const closeRate = referrals.filter((r) => r.introDate != null).length > 0
    ? closedWon.length / referrals.filter((r) => r.introDate != null).length
    : 0;
  const expectedPipeline = Math.round(expectedIntros * closeRate * avgDealSize);

  return {
    headlineMetrics: {
      referralPipelineGenerated: pipelineValue,
      referralClosedWon: totalRevenue,
      referralCacVsOutbound: {
        referral: referralCac,
        outbound: outboundCac,
        savingsPct: cacSavingsPct,
      },
      avgTimeToClose: {
        referral: avgTimeToClose,
        nonReferral: 0,
        daysFaster: 0,
      },
    },
    topWins,
    programGrowth: {
      members: superReferrers.length,
      platinumCount,
      newThisQuarter: 0, // Would need date filtering
    },
    nextQuarterProjection: {
      expectedAsks,
      expectedIntros,
      expectedPipeline,
    },
    investmentVsReturn: {
      programCost,
      revenueGenerated: totalRevenue,
      roiMultiple: programCost > 0 ? totalRevenue / programCost : 0,
    },
  };
}

// ─── Recalibration ───

export interface RecalibrationInput {
  referrals: Referral[];
  readinessScores: ReadinessScore[];
  minSampleSize: number;
}

export interface RecalibrationResult {
  status: 'recalibrated' | 'insufficient_data';
  sampleSize: number;
  findings: RecalibrationFinding[];
  suggestedWeightChanges: Record<string, { current: number; suggested: number; reason: string }>;
}

export interface RecalibrationFinding {
  dimension: string;
  observation: string;
  severity: 'high' | 'medium' | 'low';
}

export function recalibrateModel(input: RecalibrationInput): RecalibrationResult {
  const completedReferrals = input.referrals.filter((r) =>
    r.status === 'closed_won' || r.status === 'closed_lost' || r.status === 'declined'
  );

  if (completedReferrals.length < input.minSampleSize) {
    return {
      status: 'insufficient_data',
      sampleSize: completedReferrals.length,
      findings: [],
      suggestedWeightChanges: {},
    };
  }

  // Analyze which scores led to success vs failure
  const won = completedReferrals.filter((r) => r.status === 'closed_won');
  const lost = completedReferrals.filter((r) => r.status === 'closed_lost' || r.status === 'declined');

  const findings: RecalibrationFinding[] = [];
  const suggestedChanges: Record<string, { current: number; suggested: number; reason: string }> = {};

  // Get scores for won vs lost referrals
  const wonScores = won
    .map((r) => input.readinessScores.find((s) => s.accountId === r.accountId))
    .filter(Boolean) as ReadinessScore[];
  const lostScores = lost
    .map((r) => input.readinessScores.find((s) => s.accountId === r.accountId))
    .filter(Boolean) as ReadinessScore[];

  if (wonScores.length === 0 || lostScores.length === 0) {
    return {
      status: 'recalibrated',
      sampleSize: completedReferrals.length,
      findings: [{ dimension: 'overall', observation: 'Insufficient scored data for comparison', severity: 'low' }],
      suggestedWeightChanges: {},
    };
  }

  // Compare dimension averages between won and lost
  const dimensions = [
    { key: 'valueDelivered', field: 'valueDeliveredScore' as const, weight: 25 },
    { key: 'relationshipStrength', field: 'relationshipStrengthScore' as const, weight: 20 },
    { key: 'recencyOfWin', field: 'recencyOfWinScore' as const, weight: 20 },
    { key: 'networkValue', field: 'networkValueScore' as const, weight: 20 },
    { key: 'askHistory', field: 'askHistoryScore' as const, weight: 15 },
  ];

  for (const dim of dimensions) {
    const wonAvg = average(wonScores.map((s) => s[dim.field]));
    const lostAvg = average(lostScores.map((s) => s[dim.field]));
    const diff = wonAvg - lostAvg;
    const maxScore = dim.weight;
    const diffPct = maxScore > 0 ? diff / maxScore : 0;

    // If a dimension shows minimal difference between won/lost, it may be overweighted
    if (Math.abs(diffPct) < 0.05) {
      findings.push({
        dimension: dim.key,
        observation: `Minimal difference between won (${wonAvg.toFixed(1)}) and lost (${lostAvg.toFixed(1)}) — may be overweighted`,
        severity: 'medium',
      });
      suggestedChanges[dim.key] = {
        current: dim.weight,
        suggested: Math.max(dim.weight - 3, 5),
        reason: `Low predictive power: won avg ${wonAvg.toFixed(1)} vs lost avg ${lostAvg.toFixed(1)}`,
      };
    }

    // If a dimension shows large difference, it may be underweighted
    if (diffPct > 0.3) {
      findings.push({
        dimension: dim.key,
        observation: `Strong predictor: won avg ${wonAvg.toFixed(1)} vs lost avg ${lostAvg.toFixed(1)} — may be underweighted`,
        severity: 'high',
      });
      suggestedChanges[dim.key] = {
        current: dim.weight,
        suggested: Math.min(dim.weight + 3, 30),
        reason: `High predictive power: won avg ${wonAvg.toFixed(1)} vs lost avg ${lostAvg.toFixed(1)}`,
      };
    }
  }

  return {
    status: 'recalibrated',
    sampleSize: completedReferrals.length,
    findings,
    suggestedWeightChanges: suggestedChanges,
  };
}

// ─── Helpers ───

function getLatestScoresPerAccount(scores: ReadinessScore[]): ReadinessScore[] {
  const latest = new Map<string, ReadinessScore>();
  for (const score of scores) {
    const existing = latest.get(score.accountId);
    if (!existing || (score.scoredAt && existing.scoredAt && score.scoredAt > existing.scoredAt)) {
      latest.set(score.accountId, score);
    }
  }
  return Array.from(latest.values());
}

function buildLeaderboard(
  champions: Champion[],
  superReferrers: SuperReferrer[],
  referrals: Referral[]
): MonthlyHealthReport['leaderboard'] {
  return superReferrers
    .sort((a, b) => b.superScore - a.superScore)
    .slice(0, 10)
    .map((sr) => {
      const champ = champions.find((c) => c.id === sr.championId);
      const champReferrals = referrals.filter((r) => r.championId === sr.championId);
      const closed = champReferrals.filter((r) => r.status === 'closed_won');
      const revenue = closed.reduce((s, r) => s + (r.closedAmount ? parseFloat(r.closedAmount) : 0), 0);
      return {
        championName: champ?.name ?? 'Unknown',
        company: '',
        tier: sr.tier,
        intros: sr.totalIntros ?? 0,
        closed: closed.length,
        revenue,
      };
    });
}

function generateActionItems(input: MonthlyHealthInput): string[] {
  const actions: string[] = [];
  const { referrals, readinessScores } = input;

  const latestScores = getLatestScoresPerAccount(readinessScores);
  const hotAccounts = latestScores.filter((s) => s.tier === 'hot');
  const unreferredHot = hotAccounts.filter((s) =>
    !referrals.some((r) => r.accountId === s.accountId && r.status !== 'declined' && r.status !== 'expired')
  );

  if (unreferredHot.length > 0) {
    actions.push(`${unreferredHot.length} Hot accounts have no active referrals — prioritize ask composition`);
  }

  const stale = referrals.filter((r) => r.status === 'ask_sent' && r.followUpCount === 0);
  if (stale.length > 0) {
    actions.push(`${stale.length} asks sent with no follow-up — schedule follow-ups`);
  }

  const pendingIntros = referrals.filter((r) => r.status === 'intro_pending');
  if (pendingIntros.length > 0) {
    actions.push(`${pendingIntros.length} intros pending — confirm champion sent the intro`);
  }

  if (actions.length === 0) {
    actions.push('Pipeline is healthy — maintain current cadence');
  }

  return actions;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
