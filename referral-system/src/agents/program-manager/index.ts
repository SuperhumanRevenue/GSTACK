import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { createReferral, updateReferral } from './ledger.js';
import { accounts, champions, referrals, superReferrers, readinessScores, referralTargets } from '../../db/schema.js';
import { formatCurrency, toMarkdownTable } from '../../shared/formatting.js';
import { scoreSuperReferrer } from './super-referrer.js';
import { scoreTarget, type TargetScoringInput } from './target-scorer.js';
import { generateMonthlyHealth, generateLeadershipSummary, recalibrateModel } from './analytics.js';

export function registerProgramManagerTools(server: McpServer, deps: ServerDeps) {
  const { db, config } = deps;

  // ─── Tool 1: Create referral ───
  server.tool(
    'referral_pm_create_referral',
    'Create a new referral record in the ledger',
    {
      account_id: z.string().describe('Account UUID'),
      champion_id: z.string().describe('Champion UUID'),
      target_company: z.string().describe('Target company name'),
      target_contact: z.string().describe('Target contact name'),
      target_title: z.string().describe('Target contact title'),
      ask_type: z.enum(['live', 'async', 'soft_seed']).describe('Type of ask'),
      trigger_event: z.string().describe('Trigger event that prompted the ask'),
      readiness_score_at_ask: z.number().describe('Readiness score when ask was made'),
      owning_ae: z.string().describe('Name of the owning AE'),
      connection_map_id: z.string().optional(),
      ask_content: z.string().optional(),
    },
    async (input) => {
      try {
        const referral = await createReferral(db, {
          accountId: input.account_id,
          championId: input.champion_id,
          targetCompany: input.target_company,
          targetContact: input.target_contact,
          targetTitle: input.target_title,
          askType: input.ask_type,
          triggerEvent: input.trigger_event,
          readinessScoreAtAsk: input.readiness_score_at_ask,
          owningAe: input.owning_ae,
          connectionMapId: input.connection_map_id,
          askContent: input.ask_content,
          askDate: new Date(),
        });

        // Fetch champion and account names for output
        const [champion] = await db.select().from(champions).where(eq(champions.id, input.champion_id)).limit(1);
        const [account] = await db.select().from(accounts).where(eq(accounts.id, input.account_id)).limit(1);

        const text = [
          `# Referral Created`,
          '',
          `**ID:** ${referral.id}`,
          `**Champion:** ${champion?.name ?? input.champion_id} (${account?.companyName ?? input.account_id})`,
          `**Target:** ${input.target_contact} (${input.target_title}) at ${input.target_company}`,
          `**Ask Type:** ${input.ask_type}`,
          `**Trigger:** ${input.trigger_event}`,
          `**Readiness Score:** ${input.readiness_score_at_ask}/100`,
          `**Owning AE:** ${input.owning_ae}`,
          `**Status:** ask_pending`,
          '',
          `*Referral is pending — champion has not been asked yet. Use \`referral_ask_compose\` to generate the ask content.*`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error creating referral: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tool 2: Update referral ───
  server.tool(
    'referral_pm_update_referral',
    'Update a referral\'s status as it progresses through the pipeline',
    {
      referral_id: z.string().describe('Referral UUID'),
      response: z.enum(['yes', 'maybe', 'no', 'no_response', 'pending']).optional(),
      status: z.enum([
        'ask_pending', 'ask_sent', 'intro_pending', 'intro_sent',
        'meeting_booked', 'opportunity_created', 'closed_won', 'closed_lost',
        'deferred', 'expired', 'declined',
      ]).optional(),
      intro_date: z.string().optional().describe('ISO date'),
      intro_content: z.string().optional(),
      meeting_date: z.string().optional().describe('ISO date'),
      crm_opportunity_id: z.string().optional(),
      opportunity_amount: z.number().optional(),
      closed_date: z.string().optional().describe('ISO date'),
      closed_amount: z.number().optional(),
      champion_reward: z.string().optional(),
      follow_up_count: z.number().optional(),
      notes: z.string().optional(),
    },
    async (input) => {
      try {
        const { referral, statusChange } = await updateReferral(
          db,
          input.referral_id,
          {
            response: input.response,
            responseDate: input.response ? new Date() : undefined,
            status: input.status,
            introDate: input.intro_date ? new Date(input.intro_date) : undefined,
            introContent: input.intro_content,
            meetingDate: input.meeting_date ? new Date(input.meeting_date) : undefined,
            crmOpportunityId: input.crm_opportunity_id,
            opportunityAmount: input.opportunity_amount?.toString(),
            closedDate: input.closed_date ? new Date(input.closed_date) : undefined,
            closedAmount: input.closed_amount?.toString(),
            championReward: input.champion_reward,
            followUpCount: input.follow_up_count,
            notes: input.notes,
          },
          config.maxFollowUps
        );

        const lines = [
          `# Referral Updated`,
          '',
          `**ID:** ${referral.id}`,
          `**Target:** ${referral.targetContact} at ${referral.targetCompany}`,
          `**Status:** ${referral.status}`,
        ];

        if (statusChange) {
          lines.push(`**Transition:** ${statusChange.from} → ${statusChange.to}`);
        }

        if (referral.response && referral.response !== 'pending') {
          lines.push(`**Response:** ${referral.response}`);
        }

        if (referral.closedAmount) {
          lines.push(`**Closed Amount:** ${formatCurrency(parseFloat(referral.closedAmount))}`);
        }

        if (referral.timeToCloseDays) {
          lines.push(`**Time to Close:** ${referral.timeToCloseDays} days`);
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error updating referral: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tool 3: Score super-referrers ───
  server.tool(
    'referral_pm_score_super_referrers',
    'Calculate super-referrer scores and tiers for all champions with referral history',
    {},
    async () => {
      try {
        const allChampions = await db.select().from(champions);
        const allReferrals = await db.select().from(referrals);

        const results: { name: string; score: number; tier: string; total: number; closed: number; revenue: string }[] = [];

        for (const champ of allChampions) {
          const champReferrals = allReferrals.filter((r) => r.championId === champ.id);
          if (champReferrals.length === 0) continue;

          const scoring = scoreSuperReferrer({ champion: champ, referrals: champReferrals });

          // Upsert super-referrer record
          const existing = await db.select().from(superReferrers).where(eq(superReferrers.championId, champ.id)).limit(1);
          const data = {
            championId: champ.id,
            superScore: scoring.superScore,
            tier: scoring.tier,
            volumeScore: scoring.volumeScore,
            qualityScore: scoring.qualityScore,
            valueScore: scoring.valueScore,
            networkScore: scoring.networkScore,
            velocityScore: scoring.velocityScore,
            totalReferrals: scoring.stats.totalReferrals,
            totalIntros: scoring.stats.totalIntros,
            totalMeetings: scoring.stats.totalMeetings,
            totalClosed: scoring.stats.totalClosed,
            totalRevenue: scoring.stats.totalRevenue.toString(),
            avgDealSize: scoring.stats.avgDealSize.toString(),
            avgTimeToClose: Math.round(scoring.stats.avgTimeToClose),
            responseRate: scoring.stats.responseRate.toFixed(4),
            recalculatedAt: new Date(),
          };

          if (existing.length > 0) {
            await db.update(superReferrers).set(data).where(eq(superReferrers.championId, champ.id));
          } else {
            await db.insert(superReferrers).values(data);
          }

          results.push({
            name: champ.name,
            score: scoring.superScore,
            tier: scoring.tier.toUpperCase(),
            total: scoring.stats.totalReferrals,
            closed: scoring.stats.totalClosed,
            revenue: formatCurrency(scoring.stats.totalRevenue),
          });
        }

        results.sort((a, b) => b.score - a.score);

        const lines = [
          `# Super-Referrer Scores`,
          '',
          `**Champions Scored:** ${results.length}`,
          '',
          toMarkdownTable(
            ['Champion', 'Score', 'Tier', 'Referrals', 'Closed', 'Revenue'],
            results.map((r) => [r.name, String(r.score), r.tier, String(r.total), String(r.closed), r.revenue])
          ),
        ];

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error scoring super-referrers: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 4: Score target ───
  server.tool(
    'referral_pm_score_target',
    'Score a referral target on 5 dimensions to determine priority',
    {
      target_company: z.string(),
      target_contact: z.string(),
      target_title: z.string(),
      champion_id: z.string(),
      icp_fit: z.number().min(0).max(10),
      pain_alignment: z.number().min(0).max(10),
      champion_credibility: z.number().min(0).max(10),
      timing: z.number().min(0).max(10),
      deal_size: z.number().min(0).max(10),
    },
    async (input) => {
      try {
        const scoring = scoreTarget({
          icpFit: input.icp_fit,
          painAlignment: input.pain_alignment,
          championCredibility: input.champion_credibility,
          timing: input.timing,
          dealSize: input.deal_size,
        });

        // Persist
        await db.insert(referralTargets).values({
          targetCompany: input.target_company,
          targetContact: input.target_contact,
          targetTitle: input.target_title,
          referredByChampionId: input.champion_id,
          icpFitScore: scoring.icpFitScore,
          painAlignmentScore: scoring.painAlignmentScore,
          championCredibilityScore: scoring.championCredibilityScore,
          timingScore: scoring.timingScore,
          dealSizeScore: scoring.dealSizeScore,
          totalTargetScore: scoring.totalScore,
          priority: scoring.priority,
        });

        const lines = [
          `# Target Scored: ${input.target_contact} at ${input.target_company}`,
          '',
          `**Total Score:** ${scoring.totalScore}/100`,
          `**Priority:** ${scoring.priority.toUpperCase()}`,
          '',
          toMarkdownTable(
            ['Dimension', 'Raw', 'Weighted'],
            [
              ['ICP Fit', `${input.icp_fit}/10`, `${scoring.icpFitScore}/30`],
              ['Pain Alignment', `${input.pain_alignment}/10`, `${scoring.painAlignmentScore}/25`],
              ['Champion Credibility', `${input.champion_credibility}/10`, `${scoring.championCredibilityScore}/20`],
              ['Timing', `${input.timing}/10`, `${scoring.timingScore}/15`],
              ['Deal Size', `${input.deal_size}/10`, `${scoring.dealSizeScore}/10`],
            ]
          ),
        ];

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error scoring target: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 5: Generate report ───
  server.tool(
    'referral_pm_generate_report',
    'Generate a monthly health report or leadership summary',
    {
      report_type: z.enum(['monthly_health', 'leadership_summary']),
      month: z.string().optional().describe('Month name for monthly report'),
      year: z.number().optional(),
      outbound_cac: z.number().describe('Current outbound CAC for comparison'),
      program_cost: z.number().describe('Total program cost for period'),
    },
    async (input) => {
      try {
        const allAccounts = await db.select().from(accounts);
        const allChampions = await db.select().from(champions);
        const allReferrals = await db.select().from(referrals);
        const allScores = await db.select().from(readinessScores);
        const allSuperReferrers = await db.select().from(superReferrers);

        if (input.report_type === 'monthly_health') {
          const report = generateMonthlyHealth({
            month: input.month ?? new Date().toLocaleString('en-US', { month: 'long' }),
            year: input.year ?? new Date().getFullYear(),
            accounts: allAccounts,
            readinessScores: allScores,
            referrals: allReferrals,
            champions: allChampions,
            superReferrers: allSuperReferrers,
            outboundCac: input.outbound_cac,
            programCost: input.program_cost,
          });

          const lines = [
            `# Monthly Health Report — ${report.period.month} ${report.period.year}`,
            '',
            '## Portfolio Health',
            `- **Total Accounts:** ${report.portfolioHealth.totalAccounts}`,
            `- **Hot:** ${report.portfolioHealth.hot.count} (${Math.round(report.portfolioHealth.hot.pct * 100)}%)`,
            `- **Warm:** ${report.portfolioHealth.warm.count} (${Math.round(report.portfolioHealth.warm.pct * 100)}%)`,
            `- **Not Yet:** ${report.portfolioHealth.notYet.count} (${Math.round(report.portfolioHealth.notYet.pct * 100)}%)`,
            '',
            '## Activity',
            `- **Asks Made:** ${report.activity.asksMade}`,
            `- **Intros:** ${report.activity.introsCompleted.count} (${Math.round(report.activity.introsCompleted.conversionFromAsk * 100)}% from asks)`,
            `- **Meetings:** ${report.activity.meetingsBooked.count} (${Math.round(report.activity.meetingsBooked.conversionFromIntro * 100)}% from intros)`,
            `- **Pipeline Value:** ${formatCurrency(report.activity.pipelineValue)}`,
            '',
            '## Lifetime',
            `- **Closed Won:** ${formatCurrency(report.lifetime.closedWon)}`,
            `- **Referral CAC:** ${formatCurrency(report.lifetime.referralCac)} vs Outbound: ${formatCurrency(report.lifetime.outboundCac)}`,
            `- **Avg Time to Close:** ${report.lifetime.avgTimeToCloseReferral} days`,
            '',
            '## Actions Next Month',
            ...report.actionsNextMonth.map((a) => `- ${a}`),
          ];

          return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
        }

        // Leadership summary
        const summary = generateLeadershipSummary({
          referrals: allReferrals,
          champions: allChampions,
          superReferrers: allSuperReferrers,
          outboundCac: input.outbound_cac,
          programCost: input.program_cost,
          quarterLabel: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`,
        });

        const lines = [
          `# Leadership Summary`,
          '',
          '## Headline Metrics',
          `- **Pipeline Generated:** ${formatCurrency(summary.headlineMetrics.referralPipelineGenerated)}`,
          `- **Closed Won:** ${formatCurrency(summary.headlineMetrics.referralClosedWon)}`,
          `- **CAC Savings:** ${Math.round(summary.headlineMetrics.referralCacVsOutbound.savingsPct * 100)}%`,
          '',
          '## Top Wins',
          ...summary.topWins.map((w) => `- ${w.company}: ${formatCurrency(w.revenue)} (via ${w.champion}, ${w.timeToClose} days)`),
          '',
          '## Program Growth',
          `- **Members:** ${summary.programGrowth.members} (${summary.programGrowth.platinumCount} Platinum)`,
          '',
          '## Investment vs Return',
          `- **Program Cost:** ${formatCurrency(summary.investmentVsReturn.programCost)}`,
          `- **Revenue Generated:** ${formatCurrency(summary.investmentVsReturn.revenueGenerated)}`,
          `- **ROI:** ${summary.investmentVsReturn.roiMultiple.toFixed(1)}x`,
        ];

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error generating report: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 6: Get leaderboard ───
  server.tool(
    'referral_pm_get_leaderboard',
    'Get the super-referrer leaderboard ranked by score',
    {
      limit: z.number().optional().default(10),
      tier: z.enum(['platinum', 'gold', 'silver', 'bronze']).optional(),
    },
    async (input) => {
      try {
        let query = db.select().from(superReferrers);
        if (input.tier) {
          query = query.where(eq(superReferrers.tier, input.tier)) as typeof query;
        }
        const results = await query;

        const sorted = results
          .sort((a, b) => b.superScore - a.superScore)
          .slice(0, input.limit);

        const champIds = sorted.map((s) => s.championId);
        const champs = await db.select().from(champions);

        const rows = sorted.map((sr) => {
          const champ = champs.find((c) => c.id === sr.championId);
          return [
            champ?.name ?? 'Unknown',
            String(sr.superScore),
            sr.tier.toUpperCase(),
            String(sr.totalReferrals ?? 0),
            String(sr.totalClosed ?? 0),
            formatCurrency(parseFloat(sr.totalRevenue ?? '0')),
          ];
        });

        const text = [
          `# Super-Referrer Leaderboard${input.tier ? ` (${input.tier.toUpperCase()})` : ''}`,
          '',
          toMarkdownTable(
            ['Champion', 'Score', 'Tier', 'Referrals', 'Closed', 'Revenue'],
            rows
          ),
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error getting leaderboard: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 7: Get company scoreboard ───
  server.tool(
    'referral_pm_get_company_scoreboard',
    'Get referral performance aggregated by account',
    {},
    async () => {
      try {
        const allAccounts = await db.select().from(accounts);
        const allReferrals = await db.select().from(referrals);

        const accountStats = allAccounts.map((acct) => {
          const acctReferrals = allReferrals.filter((r) => r.accountId === acct.id);
          const closed = acctReferrals.filter((r) => r.status === 'closed_won');
          const revenue = closed.reduce((s, r) => s + (r.closedAmount ? parseFloat(r.closedAmount) : 0), 0);
          return {
            company: acct.companyName,
            total: acctReferrals.length,
            closed: closed.length,
            revenue,
          };
        }).filter((a) => a.total > 0);

        accountStats.sort((a, b) => b.revenue - a.revenue);

        const text = [
          '# Company Referral Scoreboard',
          '',
          toMarkdownTable(
            ['Company', 'Referrals', 'Closed', 'Revenue'],
            accountStats.map((a) => [a.company, String(a.total), String(a.closed), formatCurrency(a.revenue)])
          ),
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error getting scoreboard: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 8: Recalibrate model ───
  server.tool(
    'referral_pm_recalibrate_model',
    'Analyze completed referrals to identify scoring model adjustments. Requires 50+ completed referrals.',
    {},
    async () => {
      try {
        const allReferrals = await db.select().from(referrals);
        const allScores = await db.select().from(readinessScores);

        const result = recalibrateModel({
          referrals: allReferrals,
          readinessScores: allScores,
          minSampleSize: 50,
        });

        if (result.status === 'insufficient_data') {
          return {
            content: [{
              type: 'text' as const,
              text: `# Recalibration: Insufficient Data\n\n**Completed referrals:** ${result.sampleSize}/50 minimum\n\nContinue building referral history before recalibrating. Current weights are preserved.`,
            }],
          };
        }

        const lines = [
          '# Scoring Model Recalibration',
          '',
          `**Sample Size:** ${result.sampleSize} completed referrals`,
          '',
        ];

        if (result.findings.length > 0) {
          lines.push('## Findings', '');
          for (const f of result.findings) {
            lines.push(`- **[${f.severity.toUpperCase()}] ${f.dimension}:** ${f.observation}`);
          }
          lines.push('');
        }

        if (Object.keys(result.suggestedWeightChanges).length > 0) {
          lines.push('## Suggested Weight Changes', '');
          lines.push(toMarkdownTable(
            ['Dimension', 'Current', 'Suggested', 'Reason'],
            Object.entries(result.suggestedWeightChanges).map(([dim, change]) => [
              dim,
              String(change.current),
              String(change.suggested),
              change.reason,
            ])
          ));
        } else {
          lines.push('*No weight changes suggested — model is performing well.*');
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error recalibrating: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}
