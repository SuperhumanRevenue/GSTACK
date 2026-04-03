import { z } from 'zod';
import { eq, and, gte, desc } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { scoreReadiness } from './scoring-engine.js';
import { detectTriggers } from './trigger-detector.js';
import { formatScoringResult } from '../../shared/formatting.js';
import {
  accounts,
  champions,
  readinessScores,
  triggerEvents,
  referrals,
} from '../../db/schema.js';
import type { Account, Champion, TriggerEvent, Referral } from '../../db/schema.js';

export function registerReadinessTools(server: McpServer, deps: ServerDeps) {
  const { db, config } = deps;

  // ─── Tool 1: Score a single account ───
  server.tool(
    'referral_scorer_score_account',
    'Score a single account for referral readiness using the 5-dimension model',
    {
      account_id: z.string().describe('Account UUID or CRM account ID'),
      champion_id: z.string().optional().describe('Specific champion to score (defaults to best candidate)'),
      override_data: z
        .object({
          cs_health_score: z.number().optional(),
          nps_score: z.number().optional(),
          usage_trend: z.string().optional(),
        })
        .optional()
        .describe('Manual overrides when CRM data is incomplete'),
    },
    async ({ account_id, champion_id, override_data }) => {
      // Fetch account
      let [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, account_id))
        .limit(1);

      if (!account) {
        // Try CRM account ID
        const [byCrmId] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.crmAccountId, account_id))
          .limit(1);
        if (!byCrmId) {
          return { content: [{ type: 'text' as const, text: `Account not found: ${account_id}` }], isError: true };
        }
        account = byCrmId;
      }

      const acct: Account = override_data
        ? {
            ...account!,
            csHealthScore: override_data.cs_health_score ?? account!.csHealthScore,
            npsScore: override_data.nps_score ?? account!.npsScore,
            usageTrend: override_data.usage_trend ?? account!.usageTrend,
          }
        : account!;

      // Fetch champion(s)
      let champion: Champion;
      if (champion_id) {
        const [c] = await db.select().from(champions).where(eq(champions.id, champion_id)).limit(1);
        if (!c) return { content: [{ type: 'text' as const, text: `Champion not found: ${champion_id}` }], isError: true };
        champion = c;
      } else {
        const champList = await db
          .select()
          .from(champions)
          .where(and(eq(champions.accountId, acct.id), eq(champions.relationshipStrength, 'strong')))
          .limit(1);
        if (champList.length === 0) {
          const [any] = await db.select().from(champions).where(eq(champions.accountId, acct.id)).limit(1);
          if (!any) return { content: [{ type: 'text' as const, text: `No champions found for account ${account_id}` }], isError: true };
          champion = any;
        } else {
          champion = champList[0];
        }
      }

      // Fetch trigger events and referral history
      const triggers = await db
        .select()
        .from(triggerEvents)
        .where(eq(triggerEvents.accountId, acct.id));

      const history = await db
        .select()
        .from(referrals)
        .where(eq(referrals.championId, champion.id));

      const result = scoreReadiness(
        { account: acct, champion, triggerEvents: triggers, referralHistory: history },
        config.readinessHotThreshold,
        config.readinessWarmThreshold
      );

      // Persist the score
      await db.insert(readinessScores).values({
        accountId: acct.id,
        championId: champion.id,
        totalScore: result.totalScore,
        tier: result.tier,
        valueDeliveredScore: result.dimensions.valueDelivered,
        relationshipStrengthScore: result.dimensions.relationshipStrength,
        recencyOfWinScore: result.dimensions.recencyOfWin,
        networkValueScore: result.dimensions.networkValue,
        askHistoryScore: result.dimensions.askHistory,
        triggerEvent: result.triggerEvent,
        antiTriggers: result.antiTriggers,
        scoringRationale: result.rationale,
      });

      const markdown = formatScoringResult(result);
      return {
        content: [{ type: 'text' as const, text: markdown }],
      };
    }
  );

  // ─── Tool 2: Score full portfolio ───
  server.tool(
    'referral_scorer_score_portfolio',
    'Score all accounts in a portfolio for referral readiness. Returns tiered priority list.',
    {
      account_ids: z.array(z.string()).optional().describe('Specific accounts, or omit for full portfolio'),
      min_acv: z.number().optional().describe('Filter by minimum ACV'),
      industry: z.string().optional().describe('Filter by industry'),
    },
    async ({ account_ids, min_acv, industry }) => {
      let accountList: Account[];

      if (account_ids && account_ids.length > 0) {
        accountList = [];
        for (const id of account_ids) {
          const [a] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
          if (a) accountList.push(a);
        }
      } else {
        accountList = await db.select().from(accounts);
      }

      // Apply filters
      if (min_acv) {
        accountList = accountList.filter((a) => parseFloat(a.currentAcv ?? '0') >= min_acv);
      }
      if (industry) {
        accountList = accountList.filter((a) => a.industry === industry);
      }

      const hot: { account: string; score: number; champion: string; trigger: string | null }[] = [];
      const warm: typeof hot = [];
      const notYet: typeof hot = [];

      for (const acct of accountList) {
        const champList = await db
          .select()
          .from(champions)
          .where(eq(champions.accountId, acct.id));

        if (champList.length === 0) continue;

        // Score with best champion
        const bestChampion = champList.find((c) => c.relationshipStrength === 'strong') ?? champList[0];
        const triggers = await db.select().from(triggerEvents).where(eq(triggerEvents.accountId, acct.id));
        const history = await db.select().from(referrals).where(eq(referrals.championId, bestChampion.id));

        const result = scoreReadiness(
          { account: acct, champion: bestChampion, triggerEvents: triggers, referralHistory: history },
          config.readinessHotThreshold,
          config.readinessWarmThreshold
        );

        const entry = {
          account: acct.companyName,
          score: result.totalScore,
          champion: bestChampion.name,
          trigger: result.triggerEvent,
        };

        if (result.tier === 'hot') hot.push(entry);
        else if (result.tier === 'warm') warm.push(entry);
        else notYet.push(entry);
      }

      // Sort each tier by score descending
      hot.sort((a, b) => b.score - a.score);
      warm.sort((a, b) => b.score - a.score);

      const summary = [
        `# Portfolio Readiness Report`,
        ``,
        `**Total:** ${accountList.length} | **Hot:** ${hot.length} | **Warm:** ${warm.length} | **Not Yet:** ${notYet.length}`,
        ``,
        `## Hot Accounts (Ready for Ask)`,
        ...hot.map((h) => `- **${h.account}** — Score: ${h.score}, Champion: ${h.champion}${h.trigger ? `, Trigger: ${h.trigger}` : ''}`),
        ``,
        `## Warm Accounts (Nurture)`,
        ...warm.map((w) => `- **${w.account}** — Score: ${w.score}, Champion: ${w.champion}`),
        ``,
        `## Not Yet (${notYet.length} accounts)`,
        notYet.length > 5
          ? `${notYet.length} accounts below threshold. Focus on value delivery.`
          : notYet.map((n) => `- ${n.account} — Score: ${n.score}`).join('\n'),
      ].join('\n');

      return { content: [{ type: 'text' as const, text: summary }] };
    }
  );

  // ─── Tool 3: Detect triggers ───
  server.tool(
    'referral_scorer_detect_triggers',
    'Scan CRM and connected platforms for new trigger events since last scan',
    {
      since: z.string().optional().describe('ISO date, defaults to last 7 days'),
      account_ids: z.array(z.string()).optional().describe('Specific accounts or all'),
    },
    async ({ since, account_ids }) => {
      const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      let accountList: Account[];
      if (account_ids && account_ids.length > 0) {
        accountList = [];
        for (const id of account_ids) {
          const [a] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
          if (a) accountList.push(a);
        }
      } else {
        accountList = await db.select().from(accounts);
      }

      const allNewTriggers: { account: string; triggers: ReturnType<typeof detectTriggers> }[] = [];

      for (const acct of accountList) {
        const champList = await db.select().from(champions).where(eq(champions.accountId, acct.id));
        const existingEvents = await db
          .select()
          .from(triggerEvents)
          .where(and(eq(triggerEvents.accountId, acct.id), gte(triggerEvents.eventDate, sinceDate)));

        for (const champ of champList) {
          const detected = detectTriggers(acct, champ, existingEvents);
          if (detected.length > 0) {
            allNewTriggers.push({ account: acct.companyName, triggers: detected });

            // Persist new triggers
            for (const t of detected) {
              await db.insert(triggerEvents).values({
                accountId: acct.id,
                championId: champ.id,
                eventType: t.eventType,
                eventCategory: t.eventCategory,
                eventDescription: t.eventDescription,
                eventDate: t.eventDate,
                dataSource: t.dataSource,
                isAntiTrigger: t.isAntiTrigger,
              });
            }
          }
        }
      }

      const positive = allNewTriggers.flatMap((a) =>
        a.triggers.filter((t) => !t.isAntiTrigger).map((t) => `- **${a.account}**: ${t.eventDescription}`)
      );
      const negative = allNewTriggers.flatMap((a) =>
        a.triggers.filter((t) => t.isAntiTrigger).map((t) => `- **${a.account}**: ${t.eventDescription}`)
      );

      const text = [
        `# Trigger Scan Results`,
        `Scanned ${accountList.length} accounts since ${sinceDate.toISOString().split('T')[0]}`,
        ``,
        `## New Positive Triggers (${positive.length})`,
        positive.length > 0 ? positive.join('\n') : 'None detected',
        ``,
        `## New Anti-Triggers (${negative.length})`,
        negative.length > 0 ? negative.join('\n') : 'None detected',
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ─── Tool 4: Readiness history ───
  server.tool(
    'referral_scorer_get_readiness_history',
    'Get historical readiness scores for an account to show progression',
    {
      account_id: z.string().describe('Account UUID'),
      period: z.enum(['30d', '90d', '180d', '1y']).optional().default('90d'),
    },
    async ({ account_id, period }) => {
      const days = { '30d': 30, '90d': 90, '180d': 180, '1y': 365 }[period];
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const scores = await db
        .select()
        .from(readinessScores)
        .where(and(eq(readinessScores.accountId, account_id), gte(readinessScores.scoredAt, since)))
        .orderBy(desc(readinessScores.scoredAt));

      if (scores.length === 0) {
        return { content: [{ type: 'text' as const, text: `No readiness scores found for account ${account_id} in the last ${period}.` }] };
      }

      // Determine trend
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (scores.length >= 2) {
        const latest = scores[0].totalScore;
        const oldest = scores[scores.length - 1].totalScore;
        if (latest - oldest >= 10) trend = 'improving';
        else if (oldest - latest >= 10) trend = 'declining';
      }

      const text = [
        `# Readiness History (${period})`,
        `**Trend:** ${trend}`,
        ``,
        `| Date | Score | Tier | Trigger |`,
        `|------|-------|------|---------|`,
        ...scores.map((s) =>
          `| ${s.scoredAt?.toISOString().split('T')[0] ?? 'N/A'} | ${s.totalScore} | ${s.tier} | ${s.triggerEvent ?? '-'} |`
        ),
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
