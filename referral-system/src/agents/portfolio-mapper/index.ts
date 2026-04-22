import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { buildGraph, findSecondOrderOpportunities, buildPortfolioMaps } from './graph-builder.js';
import { researchCorporateRelationships, discoverPortfolioSiblings } from './research-enricher.js';
import type { EntityRelationship, CorporateEntity as EntityType } from './types.js';
import {
  accounts,
  corporateEntities,
  entityRelationships,
  portfolioOpportunities,
} from '../../db/schema.js';

export function registerPortfolioMapperTools(server: McpServer, deps: ServerDeps) {
  const { db, webSearch, enrichment } = deps;

  // ─── Tool 1: Map corporate relationships for a company ───
  server.tool(
    'portfolio_map_company',
    'Discover corporate relationships (investors, parent companies, subsidiaries) for a company using web search and enrichment data',
    {
      company_name: z.string().describe('Company to research'),
      include_siblings: z.boolean().optional().default(true).describe('Also discover portfolio siblings'),
    },
    async ({ company_name, include_siblings }) => {
      try {
        const relationships = await researchCorporateRelationships(company_name, webSearch, enrichment);

        // Persist entities and relationships
        for (const rel of relationships) {
          const parentId = await upsertEntity(db, rel.parentEntity);
          const childId = await upsertEntity(db, rel.childEntity);

          await db.insert(entityRelationships).values({
            parentEntityId: parentId,
            childEntityId: childId,
            relationType: rel.relationType,
            confidence: rel.confidence.toFixed(2),
            source: rel.source,
          });
        }

        // Discover siblings if requested
        let siblingCount = 0;
        if (include_siblings) {
          const investors = relationships
            .filter((r) => r.relationType === 'pe_portfolio' || r.relationType === 'vc_portfolio')
            .map((r) => r.parentEntity.name);

          for (const investor of investors) {
            const siblings = await discoverPortfolioSiblings(investor, webSearch);
            for (const sibling of siblings) {
              if (sibling.toLowerCase() === company_name.toLowerCase()) continue;
              const investorId = await upsertEntity(db, { name: investor, entityType: 'investor' });
              const siblingId = await upsertEntity(db, { name: sibling, entityType: 'company' });
              await db.insert(entityRelationships).values({
                parentEntityId: investorId,
                childEntityId: siblingId,
                relationType: relationships.find((r) => r.parentEntity.name === investor)?.relationType ?? 'vc_portfolio',
                confidence: '0.60',
                source: 'web_search',
              });
              siblingCount++;
            }
          }
        }

        const text = [
          `# Corporate Relationship Map: ${company_name}`,
          `**Direct Relationships Found:** ${relationships.length}`,
          siblingCount > 0 ? `**Portfolio Siblings Discovered:** ${siblingCount}` : '',
          ``,
          `## Relationships`,
          ...relationships.map((r) =>
            `- **${r.parentEntity.name}** → ${company_name} (${r.relationType}, confidence: ${(r.confidence * 100).toFixed(0)}%)`
          ),
          ``,
          `**Next step:** Run \`portfolio_find_opportunities\` to discover second-order referral paths.`,
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { content: [{ type: 'text' as const, text: `Mapping failed: ${message}` }], isError: true };
      }
    }
  );

  // ─── Tool 2: Find second-order referral opportunities ───
  server.tool(
    'portfolio_find_opportunities',
    'Analyze the corporate relationship graph to find second-order referral opportunities (customer → shared investor/parent → non-customer target)',
    {
      min_confidence: z.number().optional().default(0.5).describe('Minimum confidence threshold (0-1)'),
      max_results: z.number().optional().default(20).describe('Max opportunities to return'),
    },
    async ({ min_confidence, max_results }) => {
      // Load all entities and relationships from DB
      const entities = await db.select().from(corporateEntities);
      const rels = await db.select().from(entityRelationships);
      const accts = await db.select().from(accounts);

      // Map account names to entity data
      const customerAccounts = accts.map((a) => ({
        name: a.companyName,
        accountId: a.id,
        industry: a.industry ?? undefined,
      }));

      // Build entity relationship objects
      const entityMap = new Map(entities.map((e) => [e.id, e]));
      const relationships: EntityRelationship[] = rels.map((r) => {
        const parent = entityMap.get(r.parentEntityId);
        const child = entityMap.get(r.childEntityId);
        return {
          parentEntity: {
            name: parent?.name ?? 'Unknown',
            entityType: (parent?.entityType ?? 'company') as EntityType['entityType'],
            industry: parent?.industry ?? undefined,
          },
          childEntity: {
            name: child?.name ?? 'Unknown',
            entityType: (child?.entityType ?? 'company') as EntityType['entityType'],
            industry: child?.industry ?? undefined,
          },
          relationType: r.relationType,
          confidence: parseFloat(r.confidence),
          source: r.source,
        };
      });

      const { nodes, edges } = buildGraph(relationships, customerAccounts);
      let opportunities = findSecondOrderOpportunities(nodes, edges);

      // Apply filters
      opportunities = opportunities.filter((o) => o.confidence >= (min_confidence ?? 0.5));
      opportunities = opportunities.slice(0, max_results ?? 20);

      if (opportunities.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No second-order referral opportunities found above confidence threshold. Try mapping more companies with `portfolio_map_company`.',
          }],
        };
      }

      // Persist opportunities
      for (const opp of opportunities) {
        const intermediaryEntity = entities.find((e) => e.name === opp.intermediary);
        await db.insert(portfolioOpportunities).values({
          sourceAccountId: opp.sourceAccountId,
          targetCompany: opp.targetCompany,
          intermediaryEntityId: intermediaryEntity?.id,
          connectionType: opp.connectionType,
          connectionPath: opp.connectionPath,
          confidence: opp.confidence.toFixed(2),
          rationale: opp.rationale,
          suggestedApproach: opp.suggestedApproach,
        });
      }

      const text = [
        `# Second-Order Referral Opportunities`,
        `**Found:** ${opportunities.length} opportunities`,
        ``,
        ...opportunities.map((o, i) => [
          `### ${i + 1}. ${o.targetCompany}`,
          `**Path:** ${o.connectionPath}`,
          `**Type:** ${o.connectionType} | **Confidence:** ${(o.confidence * 100).toFixed(0)}%`,
          `**Rationale:** ${o.rationale}`,
          `**Approach:** ${o.suggestedApproach}`,
          '',
        ].join('\n')),
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ─── Tool 3: Get portfolio maps ───
  server.tool(
    'portfolio_get_maps',
    'Get portfolio maps showing investor/holding company groupings and customer overlap',
    {
      investor_name: z.string().optional().describe('Filter to a specific investor'),
    },
    async ({ investor_name }) => {
      const entities = await db.select().from(corporateEntities);
      const rels = await db.select().from(entityRelationships);
      const accts = await db.select().from(accounts);

      const customerAccounts = accts.map((a) => ({
        name: a.companyName,
        accountId: a.id,
        industry: a.industry ?? undefined,
      }));

      const entityMap = new Map(entities.map((e) => [e.id, e]));
      const relationships: EntityRelationship[] = rels.map((r) => {
        const parent = entityMap.get(r.parentEntityId);
        const child = entityMap.get(r.childEntityId);
        return {
          parentEntity: {
            name: parent?.name ?? 'Unknown',
            entityType: (parent?.entityType ?? 'company') as EntityType['entityType'],
          },
          childEntity: {
            name: child?.name ?? 'Unknown',
            entityType: (child?.entityType ?? 'company') as EntityType['entityType'],
          },
          relationType: r.relationType,
          confidence: parseFloat(r.confidence),
          source: r.source,
        };
      });

      const { nodes, edges } = buildGraph(relationships, customerAccounts);
      let portfolios = buildPortfolioMaps(nodes, edges);

      if (investor_name) {
        portfolios = portfolios.filter((p) =>
          p.investorName.toLowerCase().includes(investor_name.toLowerCase())
        );
      }

      if (portfolios.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No portfolio maps found. Run `portfolio_map_company` first.' }],
        };
      }

      const text = [
        `# Portfolio Maps`,
        `**Total Portfolios:** ${portfolios.length}`,
        ``,
        ...portfolios.map((p) => [
          `## ${p.investorName} (${p.investorType})`,
          `**Portfolio Size:** ${p.totalCompanies} | **Your Customers:** ${p.customerOverlap}`,
          ``,
          `| Company | Industry | Customer? |`,
          `|---------|----------|-----------|`,
          ...p.portfolioCompanies.map((c) =>
            `| ${c.name} | ${c.industry ?? '—'} | ${c.isCustomer ? '✓' : '—'} |`
          ),
          '',
        ].join('\n')),
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ─── Tool 4: Get opportunity details ───
  server.tool(
    'portfolio_get_opportunities',
    'Retrieve saved portfolio referral opportunities with status filtering',
    {
      status: z.enum(['identified', 'pursuing', 'converted', 'dismissed']).optional().describe('Filter by status'),
      source_account_id: z.string().optional().describe('Filter by source account'),
    },
    async ({ status, source_account_id }) => {
      let opps = await db.select().from(portfolioOpportunities);

      if (status) {
        opps = opps.filter((o) => o.status === status);
      }
      if (source_account_id) {
        opps = opps.filter((o) => o.sourceAccountId === source_account_id);
      }

      opps.sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence));

      const accts = await db.select().from(accounts);
      const accountMap = new Map(accts.map((a) => [a.id, a.companyName]));

      const text = [
        `# Portfolio Referral Opportunities`,
        `**Total:** ${opps.length}${status ? ` (${status})` : ''}`,
        ``,
        ...opps.map((o, i) => [
          `### ${i + 1}. ${o.targetCompany}`,
          `**Source:** ${accountMap.get(o.sourceAccountId) ?? 'Unknown'}`,
          `**Path:** ${o.connectionPath}`,
          `**Type:** ${o.connectionType} | **Confidence:** ${(parseFloat(o.confidence) * 100).toFixed(0)}% | **Status:** ${o.status}`,
          o.estimatedAcv ? `**Est. ACV:** $${parseFloat(o.estimatedAcv).toLocaleString()}` : '',
          `**Rationale:** ${o.rationale}`,
          `**Approach:** ${o.suggestedApproach}`,
          '',
        ].filter(Boolean).join('\n')),
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );
}

// ─── Helper ───

async function upsertEntity(
  db: any,
  entity: { name: string; entityType: string; industry?: string }
): Promise<string> {
  const [existing] = await db
    .select()
    .from(corporateEntities)
    .where(eq(corporateEntities.name, entity.name))
    .limit(1);

  if (existing) return existing.id;

  const [inserted] = await db
    .insert(corporateEntities)
    .values({
      name: entity.name,
      entityType: entity.entityType,
      industry: entity.industry,
    })
    .returning();

  return inserted.id;
}
