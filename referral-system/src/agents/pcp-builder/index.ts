import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { analyzeRevenue } from './revenue-analyzer.js';
import { extractAttributes } from './attribute-extractor.js';
import { buildIcpWeights, scoreTarget } from './icp-weight-builder.js';
import type { RevenueDataPoint, TierThresholds } from './types.js';
import { DEFAULT_TIER_THRESHOLDS } from './types.js';
import {
  accounts,
  revenueSnapshots,
  pcpAnalyses,
  pcpAccountTiers,
  pcpIcpWeights,
} from '../../db/schema.js';

export function registerPcpBuilderTools(server: McpServer, deps: ServerDeps) {
  const { db } = deps;

  // ─── Tool 1: Ingest revenue data ───
  server.tool(
    'pcp_ingest_revenue',
    'Ingest revenue data for accounts. Accepts bulk revenue snapshots for power-law analysis.',
    {
      snapshots: z.array(z.object({
        account_id: z.string().describe('Account UUID'),
        period: z.string().describe('Period label, e.g. "2026-Q1"'),
        revenue: z.number().describe('Revenue amount'),
        deal_count: z.number().optional(),
        product_lines: z.array(z.string()).optional(),
        expansion_revenue: z.number().optional(),
        referral_sourced: z.boolean().optional(),
      })).describe('Array of revenue snapshots'),
    },
    async ({ snapshots }) => {
      let inserted = 0;
      let skipped = 0;

      for (const snap of snapshots) {
        // Verify account exists
        const [acct] = await db.select().from(accounts).where(eq(accounts.id, snap.account_id)).limit(1);
        if (!acct) {
          skipped++;
          continue;
        }

        await db.insert(revenueSnapshots).values({
          accountId: snap.account_id,
          period: snap.period,
          revenue: snap.revenue.toString(),
          dealCount: snap.deal_count,
          productLines: snap.product_lines,
          expansionRevenue: snap.expansion_revenue?.toString(),
          referralSourced: snap.referral_sourced,
        });
        inserted++;
      }

      return {
        content: [{
          type: 'text' as const,
          text: [
            `# Revenue Data Ingested`,
            `**Inserted:** ${inserted} snapshots`,
            skipped > 0 ? `**Skipped:** ${skipped} (account not found)` : '',
            ``,
            `**Next step:** Run \`pcp_analyze_distribution\` to compute power-law tiers.`,
          ].filter(Boolean).join('\n'),
        }],
      };
    }
  );

  // ─── Tool 2: Analyze power-law distribution ───
  server.tool(
    'pcp_analyze_distribution',
    'Analyze revenue distribution across accounts. Finds power-law concentration, assigns tiers, computes Gini coefficient.',
    {
      name: z.string().describe('Analysis name, e.g. "Q1 2026 Analysis"'),
      period: z.string().optional().describe('Period to filter snapshots, e.g. "2026-Q1". Omit for all time.'),
      power_law_pct: z.number().optional().default(3).describe('Top N% of accounts for power-law tier (default: 3)'),
      high_value_pct: z.number().optional().default(7).describe('Next N% for high-value tier (default: 7)'),
      core_pct: z.number().optional().default(40).describe('Next N% for core tier (default: 40)'),
    },
    async ({ name, period, power_law_pct, high_value_pct, core_pct }) => {
      try {
        // Fetch revenue data
        let snapshots = await db.select().from(revenueSnapshots);
        if (period) {
          snapshots = snapshots.filter((s) => s.period === period);
        }

        if (snapshots.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No revenue data found. Run `pcp_ingest_revenue` first.' }],
            isError: true,
          };
        }

        // Aggregate revenue per account
        const revenueByAccount = new Map<string, { revenue: number; dealCount: number }>();
        for (const snap of snapshots) {
          const existing = revenueByAccount.get(snap.accountId) ?? { revenue: 0, dealCount: 0 };
          existing.revenue += parseFloat(snap.revenue);
          existing.dealCount += snap.dealCount ?? 1;
          revenueByAccount.set(snap.accountId, existing);
        }

        // Fetch account metadata
        const accountList = await db.select().from(accounts);
        const accountMap = new Map(accountList.map((a) => [a.id, a]));

        const dataPoints: RevenueDataPoint[] = [];
        for (const [accountId, data] of revenueByAccount.entries()) {
          const acct = accountMap.get(accountId);
          dataPoints.push({
            accountId,
            companyName: acct?.companyName ?? 'Unknown',
            revenue: data.revenue,
            industry: acct?.industry ?? undefined,
            employeeCount: acct?.employeeCount ?? undefined,
            dealCount: data.dealCount,
          });
        }

        const thresholds: TierThresholds = {
          powerLawPct: power_law_pct ?? DEFAULT_TIER_THRESHOLDS.powerLawPct,
          highValuePct: high_value_pct ?? DEFAULT_TIER_THRESHOLDS.highValuePct,
          corePct: core_pct ?? DEFAULT_TIER_THRESHOLDS.corePct,
        };

        const distribution = analyzeRevenue(dataPoints, thresholds);

        // Persist analysis
        const [analysis] = await db.insert(pcpAnalyses).values({
          name,
          period: period ?? 'all_time',
          totalAccounts: distribution.totalAccounts,
          totalRevenue: distribution.totalRevenue.toString(),
          powerLawThresholdPct: thresholds.powerLawPct.toString(),
          powerLawAccountCount: distribution.tiers.powerLaw.count,
          powerLawRevenuePct: distribution.tiers.powerLaw.revenuePct.toFixed(2),
          highValueAccountCount: distribution.tiers.highValue.count,
          highValueRevenuePct: distribution.tiers.highValue.revenuePct.toFixed(2),
          coreAccountCount: distribution.tiers.core.count,
          coreRevenuePct: distribution.tiers.core.revenuePct.toFixed(2),
          longTailAccountCount: distribution.tiers.longTail.count,
          longTailRevenuePct: distribution.tiers.longTail.revenuePct.toFixed(2),
          giniCoefficient: distribution.giniCoefficient.toFixed(4),
          status: 'analyzing',
        }).returning();

        // Persist tier assignments
        for (const tier of ['powerLaw', 'highValue', 'core', 'longTail'] as const) {
          const tierName = { powerLaw: 'power_law', highValue: 'high_value', core: 'core', longTail: 'long_tail' }[tier] as 'power_law' | 'high_value' | 'core' | 'long_tail';
          for (const acct of distribution.tiers[tier].accounts) {
            await db.insert(pcpAccountTiers).values({
              analysisId: analysis.id,
              accountId: acct.accountId,
              tier: tierName,
              totalRevenue: acct.revenue.toString(),
              revenuePctOfTotal: acct.revenuePctOfTotal.toFixed(2),
              revenueRank: acct.rank,
            });
          }
        }

        // Extract attributes and build ICP weights
        const allAccountAttrs: { accountId: string; attrs: ReturnType<typeof extractAttributes> }[] = [];
        for (const dp of dataPoints) {
          const acct = accountMap.get(dp.accountId);
          if (acct) {
            allAccountAttrs.push({ accountId: dp.accountId, attrs: extractAttributes(acct) });
          }
        }

        const powerLawIds = new Set(distribution.tiers.powerLaw.accounts.map((a) => a.accountId));
        const powerLawAttrs = allAccountAttrs.filter((a) => powerLawIds.has(a.accountId)).map((a) => a.attrs);
        const allAttrs = allAccountAttrs.map((a) => a.attrs);

        const icpResult = buildIcpWeights(powerLawAttrs, allAttrs);

        // Persist ICP weights
        for (const attr of icpResult.attributes) {
          await db.insert(pcpIcpWeights).values({
            analysisId: analysis.id,
            attribute: attr.attribute,
            attributeValue: attr.value,
            powerLawFrequency: attr.powerLawFrequency.toFixed(4),
            overallFrequency: attr.overallFrequency.toFixed(4),
            liftScore: attr.liftScore.toFixed(4),
            weight: attr.weight.toFixed(4),
            sampleSize: attr.sampleSize,
          });
        }

        // Mark complete
        await db.update(pcpAnalyses).set({ status: 'complete' }).where(eq(pcpAnalyses.id, analysis.id));

        const text = [
          `# Power-Law Distribution Analysis`,
          `**Name:** ${name}`,
          `**Analysis ID:** ${analysis.id}`,
          ``,
          `## Revenue Concentration`,
          `| Tier | Accounts | % Revenue |`,
          `|------|----------|-----------|`,
          `| Power Law (top ${thresholds.powerLawPct}%) | ${distribution.tiers.powerLaw.count} | ${distribution.tiers.powerLaw.revenuePct.toFixed(1)}% |`,
          `| High Value (next ${thresholds.highValuePct}%) | ${distribution.tiers.highValue.count} | ${distribution.tiers.highValue.revenuePct.toFixed(1)}% |`,
          `| Core (next ${thresholds.corePct}%) | ${distribution.tiers.core.count} | ${distribution.tiers.core.revenuePct.toFixed(1)}% |`,
          `| Long Tail (bottom) | ${distribution.tiers.longTail.count} | ${distribution.tiers.longTail.revenuePct.toFixed(1)}% |`,
          ``,
          `**Gini Coefficient:** ${distribution.giniCoefficient.toFixed(3)} (1.0 = maximum concentration)`,
          ``,
          `## Top Power-Law Accounts`,
          ...distribution.tiers.powerLaw.accounts.slice(0, 10).map(
            (a) => `- **${a.companyName}** — $${a.revenue.toLocaleString()} (${a.revenuePctOfTotal.toFixed(1)}% of total)`
          ),
          ``,
          `## Empirical ICP Weights (Top 10)`,
          ...icpResult.topAttributes.map(
            (a) => `- **${a.attribute}=${a.value}** — Lift: ${a.lift.toFixed(2)}x`
          ),
          ``,
          `**Next step:** Run \`pcp_score_target\` to score prospects against these weights.`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { content: [{ type: 'text' as const, text: `Analysis failed: ${message}` }], isError: true };
      }
    }
  );

  // ─── Tool 3: Score a target prospect ───
  server.tool(
    'pcp_score_target',
    'Score a target prospect against empirical ICP weights from the latest PCP analysis',
    {
      analysis_id: z.string().describe('PCP analysis UUID to score against'),
      industry: z.string().optional().describe('Target industry'),
      employee_count: z.number().optional().describe('Target employee count'),
      acv: z.number().optional().describe('Expected ACV'),
      usage_trend: z.string().optional().describe('Usage trend: growing/stable/declining'),
    },
    async ({ analysis_id, industry, employee_count, acv, usage_trend }) => {
      // Fetch weights
      const weights = await db
        .select()
        .from(pcpIcpWeights)
        .where(eq(pcpIcpWeights.analysisId, analysis_id));

      if (weights.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No ICP weights found for analysis ${analysis_id}. Run \`pcp_analyze_distribution\` first.` }],
          isError: true,
        };
      }

      const attrFreqs = weights.map((w) => ({
        attribute: w.attribute,
        value: w.attributeValue,
        powerLawFrequency: parseFloat(w.powerLawFrequency),
        overallFrequency: parseFloat(w.overallFrequency),
        liftScore: parseFloat(w.liftScore),
        weight: parseFloat(w.weight),
        sampleSize: w.sampleSize,
      }));

      const result = scoreTarget({ industry, employeeCount: employee_count, acv, usageTrend: usage_trend }, attrFreqs);

      const text = [
        `# Target ICP Score`,
        `**Score:** ${result.totalScore}/100 — **${result.tier.toUpperCase()}**`,
        ``,
        `## Matched Attributes`,
        result.matchedAttributes.length > 0
          ? result.matchedAttributes.map(
              (m) => `- **${m.attribute}=${m.value}** — Weight: ${m.weight.toFixed(2)}, Lift: ${m.lift.toFixed(2)}x`
            ).join('\n')
          : 'No matching attributes found.',
        ``,
        `## Gap Analysis (Top Unmatched)`,
        result.unmatchedTopAttributes.length > 0
          ? result.unmatchedTopAttributes.map(
              (u) => `- **${u.attribute}=${u.value}** — Lift: ${u.lift.toFixed(2)}x (missing from target)`
            ).join('\n')
          : 'All high-lift attributes matched.',
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ─── Tool 4: Get PCP analysis summary ───
  server.tool(
    'pcp_get_analysis',
    'Retrieve a PCP analysis with tier breakdown, ICP weights, and power-law accounts',
    {
      analysis_id: z.string().describe('PCP analysis UUID'),
      include_accounts: z.boolean().optional().default(false).describe('Include full account tier list'),
    },
    async ({ analysis_id, include_accounts }) => {
      const [analysis] = await db
        .select()
        .from(pcpAnalyses)
        .where(eq(pcpAnalyses.id, analysis_id))
        .limit(1);

      if (!analysis) {
        return {
          content: [{ type: 'text' as const, text: `Analysis not found: ${analysis_id}` }],
          isError: true,
        };
      }

      const weights = await db
        .select()
        .from(pcpIcpWeights)
        .where(eq(pcpIcpWeights.analysisId, analysis_id));

      weights.sort((a, b) => parseFloat(b.liftScore) - parseFloat(a.liftScore));

      const sections = [
        `# PCP Analysis: ${analysis.name}`,
        `**Period:** ${analysis.period} | **Status:** ${analysis.status}`,
        `**Total Accounts:** ${analysis.totalAccounts} | **Total Revenue:** $${parseFloat(analysis.totalRevenue).toLocaleString()}`,
        `**Gini Coefficient:** ${analysis.giniCoefficient}`,
        ``,
        `## Tier Distribution`,
        `| Tier | Accounts | Revenue % |`,
        `|------|----------|-----------|`,
        `| Power Law | ${analysis.powerLawAccountCount} | ${analysis.powerLawRevenuePct}% |`,
        `| High Value | ${analysis.highValueAccountCount} | ${analysis.highValueRevenuePct}% |`,
        `| Core | ${analysis.coreAccountCount} | ${analysis.coreRevenuePct}% |`,
        `| Long Tail | ${analysis.longTailAccountCount} | ${analysis.longTailRevenuePct}% |`,
        ``,
        `## Empirical ICP Weights`,
        `| Attribute | Value | Lift | Weight |`,
        `|-----------|-------|------|--------|`,
        ...weights.slice(0, 15).map(
          (w) => `| ${w.attribute} | ${w.attributeValue} | ${parseFloat(w.liftScore).toFixed(2)}x | ${parseFloat(w.weight).toFixed(2)} |`
        ),
      ];

      if (include_accounts) {
        const tiers = await db
          .select()
          .from(pcpAccountTiers)
          .where(eq(pcpAccountTiers.analysisId, analysis_id));

        tiers.sort((a, b) => a.revenueRank - b.revenueRank);

        // Get account names
        const acctList = await db.select().from(accounts);
        const acctMap = new Map(acctList.map((a) => [a.id, a.companyName]));

        sections.push('', '## Account Tiers');
        sections.push('| Rank | Company | Tier | Revenue | % of Total |');
        sections.push('|------|---------|------|---------|------------|');
        for (const t of tiers.slice(0, 50)) {
          sections.push(
            `| ${t.revenueRank} | ${acctMap.get(t.accountId) ?? 'Unknown'} | ${t.tier} | $${parseFloat(t.totalRevenue).toLocaleString()} | ${t.revenuePctOfTotal}% |`
          );
        }
        if (tiers.length > 50) {
          sections.push(`| ... | ${tiers.length - 50} more accounts | | | |`);
        }
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    }
  );
}
