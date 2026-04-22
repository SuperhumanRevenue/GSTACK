/**
 * Orchestrator Agent — One-click account intelligence
 *
 * Provides a single tool that chains all 9 agents together for comprehensive
 * account analysis. Also provides a quick health check for rapid status updates.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerDeps } from '../../shared/types.js';
import { runFullAnalysis } from '../../orchestration/full-analysis.js';

export function registerOrchestratorTools(server: McpServer, deps: ServerDeps): void {
  // ── Tool 1: Run Full Analysis ─────────────────────────────────────────────
  server.tool(
    'orchestrator_run_full_analysis',
    'Run comprehensive account intelligence: readiness scoring, PCP analysis, portfolio mapping, ' +
    'signal guide, relationship mapping, deal health, and cohort analysis — all in one call. ' +
    'Cross-agent wiring applied automatically (PCP boosts readiness, signal timing informs asks, ' +
    'deal health adjusts champion scores, ICP weights rank portfolio opportunities).',
    {
      account_id: z.string().uuid().describe('The account UUID to analyze'),
      customer_intake: z.object({
        product_description: z.string().optional(),
        positioning: z.string().optional(),
        messaging: z.string().optional(),
        target_industries: z.array(z.string()).optional(),
        target_personas: z.array(z.string()).optional(),
        competitors: z.array(z.string()).optional(),
      }).optional().describe('Customer intake docs for signal guide generation'),
      revenue_snapshots: z.array(z.object({
        account_id: z.string(),
        company_name: z.string(),
        revenue: z.number(),
        industry: z.string().optional(),
        employee_count: z.number().optional(),
      })).optional().describe('Revenue snapshots for PCP power-law analysis'),
      enable_web_research: z.boolean().default(false).describe('Enable live web search for portfolio mapping and signal research'),
      generate_asks: z.boolean().default(false).describe('Generate referral ask drafts for top opportunities'),
    },
    async ({ account_id, customer_intake, revenue_snapshots, enable_web_research, generate_asks }) => {
      try {
        const result = await runFullAnalysis(
          {
            accountId: account_id,
            customerIntake: customer_intake ? {
              productDescription: customer_intake.product_description,
              positioning: customer_intake.positioning,
              messaging: customer_intake.messaging,
              targetIndustries: customer_intake.target_industries,
              targetPersonas: customer_intake.target_personas,
              competitors: customer_intake.competitors,
            } : undefined,
            revenueSnapshots: revenue_snapshots?.map((s) => ({
              accountId: s.account_id,
              companyName: s.company_name,
              revenue: s.revenue,
              industry: s.industry,
              employeeCount: s.employee_count,
            })),
            enableWebResearch: enable_web_research,
            generateAsks: generate_asks,
          },
          deps
        );

        // Format the response as a structured intelligence report
        const report = [
          `═══ FULL ANALYSIS: ${result.accountName} ═══`,
          `Run at: ${result.timestamp} | Duration: ${result.totalDuration_ms}ms`,
          '',
          '── PHASES ──',
          ...result.phases.map((p) =>
            `  ${p.status === 'completed' ? '✓' : p.status === 'skipped' ? '○' : '✗'} ${p.phase} (${p.duration_ms}ms): ${p.summary}`
          ),
          '',
          '── READINESS ──',
          result.intelligence.readinessScore !== null
            ? `  Score: ${result.intelligence.readinessScore}/100 (${result.intelligence.readinessTier})`
            + (result.intelligence.pcpBoostApplied > 0 ? ` [includes PCP boost: +${result.intelligence.pcpBoostApplied}]` : '')
            : '  No champions found — add champion contacts to score readiness',
          '',
          '── TOP CHAMPIONS ──',
          ...(result.intelligence.topChampions.length > 0
            ? result.intelligence.topChampions.map((c, i) =>
              `  ${i + 1}. ${c.name} (${c.title}) — ${c.score} pts`)
            : ['  No champions on file']),
          '',
          '── TOP TARGETS ──',
          ...(result.intelligence.topTargets.length > 0
            ? result.intelligence.topTargets.map((t, i) =>
              `  ${i + 1}. ${t.contact} @ ${t.company} — score ${t.score}, via ${t.path}`)
            : ['  No warm paths mapped yet']),
          '',
          '── PORTFOLIO OPPORTUNITIES ──',
          ...(result.intelligence.portfolioOpportunities.length > 0
            ? result.intelligence.portfolioOpportunities.map((o, i) =>
              `  ${i + 1}. ${o.target} (${o.type}) — combined score: ${o.combinedScore}`)
            : ['  None found (enable web research to discover)']),
          '',
          '── PIPELINE HEALTH ──',
          `  Total: ${result.intelligence.pipelineHealth.total} deals`,
          `  Healthy: ${result.intelligence.pipelineHealth.healthy} | At Risk: ${result.intelligence.pipelineHealth.atRisk} | Stalled: ${result.intelligence.pipelineHealth.stalled} | Critical: ${result.intelligence.pipelineHealth.critical}`,
          ...(result.intelligence.cohortComparison ? [
            '',
            '── COHORT COMPARISON ──',
            `  Referral win rate: ${(result.intelligence.cohortComparison.referralWinRate * 100).toFixed(1)}%`,
            `  Outbound win rate: ${(result.intelligence.cohortComparison.outboundWinRate * 100).toFixed(1)}%`,
            `  Speed advantage: ${result.intelligence.cohortComparison.speedAdvantage.toFixed(1)} days faster`,
          ] : []),
          '',
          '── RECOMMENDED ACTIONS ──',
          ...result.intelligence.recommendedActions.map((a) => `  → ${a}`),
          ...(result.intelligence.executiveSummary ? [
            '',
            '── EXECUTIVE BRIEFING ──',
            result.intelligence.executiveSummary,
          ] : []),
        ].join('\n');

        return {
          content: [{ type: 'text' as const, text: report }],
          structuredData: result,
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Full analysis failed: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 2: Quick Account Health Check ────────────────────────────────────
  server.tool(
    'orchestrator_quick_health',
    'Fast health check for an account — readiness score, deal health summary, and top action. ' +
    'Use this for quick status updates without the full analysis pipeline.',
    {
      account_id: z.string().uuid().describe('The account UUID to check'),
    },
    async ({ account_id }) => {
      try {
        // Lightweight version: just readiness + deal health, no web research
        const result = await runFullAnalysis(
          {
            accountId: account_id,
            enableWebResearch: false,
            generateAsks: false,
          },
          deps
        );

        const health = result.intelligence.pipelineHealth;
        const topAction = result.intelligence.recommendedActions[0] ?? 'No immediate actions';

        const summary = [
          `${result.accountName} — Quick Health Check`,
          `Readiness: ${result.intelligence.readinessScore ?? 'N/A'}${result.intelligence.readinessTier ? ` (${result.intelligence.readinessTier})` : ''}`,
          `Pipeline: ${health.total} deals (${health.healthy}H/${health.atRisk}R/${health.stalled}S/${health.critical}C)`,
          `Champions: ${result.intelligence.topChampions.length} scored`,
          `Top action: ${topAction}`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text: summary }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Health check failed: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
