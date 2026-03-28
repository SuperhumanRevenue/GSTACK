import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { processIntake, buildContextSummary } from './intake-processor.js';
import { researchMarket } from './research-orchestrator.js';
import { generateCustomGuide, summarizeGuide } from './guide-generator.js';
import { MASTER_SIGNALS } from './master-signals.js';
import {
  signalTemplates,
  customerContexts,
  customSignalGuides,
} from '../../db/schema.js';
import type { CustomerIntakeInput } from './types.js';

export function registerSignalGuideTools(server: McpServer, deps: ServerDeps) {
  const { db, llm, webSearch } = deps;

  // ─── Tool 1: Ingest customer context ───
  server.tool(
    'signal_guide_ingest_customer',
    'Ingest customer intake documents (positioning, messaging, case studies, packaging) for signal guide generation',
    {
      company_name: z.string().describe('Company name'),
      product_description: z.string().optional().describe('What the product does'),
      positioning: z.string().optional().describe('Market positioning statement'),
      messaging: z.string().optional().describe('Core messaging/value prop'),
      case_studies: z
        .array(
          z.object({
            title: z.string(),
            summary: z.string(),
            metrics: z.array(z.string()).optional(),
          })
        )
        .optional()
        .describe('Customer case studies'),
      master_deck_summary: z.string().optional().describe('Summary of the master sales deck'),
      packaging: z
        .array(
          z.object({
            tier: z.string(),
            description: z.string(),
            price: z.string().optional(),
          })
        )
        .optional()
        .describe('Product packaging tiers'),
      target_industries: z.array(z.string()).optional().describe('Target industries'),
      target_personas: z
        .array(
          z.object({
            title: z.string(),
            painPoints: z.array(z.string()),
            goals: z.array(z.string()),
          })
        )
        .optional()
        .describe('Target buyer personas'),
      competitors: z
        .array(
          z.object({
            name: z.string(),
            positioning: z.string().optional(),
            weaknesses: z.array(z.string()).optional(),
          })
        )
        .optional()
        .describe('Known competitors'),
      tech_stack_adjacencies: z.array(z.string()).optional().describe('Adjacent tech stack integrations'),
    },
    async (params) => {
      const input: CustomerIntakeInput = {
        companyName: params.company_name,
        productDescription: params.product_description,
        positioning: params.positioning,
        messaging: params.messaging,
        caseStudies: params.case_studies,
        masterDeckSummary: params.master_deck_summary,
        packaging: params.packaging,
        targetIndustries: params.target_industries,
        targetPersonas: params.target_personas,
        competitors: params.competitors,
        techStackAdjacencies: params.tech_stack_adjacencies,
      };

      try {
        // Validate intake
        const processed = processIntake(input);

        // Persist to DB
        const [ctx] = await db
          .insert(customerContexts)
          .values({
            companyName: processed.companyName,
            productDescription: processed.productDescription,
            positioning: params.positioning,
            messaging: params.messaging,
            caseStudies: params.case_studies,
            masterDeckSummary: params.master_deck_summary,
            packaging: params.packaging,
            targetIndustries: processed.targetIndustries,
            targetPersonas: params.target_personas,
            competitors: params.competitors,
            techStackAdjacencies: processed.techAdjacencies,
            status: 'intake',
          })
          .returning();

        const summary = buildContextSummary(processed);

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `# Customer Context Ingested`,
                `**ID:** ${ctx.id}`,
                `**Company:** ${processed.companyName}`,
                `**Status:** intake`,
                ``,
                `## Extracted Profile`,
                summary,
                ``,
                `**Next step:** Run \`signal_guide_research_market\` with this context ID to enrich with market data, then \`signal_guide_generate\` to create the custom guide.`,
              ].join('\n'),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Failed to ingest customer context: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tool 2: Research market ───
  server.tool(
    'signal_guide_research_market',
    'Run web search to gather market research for a customer context (competitors, trends, tech landscape)',
    {
      customer_context_id: z.string().describe('Customer context UUID from ingest step'),
    },
    async ({ customer_context_id }) => {
      // Fetch context
      const [ctx] = await db
        .select()
        .from(customerContexts)
        .where(eq(customerContexts.id, customer_context_id))
        .limit(1);

      if (!ctx) {
        return {
          content: [{ type: 'text' as const, text: `Customer context not found: ${customer_context_id}` }],
          isError: true,
        };
      }

      try {
        // Update status
        await db
          .update(customerContexts)
          .set({ status: 'researching', updatedAt: new Date() })
          .where(eq(customerContexts.id, customer_context_id));

        // Reconstruct processed intake from DB fields
        const intake = processIntake({
          companyName: ctx.companyName,
          productDescription: ctx.productDescription ?? undefined,
          positioning: ctx.positioning ?? undefined,
          messaging: ctx.messaging ?? undefined,
          caseStudies: ctx.caseStudies ?? undefined,
          packaging: ctx.packaging ?? undefined,
          targetIndustries: ctx.targetIndustries ?? undefined,
          targetPersonas: ctx.targetPersonas ?? undefined,
          competitors: ctx.competitors ?? undefined,
          techStackAdjacencies: ctx.techStackAdjacencies ?? undefined,
        });

        const research = await researchMarket(intake, webSearch);

        // Persist research results
        await db
          .update(customerContexts)
          .set({ marketResearch: research, updatedAt: new Date() })
          .where(eq(customerContexts.id, customer_context_id));

        const text = [
          `# Market Research Complete`,
          `**Company:** ${ctx.companyName}`,
          ``,
          `## Industry Trends (${research.industryTrends.length})`,
          ...research.industryTrends.slice(0, 5).map((t) => `- ${t}`),
          ``,
          `## Competitor Insights (${research.competitorInsights.length})`,
          ...research.competitorInsights.slice(0, 5).map(
            (c) => `- **${c.competitor}:** ${c.findings.slice(0, 2).join('; ')}`
          ),
          ``,
          `## Market Dynamics (${research.marketDynamics.length})`,
          ...research.marketDynamics.slice(0, 3).map((d) => `- ${d}`),
          ``,
          `## Tech Landscape`,
          research.techLandscape.slice(0, 10).join(', '),
          ``,
          `**Next step:** Run \`signal_guide_generate\` to create the custom signal guide.`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Market research failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tool 3: Generate custom signal guide ───
  server.tool(
    'signal_guide_generate',
    'Generate a customized signal guide for a customer using LLM + master signals + market research',
    {
      customer_context_id: z.string().describe('Customer context UUID'),
    },
    async ({ customer_context_id }) => {
      const [ctx] = await db
        .select()
        .from(customerContexts)
        .where(eq(customerContexts.id, customer_context_id))
        .limit(1);

      if (!ctx) {
        return {
          content: [{ type: 'text' as const, text: `Customer context not found: ${customer_context_id}` }],
          isError: true,
        };
      }

      try {
        // Update status
        await db
          .update(customerContexts)
          .set({ status: 'generating', updatedAt: new Date() })
          .where(eq(customerContexts.id, customer_context_id));

        // Build inputs
        const intake = processIntake({
          companyName: ctx.companyName,
          productDescription: ctx.productDescription ?? undefined,
          positioning: ctx.positioning ?? undefined,
          messaging: ctx.messaging ?? undefined,
          caseStudies: ctx.caseStudies ?? undefined,
          packaging: ctx.packaging ?? undefined,
          targetIndustries: ctx.targetIndustries ?? undefined,
          targetPersonas: ctx.targetPersonas ?? undefined,
          competitors: ctx.competitors ?? undefined,
          techStackAdjacencies: ctx.techStackAdjacencies ?? undefined,
        });

        const research = ctx.marketResearch ?? {
          industryTrends: [],
          competitorInsights: [],
          marketDynamics: [],
          techLandscape: [],
        };

        // Ensure signal templates are seeded
        const existingTemplates = await db.select().from(signalTemplates).limit(1);
        if (existingTemplates.length === 0) {
          // Seed from master signals constant
          for (const signal of MASTER_SIGNALS) {
            await db.insert(signalTemplates).values({
              signalName: signal.signalName,
              whyItMatters: signal.whyItMatters,
              strength: signal.strength,
              tag: signal.tag,
              channel: signal.channel,
              funnelStage: signal.funnelStage,
              hasPlaybook: signal.hasPlaybook,
              playbook: signal.playbook,
              categoryOrder: signal.categoryOrder,
            });
          }
        }

        // Generate custom guide
        const generatedSignals = await generateCustomGuide(
          { masterSignals: MASTER_SIGNALS, intake, research },
          llm
        );

        // Fetch template IDs for persistence
        const templates = await db.select().from(signalTemplates);
        const templateByName = new Map(templates.map((t) => [t.signalName, t.id]));

        // Persist generated signals
        for (const signal of generatedSignals) {
          const templateId = templateByName.get(signal.masterSignal.signalName);
          if (!templateId) continue;

          await db.insert(customSignalGuides).values({
            customerContextId: customer_context_id,
            signalTemplateId: templateId,
            customizedName: signal.customizedName,
            customizedDescription: signal.customizedDescription,
            customizedPlaybook: signal.customizedPlaybook,
            strength: signal.masterSignal.strength,
            tag: signal.masterSignal.tag,
            channel: signal.masterSignal.channel,
            funnelStage: signal.masterSignal.funnelStage,
            relevanceScore: signal.relevanceScore,
            exampleTriggers: signal.exampleTriggers,
            active: signal.active,
          });
        }

        // Update status
        await db
          .update(customerContexts)
          .set({ status: 'complete', updatedAt: new Date() })
          .where(eq(customerContexts.id, customer_context_id));

        // Summarize
        const summary = summarizeGuide(generatedSignals);
        summary.customerContextId = customer_context_id;

        const text = [
          `# Custom Signal Guide Generated`,
          `**Company:** ${ctx.companyName}`,
          `**Total Signals:** ${summary.totalSignals}`,
          `**Active:** ${summary.activeSignals} | **Inactive:** ${summary.inactiveSignals}`,
          ``,
          `## By Category`,
          ...Object.entries(summary.byTag).map(
            ([tag, data]) =>
              `- **${tag}:** ${data.active}/${data.total} active (avg relevance: ${data.avgRelevance})`
          ),
          ``,
          `## Top 10 Signals`,
          ...summary.topSignals.map(
            (s, i) => `${i + 1}. **${s.name}** — Relevance: ${s.relevance} (${s.tag})`
          ),
          ``,
          `**Next step:** Run \`signal_guide_get_guide\` to retrieve the full customized guide.`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Guide generation failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tool 4: Get generated guide ───
  server.tool(
    'signal_guide_get_guide',
    'Retrieve the full customized signal guide for a customer, with filtering options',
    {
      customer_context_id: z.string().describe('Customer context UUID'),
      active_only: z.boolean().optional().default(true).describe('Only return active signals'),
      tag: z
        .enum(['sales_led', 'product_led', 'nearbound', 'event', 'competitor', 'community_led'])
        .optional()
        .describe('Filter by signal category'),
      min_relevance: z.number().optional().default(0).describe('Minimum relevance score (0-100)'),
    },
    async ({ customer_context_id, active_only, tag, min_relevance }) => {
      const [ctx] = await db
        .select()
        .from(customerContexts)
        .where(eq(customerContexts.id, customer_context_id))
        .limit(1);

      if (!ctx) {
        return {
          content: [{ type: 'text' as const, text: `Customer context not found: ${customer_context_id}` }],
          isError: true,
        };
      }

      let guides = await db
        .select()
        .from(customSignalGuides)
        .where(eq(customSignalGuides.customerContextId, customer_context_id));

      if (guides.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No guide found for context ${customer_context_id}. Run \`signal_guide_generate\` first.`,
            },
          ],
          isError: true,
        };
      }

      // Apply filters
      if (active_only) {
        guides = guides.filter((g) => g.active);
      }
      if (tag) {
        guides = guides.filter((g) => g.tag === tag);
      }
      if (min_relevance && min_relevance > 0) {
        guides = guides.filter((g) => g.relevanceScore >= min_relevance);
      }

      // Sort by relevance descending
      guides.sort((a, b) => b.relevanceScore - a.relevanceScore);

      const sections: string[] = [
        `# Custom Signal Guide: ${ctx.companyName}`,
        `**Signals:** ${guides.length}${active_only ? ' (active only)' : ''}${tag ? ` | Category: ${tag}` : ''}`,
        ``,
      ];

      // Group by tag
      const grouped: Record<string, typeof guides> = {};
      for (const g of guides) {
        if (!grouped[g.tag]) grouped[g.tag] = [];
        grouped[g.tag].push(g);
      }

      for (const [category, signals] of Object.entries(grouped)) {
        sections.push(`## ${category.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`);
        sections.push('');
        for (const s of signals) {
          sections.push(`### ${s.customizedName}`);
          sections.push(`**Relevance:** ${s.relevanceScore}/100 | **Strength:** ${s.strength} | **Stage:** ${s.funnelStage}`);
          sections.push(`${s.customizedDescription}`);
          if (s.customizedPlaybook) {
            sections.push(`**Playbook:** ${s.customizedPlaybook}`);
          }
          if (s.exampleTriggers && s.exampleTriggers.length > 0) {
            sections.push(`**Example Triggers:**`);
            for (const t of s.exampleTriggers) {
              sections.push(`- ${t}`);
            }
          }
          sections.push('');
        }
      }

      return { content: [{ type: 'text' as const, text: sections.join('\n') }] };
    }
  );
}
