import { z } from 'zod';
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { scoreDealHealth } from './deal-health-scorer.js';
import { analyzeCohorts, type DealForCohort } from './cohort-analyzer.js';
import type { PipelineSnapshot, StalledDealAlert, CohortSource } from './types.js';
import { STALL_THRESHOLDS, DEFAULT_OUTBOUND_CAC, DEFAULT_REFERRAL_CAC } from './types.js';
import { referrals, accounts, champions } from '../../db/schema.js';

export function registerSuccessTrackerTools(server: McpServer, deps: ServerDeps) {
  const { db } = deps;

  // ─── Tool 1: Pipeline health dashboard ───
  server.tool(
    'success_pipeline_health',
    'Get a health dashboard for all active referral deals. Shows deal health scores, risk indicators, and recommended actions.',
    {
      status_filter: z.array(z.string()).optional().describe('Filter by status (e.g. ["ask_sent", "intro_sent"])'),
      min_health_score: z.number().optional().default(0).describe('Minimum health score to show'),
      max_results: z.number().optional().default(50).describe('Max deals to return'),
    },
    async ({ status_filter, min_health_score, max_results }) => {
      const now = new Date();
      let allReferrals = await db.select().from(referrals);

      // Exclude terminal states
      const terminalStatuses = ['closed_won', 'closed_lost', 'expired', 'declined'];
      allReferrals = allReferrals.filter((r) => !terminalStatuses.includes(r.status ?? ''));

      if (status_filter && status_filter.length > 0) {
        allReferrals = allReferrals.filter((r) => status_filter.includes(r.status ?? ''));
      }

      // Fetch related data
      const accountList = await db.select().from(accounts);
      const accountMap = new Map(accountList.map((a) => [a.id, a.companyName]));

      const snapshots: PipelineSnapshot[] = [];

      for (const ref of allReferrals) {
        const lastActivity = ref.meetingDate ?? ref.introDate ?? ref.responseDate ?? ref.askDate ?? ref.createdAt;
        const health = scoreDealHealth({
          status: ref.status ?? 'ask_pending',
          createdAt: ref.createdAt ?? now,
          lastActivityDate: lastActivity ?? null,
          askDate: ref.askDate ?? null,
          introDate: ref.introDate ?? null,
          meetingDate: ref.meetingDate ?? null,
          followUpCount: ref.followUpCount ?? 0,
          response: ref.response ?? 'pending',
          opportunityAmount: ref.opportunityAmount ? parseFloat(ref.opportunityAmount) : null,
        }, now);

        if (health.score < (min_health_score ?? 0)) continue;

        const daysSince = lastActivity
          ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        snapshots.push({
          referralId: ref.id,
          accountName: accountMap.get(ref.accountId) ?? 'Unknown',
          targetCompany: ref.targetCompany,
          status: ref.status ?? 'unknown',
          daysSinceLastActivity: daysSince,
          dealHealth: health.tier,
          healthScore: health.score,
          healthFactors: health.factors,
          recommendedAction: health.recommendedAction,
        });
      }

      // Sort by health score ascending (worst first)
      snapshots.sort((a, b) => a.healthScore - b.healthScore);
      const limited = snapshots.slice(0, max_results ?? 50);

      const critical = limited.filter((s) => s.dealHealth === 'critical').length;
      const stalled = limited.filter((s) => s.dealHealth === 'stalled').length;
      const atRisk = limited.filter((s) => s.dealHealth === 'at_risk').length;
      const healthy = limited.filter((s) => s.dealHealth === 'healthy').length;

      const text = [
        `# Pipeline Health Dashboard`,
        `**Active Deals:** ${snapshots.length} | **Critical:** ${critical} | **Stalled:** ${stalled} | **At Risk:** ${atRisk} | **Healthy:** ${healthy}`,
        ``,
        ...limited.map((s) => [
          `### ${s.targetCompany} (via ${s.accountName})`,
          `**Health:** ${s.healthScore}/100 — ${s.dealHealth.toUpperCase()} | **Status:** ${s.status} | **Days Inactive:** ${s.daysSinceLastActivity}`,
          s.healthFactors.map((f) => `- ${f}`).join('\n'),
          `**Action:** ${s.recommendedAction}`,
          '',
        ].join('\n')),
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ─── Tool 2: Stalled deal alerts ───
  server.tool(
    'success_stalled_alerts',
    'Identify stalled referral deals that need intervention. Returns alerts sorted by urgency.',
    {
      days_threshold_override: z.number().optional().describe('Override default stall detection days'),
    },
    async ({ days_threshold_override }) => {
      const now = new Date();
      let allReferrals = await db.select().from(referrals);

      // Only active deals
      const terminalStatuses = ['closed_won', 'closed_lost', 'expired', 'declined'];
      allReferrals = allReferrals.filter((r) => !terminalStatuses.includes(r.status ?? ''));

      const accountList = await db.select().from(accounts);
      const accountMap = new Map(accountList.map((a) => [a.id, a.companyName]));

      const alerts: StalledDealAlert[] = [];

      for (const ref of allReferrals) {
        const lastActivity = ref.meetingDate ?? ref.introDate ?? ref.responseDate ?? ref.askDate ?? ref.createdAt;
        if (!lastActivity) continue;

        const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        const threshold = days_threshold_override ?? STALL_THRESHOLDS[ref.status ?? 'ask_pending'] ?? 14;

        if (daysSince >= threshold) {
          const urgency: StalledDealAlert['urgency'] =
            daysSince >= threshold * 2 ? 'high' :
            daysSince >= threshold * 1.5 ? 'medium' : 'low';

          let stalledReason: string;
          let suggestedAction: string;

          if (ref.response === 'no_response') {
            stalledReason = `No response after ${daysSince} days`;
            suggestedAction = ref.followUpCount === 0
              ? 'Send first follow-up immediately'
              : 'Try different channel (phone, mutual connection)';
          } else if (ref.status === 'intro_sent' && !ref.meetingDate) {
            stalledReason = `Intro sent ${daysSince} days ago, no meeting scheduled`;
            suggestedAction = 'Check if intro was received. Offer to schedule on their behalf.';
          } else if (ref.status === 'ask_pending') {
            stalledReason = `Ask drafted but not sent for ${daysSince} days`;
            suggestedAction = 'Review and send the ask, or defer if timing is wrong.';
          } else {
            stalledReason = `No progress on ${ref.status} for ${daysSince} days`;
            suggestedAction = 'Escalate to manager for deal strategy review.';
          }

          alerts.push({
            referralId: ref.id,
            accountName: accountMap.get(ref.accountId) ?? 'Unknown',
            targetCompany: ref.targetCompany,
            status: ref.status ?? 'unknown',
            daysSinceLastActivity: daysSince,
            stalledReason,
            urgency,
            suggestedAction,
          });
        }
      }

      // Sort by urgency then days stalled
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      alerts.sort((a, b) =>
        urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
        b.daysSinceLastActivity - a.daysSinceLastActivity
      );

      if (alerts.length === 0) {
        return {
          content: [{ type: 'text' as const, text: '# Stalled Deal Alerts\n\nNo stalled deals detected. All active referrals are progressing normally.' }],
        };
      }

      const text = [
        `# Stalled Deal Alerts`,
        `**Total Stalled:** ${alerts.length} | **High Urgency:** ${alerts.filter((a) => a.urgency === 'high').length}`,
        ``,
        ...alerts.map((a) => [
          `### [${a.urgency.toUpperCase()}] ${a.targetCompany} (via ${a.accountName})`,
          `**Status:** ${a.status} | **Stalled:** ${a.daysSinceLastActivity} days`,
          `**Reason:** ${a.stalledReason}`,
          `**Action:** ${a.suggestedAction}`,
          '',
        ].join('\n')),
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ─── Tool 3: Cohort analysis ───
  server.tool(
    'success_cohort_analysis',
    'Compare referral vs outbound pipeline performance. Shows win rates, deal velocity, deal size, and CAC differences.',
    {
      period: z.string().optional().default('all_time').describe('Period label for the analysis'),
      outbound_cac: z.number().optional().default(DEFAULT_OUTBOUND_CAC).describe('Outbound CAC for comparison'),
      referral_cac: z.number().optional().default(DEFAULT_REFERRAL_CAC).describe('Referral CAC for comparison'),
    },
    async ({ period, outbound_cac, referral_cac }) => {
      const now = new Date();
      const allReferrals = await db.select().from(referrals);

      // Build deals for cohort analysis
      const deals: DealForCohort[] = allReferrals.map((ref) => ({
        source: (ref.readinessScoreId ? 'referral' : 'outbound') as CohortSource,
        amount: ref.opportunityAmount ? parseFloat(ref.opportunityAmount) : 0,
        status: ref.status ?? 'ask_pending',
        timeToCloseDays: ref.timeToCloseDays,
        createdAt: ref.createdAt ?? now,
      }));

      if (deals.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No deals found for cohort analysis.' }],
          isError: true,
        };
      }

      const comparison = analyzeCohorts(deals, period ?? 'all_time', outbound_cac, referral_cac, now);

      const sections = [
        `# Cohort Analysis: Referral vs Outbound`,
        `**Period:** ${comparison.period}`,
        ``,
        `## Performance by Source`,
        `| Metric | ${comparison.cohorts.map((c) => c.source).join(' | ')} |`,
        `|--------|${comparison.cohorts.map(() => '------').join('|')}|`,
        `| Deals | ${comparison.cohorts.map((c) => c.dealCount).join(' | ')} |`,
        `| Pipeline | ${comparison.cohorts.map((c) => `$${c.totalPipeline.toLocaleString()}`).join(' | ')} |`,
        `| Avg Deal Size | ${comparison.cohorts.map((c) => `$${Math.round(c.avgDealSize).toLocaleString()}`).join(' | ')} |`,
        `| Win Rate | ${comparison.cohorts.map((c) => `${(c.winRate * 100).toFixed(1)}%`).join(' | ')} |`,
        `| Avg Days to Close | ${comparison.cohorts.map((c) => Math.round(c.avgTimeToClose)).join(' | ')} |`,
        `| Closed Won | ${comparison.cohorts.map((c) => c.closedWon).join(' | ')} |`,
        `| Open Deals | ${comparison.cohorts.map((c) => c.openDeals).join(' | ')} |`,
        ``,
      ];

      if (comparison.referralAdvantage.winRateLift > 0) {
        sections.push(
          `## Referral Advantage`,
          `- **Win Rate:** ${comparison.referralAdvantage.winRateLift.toFixed(1)}x higher than outbound`,
          `- **Speed:** ${comparison.referralAdvantage.speedAdvantage} days faster to close`,
          `- **Deal Size:** ${comparison.referralAdvantage.dealSizeLift.toFixed(1)}x larger than outbound`,
          `- **CAC Reduction:** ${comparison.referralAdvantage.cacReduction.toFixed(0)}% lower than outbound`,
        );
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    }
  );

  // ─── Tool 4: Score a single deal's health ───
  server.tool(
    'success_score_deal',
    'Score the health of a specific referral deal and get recommended actions',
    {
      referral_id: z.string().describe('Referral UUID'),
    },
    async ({ referral_id }) => {
      const [ref] = await db.select().from(referrals).where(eq(referrals.id, referral_id)).limit(1);
      if (!ref) {
        return { content: [{ type: 'text' as const, text: `Referral not found: ${referral_id}` }], isError: true };
      }

      const now = new Date();
      const lastActivity = ref.meetingDate ?? ref.introDate ?? ref.responseDate ?? ref.askDate ?? ref.createdAt;

      const health = scoreDealHealth({
        status: ref.status ?? 'ask_pending',
        createdAt: ref.createdAt ?? now,
        lastActivityDate: lastActivity ?? null,
        askDate: ref.askDate ?? null,
        introDate: ref.introDate ?? null,
        meetingDate: ref.meetingDate ?? null,
        followUpCount: ref.followUpCount ?? 0,
        response: ref.response ?? 'pending',
        opportunityAmount: ref.opportunityAmount ? parseFloat(ref.opportunityAmount) : null,
      }, now);

      const [acct] = await db.select().from(accounts).where(eq(accounts.id, ref.accountId)).limit(1);

      const text = [
        `# Deal Health: ${ref.targetCompany}`,
        `**Via:** ${acct?.companyName ?? 'Unknown'}`,
        `**Score:** ${health.score}/100 — **${health.tier.toUpperCase()}**`,
        `**Status:** ${ref.status}`,
        ``,
        `## Health Factors`,
        ...health.factors.map((f) => `- ${f}`),
        ``,
        `## Recommended Action`,
        health.recommendedAction,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ─── Tool 5: Pipeline velocity report ───
  server.tool(
    'success_velocity_report',
    'Report on pipeline velocity: average time between stages, conversion rates at each stage',
    {},
    async () => {
      const allReferrals = await db.select().from(referrals);

      if (allReferrals.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No referrals found for velocity analysis.' }], isError: true };
      }

      // Stage progression analysis
      const stages = ['ask_pending', 'ask_sent', 'intro_pending', 'intro_sent', 'meeting_booked', 'opportunity_created', 'closed_won'];
      const stageProgression: Record<string, { count: number; avgDays: number }> = {};

      // Ask → Intro time
      const askToIntro = allReferrals
        .filter((r) => r.askDate && r.introDate)
        .map((r) => Math.floor((r.introDate!.getTime() - r.askDate!.getTime()) / (1000 * 60 * 60 * 24)));
      if (askToIntro.length > 0) {
        stageProgression['ask_to_intro'] = {
          count: askToIntro.length,
          avgDays: Math.round(askToIntro.reduce((s, d) => s + d, 0) / askToIntro.length),
        };
      }

      // Intro → Meeting time
      const introToMeeting = allReferrals
        .filter((r) => r.introDate && r.meetingDate)
        .map((r) => Math.floor((r.meetingDate!.getTime() - r.introDate!.getTime()) / (1000 * 60 * 60 * 24)));
      if (introToMeeting.length > 0) {
        stageProgression['intro_to_meeting'] = {
          count: introToMeeting.length,
          avgDays: Math.round(introToMeeting.reduce((s, d) => s + d, 0) / introToMeeting.length),
        };
      }

      // Total time to close
      const timeToClose = allReferrals
        .filter((r) => r.timeToCloseDays != null)
        .map((r) => r.timeToCloseDays!);
      const avgTimeToClose = timeToClose.length > 0
        ? Math.round(timeToClose.reduce((s, d) => s + d, 0) / timeToClose.length)
        : 0;

      // Conversion rates
      const total = allReferrals.length;
      const asksSent = allReferrals.filter((r) => r.askDate).length;
      const introsMade = allReferrals.filter((r) => r.introDate).length;
      const meetingsBooked = allReferrals.filter((r) => r.meetingDate).length;
      const oppsCreated = allReferrals.filter((r) => r.crmOpportunityId).length;
      const closedWon = allReferrals.filter((r) => r.status === 'closed_won').length;

      const text = [
        `# Pipeline Velocity Report`,
        `**Total Referrals:** ${total}`,
        ``,
        `## Conversion Funnel`,
        `| Stage | Count | Conversion |`,
        `|-------|-------|------------|`,
        `| Asks Created | ${total} | — |`,
        `| Asks Sent | ${asksSent} | ${total > 0 ? ((asksSent / total) * 100).toFixed(0) : 0}% |`,
        `| Intros Made | ${introsMade} | ${asksSent > 0 ? ((introsMade / asksSent) * 100).toFixed(0) : 0}% |`,
        `| Meetings Booked | ${meetingsBooked} | ${introsMade > 0 ? ((meetingsBooked / introsMade) * 100).toFixed(0) : 0}% |`,
        `| Opps Created | ${oppsCreated} | ${meetingsBooked > 0 ? ((oppsCreated / meetingsBooked) * 100).toFixed(0) : 0}% |`,
        `| Closed Won | ${closedWon} | ${oppsCreated > 0 ? ((closedWon / oppsCreated) * 100).toFixed(0) : 0}% |`,
        ``,
        `## Stage Velocity`,
      ];

      if (stageProgression['ask_to_intro']) {
        text.push(`- **Ask → Intro:** ${stageProgression['ask_to_intro'].avgDays} days avg (n=${stageProgression['ask_to_intro'].count})`);
      }
      if (stageProgression['intro_to_meeting']) {
        text.push(`- **Intro → Meeting:** ${stageProgression['intro_to_meeting'].avgDays} days avg (n=${stageProgression['intro_to_meeting'].count})`);
      }
      if (avgTimeToClose > 0) {
        text.push(`- **Total Time to Close:** ${avgTimeToClose} days avg (n=${timeToClose.length})`);
      }

      return { content: [{ type: 'text' as const, text: text.join('\n') }] };
    }
  );
}
