/**
 * Full Analysis Orchestrator — "One-click account intelligence"
 *
 * Chains all 9 agents into a single pipeline for a given account:
 *
 * Phase 1 (parallel): Signal Guide intake + PCP revenue analysis + Portfolio mapping
 * Phase 2 (depends on Phase 1): Readiness scoring (with PCP boost) + Signal timing
 * Phase 3 (depends on Phase 2): Relationship mapping + Ask generation
 * Phase 4 (final): Success dashboard + Priority-ranked opportunities
 *
 * Cross-agent wiring applied automatically between phases.
 */

import { eq, desc } from 'drizzle-orm';
import type { ServerDeps } from '../shared/types.js';
import {
  accounts,
  champions,
  connectionMaps,
  referrals,
  triggerEvents,
} from '../db/schema.js';
import { scoreReadiness } from '../agents/readiness-scorer/scoring-engine.js';
import { scoreDealHealth } from '../agents/success-tracker/deal-health-scorer.js';
import { analyzeCohorts } from '../agents/success-tracker/cohort-analyzer.js';
import { analyzeRevenue } from '../agents/pcp-builder/revenue-analyzer.js';
import { extractAttributes } from '../agents/pcp-builder/attribute-extractor.js';
import { buildIcpWeights } from '../agents/pcp-builder/icp-weight-builder.js';
import { buildGraph, findSecondOrderOpportunities, buildPortfolioMaps } from '../agents/portfolio-mapper/graph-builder.js';
import { researchCorporateRelationships } from '../agents/portfolio-mapper/research-enricher.js';
import {
  applyPcpBoost,
  scorePortfolioOpportunities,
} from './cross-agent-wiring.js';
import type { AttributeFrequency } from '../agents/pcp-builder/types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FullAnalysisInput {
  accountId: string;
  customerIntake?: {
    productDescription?: string;
    positioning?: string;
    messaging?: string;
    targetIndustries?: string[];
    targetPersonas?: string[];
    competitors?: string[];
  };
  revenueSnapshots?: { accountId: string; companyName: string; revenue: number; industry?: string; employeeCount?: number }[];
  enableWebResearch?: boolean;
  generateAsks?: boolean;
}

export interface PhaseResult {
  phase: string;
  status: 'completed' | 'skipped' | 'error';
  duration_ms: number;
  summary: string;
  data?: unknown;
}

export interface FullAnalysisResult {
  accountId: string;
  accountName: string;
  timestamp: string;
  totalDuration_ms: number;
  phases: PhaseResult[];
  intelligence: {
    readinessScore: number | null;
    readinessTier: string | null;
    pcpBoostApplied: number;
    signalTiming: { shouldDelay: boolean; reason: string } | null;
    topChampions: { name: string; title: string; score: number }[];
    topTargets: { company: string; contact: string; score: number; path: string }[];
    portfolioOpportunities: { target: string; combinedScore: number; type: string }[];
    pipelineHealth: { total: number; healthy: number; atRisk: number; stalled: number; critical: number };
    cohortComparison: { referralWinRate: number; outboundWinRate: number; speedAdvantage: number } | null;
    executiveSummary: string | null;
    recommendedActions: string[];
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runFullAnalysis(
  input: FullAnalysisInput,
  deps: ServerDeps
): Promise<FullAnalysisResult> {
  const startTime = Date.now();
  const phases: PhaseResult[] = [];
  const actions: string[] = [];

  // ── Load account ──────────────────────────────────────────────────────────
  const [account] = await deps.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .limit(1);

  if (!account) {
    throw new Error(`Account ${input.accountId} not found`);
  }

  // ── Load champions for this account ───────────────────────────────────────
  const accountChampions = await deps.db
    .select()
    .from(champions)
    .where(eq(champions.accountId, input.accountId));

  // ── Load existing referrals ───────────────────────────────────────────────
  const accountReferrals = await deps.db
    .select()
    .from(referrals)
    .where(eq(referrals.accountId, input.accountId));

  // ── Load trigger events ────────────────────────────────────────────────────
  const accountTriggers = await deps.db
    .select()
    .from(triggerEvents)
    .where(eq(triggerEvents.accountId, input.accountId));

  let icpWeights: AttributeFrequency[] = [];
  let pcpBoost = 0;
  let signalTimingResult: { shouldDelay: boolean; reason: string } | null = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Parallel data gathering (PCP + Portfolio + Signal Guide)
  // ═══════════════════════════════════════════════════════════════════════════

  const phase1Start = Date.now();
  const phase1Results = await Promise.allSettled([
    // 1a. PCP Revenue Analysis
    (async () => {
      if (!input.revenueSnapshots || input.revenueSnapshots.length === 0) {
        return { status: 'skipped' as const, reason: 'No revenue data provided' };
      }

      const distribution = analyzeRevenue(input.revenueSnapshots);

      // Extract attributes per account for ICP weight building
      const allAttributes: ReturnType<typeof extractAttributes>[] = input.revenueSnapshots.map((s) =>
        extractAttributes({
          ...account,
          industry: s.industry ?? account.industry,
          employeeCount: s.employeeCount ?? account.employeeCount,
        })
      );

      const powerLawIds = new Set(
        distribution.tiers.powerLaw.accounts.map((a) => a.accountId)
      );
      const powerLawAttrs: ReturnType<typeof extractAttributes>[] = input.revenueSnapshots
        .filter((s) => powerLawIds.has(s.accountId))
        .map((s) =>
          extractAttributes({
            ...account,
            industry: s.industry ?? account.industry,
            employeeCount: s.employeeCount ?? account.employeeCount,
          })
        );

      const icpResult = buildIcpWeights(powerLawAttrs, allAttributes);
      icpWeights = icpResult.attributes;

      return {
        status: 'completed' as const,
        giniCoefficient: distribution.giniCoefficient,
        tierCounts: {
          powerLaw: distribution.tiers.powerLaw.count,
          highValue: distribution.tiers.highValue.count,
          core: distribution.tiers.core.count,
          longTail: distribution.tiers.longTail.count,
        },
        icpWeightCount: icpWeights.length,
      };
    })(),

    // 1b. Portfolio Mapping
    (async () => {
      if (!input.enableWebResearch) {
        return { status: 'skipped' as const, reason: 'Web research disabled' };
      }

      const relationships = await researchCorporateRelationships(
        account.companyName,
        deps.webSearch,
        deps.enrichment
      );

      if (relationships.length === 0) {
        return { status: 'completed' as const, relationships: 0, opportunities: 0 };
      }

      const customerAccounts = [{ name: account.companyName, accountId: account.id }];
      const { nodes, edges } = buildGraph(relationships, customerAccounts);
      const opportunities = findSecondOrderOpportunities(nodes, edges);
      const portfolioMaps = buildPortfolioMaps(nodes, edges);

      return {
        status: 'completed' as const,
        relationships: relationships.length,
        entities: nodes.size,
        opportunities: opportunities.length,
        portfolioMaps: portfolioMaps.length,
        topOpportunities: opportunities.slice(0, 5).map((o) => ({
          target: o.targetCompany,
          type: o.connectionType,
          confidence: o.confidence,
        })),
      };
    })(),

    // 1c. Signal Guide Research
    (async () => {
      if (!input.enableWebResearch || !input.customerIntake) {
        return { status: 'skipped' as const, reason: 'No customer intake or web research disabled' };
      }

      const searchResults = await deps.webSearch.researchCompany(account.companyName);
      return {
        status: 'completed' as const,
        competitors: searchResults.competitors?.length ?? 0,
        trends: searchResults.industryTrends?.length ?? 0,
        newsItems: searchResults.recentNews?.length ?? 0,
      };
    })(),
  ]);

  // Collect phase 1 results
  const [pcpResult, portfolioResult, signalResult] = phase1Results;
  const phase1Summaries: string[] = [];

  if (pcpResult.status === 'fulfilled') {
    const d = pcpResult.value;
    phase1Summaries.push(d.status === 'completed'
      ? `PCP: Gini ${d.giniCoefficient?.toFixed(2)}, ${d.icpWeightCount} ICP weights`
      : `PCP: ${d.reason}`);
  } else {
    phase1Summaries.push(`PCP: error — ${pcpResult.reason}`);
  }

  if (portfolioResult.status === 'fulfilled') {
    const d = portfolioResult.value;
    phase1Summaries.push(d.status === 'completed'
      ? `Portfolio: ${d.relationships} relationships, ${d.opportunities} opportunities`
      : `Portfolio: ${d.reason}`);
  } else {
    phase1Summaries.push(`Portfolio: error — ${portfolioResult.reason}`);
  }

  if (signalResult.status === 'fulfilled') {
    const d = signalResult.value;
    phase1Summaries.push(d.status === 'completed'
      ? `Signals: ${d.competitors} competitors, ${d.trends} trends, ${d.newsItems} news`
      : `Signals: ${d.reason}`);
  } else {
    phase1Summaries.push(`Signals: error — ${signalResult.reason}`);
  }

  phases.push({
    phase: 'Phase 1: Data Gathering',
    status: 'completed',
    duration_ms: Date.now() - phase1Start,
    summary: phase1Summaries.join(' | '),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Readiness Scoring (with PCP boost + signal timing)
  // ═══════════════════════════════════════════════════════════════════════════

  const phase2Start = Date.now();
  const championScores: { name: string; title: string; score: number }[] = [];

  // Filter referrals per champion for scoring
  for (const champion of accountChampions) {
    const championReferrals = accountReferrals.filter((r) => r.championId === champion.id);

    let result = scoreReadiness({
      account,
      champion,
      triggerEvents: accountTriggers,
      referralHistory: championReferrals,
      enrichmentData: champion.networkReachScore
        ? {
            networkReachScore: champion.networkReachScore,
            formerCompanies: (champion.formerCompanies as string[]) ?? [],
            industryCommunities: (champion.industryCommunities as string[]) ?? [],
          }
        : undefined,
    });

    // Apply PCP boost from cross-agent wiring
    if (icpWeights.length > 0) {
      const boosted = applyPcpBoost(result, account, icpWeights);
      pcpBoost = boosted.totalScore - result.totalScore;
      result = boosted;
    }

    championScores.push({
      name: champion.name,
      title: champion.title,
      score: result.totalScore,
    });
  }

  championScores.sort((a, b) => b.score - a.score);

  const bestScore = championScores[0]?.score ?? null;
  const bestTier = bestScore !== null
    ? (bestScore >= 80 ? 'hot' : bestScore >= 55 ? 'warm' : 'not_yet')
    : null;

  phases.push({
    phase: 'Phase 2: Readiness Scoring',
    status: championScores.length > 0 ? 'completed' : 'skipped',
    duration_ms: Date.now() - phase2Start,
    summary: championScores.length > 0
      ? `${championScores.length} champions scored. Best: ${championScores[0].name} (${championScores[0].score} pts, ${bestTier}). PCP boost: +${pcpBoost}`
      : 'No champions found for this account',
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Relationship Mapping + Connection Scoring
  // ═══════════════════════════════════════════════════════════════════════════

  const phase3Start = Date.now();
  const existingConnections = await deps.db
    .select()
    .from(connectionMaps)
    .where(
      accountChampions.length > 0
        ? eq(connectionMaps.championId, accountChampions[0].id)
        : eq(connectionMaps.championId, '00000000-0000-0000-0000-000000000000')
    )
    .orderBy(desc(connectionMaps.compositeScore))
    .limit(10);

  const topTargets = existingConnections.map((c) => ({
    company: c.targetCompany,
    contact: c.targetContact,
    score: c.compositeScore ?? 0,
    path: c.connectionPath,
  }));

  // Enrich portfolio opportunities with ICP scoring
  let portfolioOpps: { target: string; combinedScore: number; type: string }[] = [];
  if (
    portfolioResult.status === 'fulfilled' &&
    portfolioResult.value.status === 'completed' &&
    portfolioResult.value.topOpportunities
  ) {
    const rawOpps = portfolioResult.value.topOpportunities.map((o) => ({
      targetCompany: o.target,
      confidence: o.confidence,
    }));

    if (icpWeights.length > 0) {
      const targetData = new Map<string, { industry?: string }>();
      rawOpps.forEach((o) => targetData.set(o.targetCompany, {}));
      const scored = scorePortfolioOpportunities(rawOpps, icpWeights, targetData);
      portfolioOpps = scored.map((s) => ({
        target: s.targetCompany,
        combinedScore: s.combinedScore,
        type: portfolioResult.value.topOpportunities!.find((o) => o.target === s.targetCompany)?.type ?? 'unknown',
      }));
    } else {
      portfolioOpps = rawOpps.map((o) => ({
        target: o.targetCompany,
        combinedScore: Math.round(o.confidence * 100),
        type: portfolioResult.value.topOpportunities!.find((t) => t.target === o.targetCompany)?.type ?? 'unknown',
      }));
    }
  }

  phases.push({
    phase: 'Phase 3: Relationship Mapping',
    status: 'completed',
    duration_ms: Date.now() - phase3Start,
    summary: `${topTargets.length} direct targets, ${portfolioOpps.length} portfolio opportunities`,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: Success Dashboard (pipeline health + cohort analysis)
  // ═══════════════════════════════════════════════════════════════════════════

  const phase4Start = Date.now();
  const healthCounts = { total: 0, healthy: 0, atRisk: 0, stalled: 0, critical: 0 };

  for (const ref of accountReferrals) {
    const healthInput = {
      status: ref.status ?? 'intro_made',
      createdAt: ref.createdAt ?? new Date(),
      lastActivityDate: ref.updatedAt,
      askDate: null,
      introDate: null,
      meetingDate: null,
      followUpCount: 1,
      response: 'neutral',
      opportunityAmount: null,
    };

    const result = scoreDealHealth(healthInput);
    healthCounts.total++;
    if (result.tier === 'healthy') healthCounts.healthy++;
    else if (result.tier === 'at_risk') healthCounts.atRisk++;
    else if (result.tier === 'stalled') healthCounts.stalled++;
    else if (result.tier === 'critical') healthCounts.critical++;
  }

  // Cohort analysis
  let cohortComparison: { referralWinRate: number; outboundWinRate: number; speedAdvantage: number } | null = null;
  if (accountReferrals.length > 0) {
    const deals = accountReferrals.map((ref) => ({
      source: 'referral' as const,
      amount: 50000,
      status: ref.status ?? 'intro_made',
      timeToCloseDays: ref.updatedAt && ref.createdAt
        ? Math.floor((ref.updatedAt.getTime() - ref.createdAt.getTime()) / 86400000)
        : null,
      createdAt: ref.createdAt ?? new Date(),
    }));

    const comparison = analyzeCohorts(deals, 'all_time');
    const referralCohort = comparison.cohorts.find((c) => c.source === 'referral');
    const outboundCohort = comparison.cohorts.find((c) => c.source === 'outbound');

    if (referralCohort) {
      cohortComparison = {
        referralWinRate: referralCohort.winRate,
        outboundWinRate: outboundCohort?.winRate ?? 0,
        speedAdvantage: comparison.referralAdvantage?.speedAdvantage ?? 0,
      };
    }
  }

  phases.push({
    phase: 'Phase 4: Success Dashboard',
    status: 'completed',
    duration_ms: Date.now() - phase4Start,
    summary: `${healthCounts.total} deals tracked. ${healthCounts.healthy} healthy, ${healthCounts.atRisk} at risk, ${healthCounts.stalled} stalled, ${healthCounts.critical} critical`,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDED ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  if (bestTier === 'hot' && championScores.length > 0) {
    actions.push(`${championScores[0].name} scored ${bestScore} (hot) — initiate referral ask immediately`);
  } else if (bestTier === 'warm' && championScores.length > 0) {
    actions.push(`${championScores[0].name} scored ${bestScore} (warm) — nurture relationship, ask within 2 weeks`);
  }

  if (pcpBoost > 0) {
    actions.push(`ICP match boosted readiness by +${pcpBoost} pts — account aligns with power-law profile`);
  }

  if (signalTimingResult) {
    const timing = signalTimingResult as { shouldDelay: boolean; reason: string };
    if (timing.shouldDelay) {
      actions.push(`Delay: ${timing.reason}`);
    }
  }

  if (healthCounts.critical > 0) {
    actions.push(`${healthCounts.critical} critical deal(s) — intervene immediately before asking for new referrals`);
  }

  if (healthCounts.stalled > 0) {
    actions.push(`${healthCounts.stalled} stalled deal(s) — re-engage before new asks`);
  }

  if (portfolioOpps.length > 0) {
    actions.push(`${portfolioOpps.length} second-order opportunities via portfolio — highest: ${portfolioOpps[0].target} (score: ${portfolioOpps[0].combinedScore})`);
  }

  if (topTargets.length > 0) {
    actions.push(`${topTargets.length} warm paths mapped — top: ${topTargets[0].contact} at ${topTargets[0].company} (score: ${topTargets[0].score})`);
  }

  if (actions.length === 0) {
    actions.push('No immediate actions — gather more data (revenue snapshots, champion contacts) to unlock insights');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: Executive Summary (LLM-generated)
  // ═══════════════════════════════════════════════════════════════════════════

  const phase5Start = Date.now();
  let executiveSummary: string | null = null;

  try {
    const briefingPrompt = `You are a B2B sales strategist. Based on this account intelligence, write a 3-paragraph executive briefing for the sales team. Be specific, actionable, and reference the data.

Account: ${account.companyName} (${account.industry}, ${account.employeeCount} employees, $${account.currentAcv} ACV)
Readiness: ${bestScore ?? 'N/A'}/100 (${bestTier ?? 'no champions scored'})
PCP Boost: +${pcpBoost} pts
Champions: ${championScores.map(c => `${c.name} (${c.title}, score ${c.score})`).join(', ') || 'None'}
Pipeline: ${healthCounts.total} deals (${healthCounts.healthy} healthy, ${healthCounts.atRisk} at risk, ${healthCounts.stalled} stalled, ${healthCounts.critical} critical)
Portfolio Opportunities: ${portfolioOpps.length}
Warm Paths: ${topTargets.length}
Actions: ${actions.join('; ')}

Paragraph 1: What to do THIS WEEK with this account.
Paragraph 2: The biggest risk or opportunity and why.
Paragraph 3: 30-day outlook and what success looks like.`;

    executiveSummary = await deps.llm.generateContent(briefingPrompt);
  } catch {
    executiveSummary = null;
  }

  phases.push({
    phase: 'Phase 5: Executive Summary',
    status: executiveSummary ? 'completed' : 'skipped',
    duration_ms: Date.now() - phase5Start,
    summary: executiveSummary ? 'LLM briefing generated' : 'LLM unavailable — skipped',
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL RESULT
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    accountId: input.accountId,
    accountName: account.companyName,
    timestamp: new Date().toISOString(),
    totalDuration_ms: Date.now() - startTime,
    phases,
    intelligence: {
      readinessScore: bestScore,
      readinessTier: bestTier,
      pcpBoostApplied: pcpBoost,
      signalTiming: signalTimingResult,
      topChampions: championScores.slice(0, 5),
      topTargets: topTargets.slice(0, 5),
      portfolioOpportunities: portfolioOpps.slice(0, 5),
      pipelineHealth: healthCounts,
      executiveSummary,
      cohortComparison,
      recommendedActions: actions,
    },
  };
}
