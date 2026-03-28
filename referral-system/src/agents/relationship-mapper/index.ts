import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { analyzeNetwork } from './network-analyzer.js';
import { matchTargets, type TargetAccount } from './target-matcher.js';
import { accounts, champions, connectionMaps } from '../../db/schema.js';
import { toMarkdownTable } from '../../shared/formatting.js';

export function registerMapperTools(server: McpServer, deps: ServerDeps) {
  const { db, cache, enrichment, intent } = deps;

  // ─── Tool 1: Map champion network ───
  server.tool(
    'referral_mapper_map_champion_network',
    'Map a champion\'s professional network against ICP and target accounts',
    {
      champion_id: z.string().describe('Champion UUID'),
      target_account_ids: z.array(z.string()).optional().describe('Named target account UUIDs to cross-reference'),
      icp_criteria: z.object({
        industries: z.array(z.string()).optional(),
        min_employees: z.number().optional(),
        max_employees: z.number().optional(),
        buyer_titles: z.array(z.string()).optional(),
      }).optional().describe('ICP matching criteria'),
      max_results: z.number().optional().default(10).describe('Max connections to return'),
    },
    async ({ champion_id, target_account_ids, icp_criteria, max_results }) => {
      // Fetch champion
      const [champion] = await db.select().from(champions).where(eq(champions.id, champion_id)).limit(1);
      if (!champion) {
        return { content: [{ type: 'text' as const, text: `Champion not found: ${champion_id}` }], isError: true };
      }

      // Fetch champion's account for company name
      const [account] = await db.select().from(accounts).where(eq(accounts.id, champion.accountId)).limit(1);
      const accountCompanyName = account?.companyName ?? 'Unknown';

      // Check cache for enrichment data
      const cacheKey = `enrichment:champion:${champion_id}`;
      let connections = await cache.get<Awaited<ReturnType<typeof enrichment.getConnections>>>(cacheKey);
      if (!connections) {
        // Fetch from enrichment
        connections = await enrichment.getConnections(champion_id);
        await cache.set(cacheKey, connections);
      }

      // Resolve target account names
      const targetAccountNames: string[] = [];
      const targetPriorities = new Map<string, number>();
      if (target_account_ids) {
        for (const id of target_account_ids) {
          const [a] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
          if (a) {
            targetAccountNames.push(a.companyName);
            targetPriorities.set(a.companyName, 8); // Named targets get high priority
          }
        }
      }

      // Get enriched profile
      const enrichedProfile = await enrichment.enrichPerson({
        name: champion.name,
        email: champion.email ?? undefined,
        linkedinUrl: champion.linkedinUrl ?? undefined,
      });

      // Analyze network
      const analysis = analyzeNetwork({
        champion,
        accountCompanyName,
        connections,
        enrichedProfile,
        targetAccountNames,
        icpCriteria: icp_criteria ? {
          industries: icp_criteria.industries,
          minEmployees: icp_criteria.min_employees,
          maxEmployees: icp_criteria.max_employees,
          buyerTitles: icp_criteria.buyer_titles,
        } : undefined,
        targetAccountPriorities: targetPriorities,
      });

      // Persist high-value connections to DB
      for (const conn of [...analysis.highValueIntros, ...analysis.moderateValueIntros].slice(0, max_results)) {
        await db.insert(connectionMaps).values({
          championId: champion.id,
          targetCompany: conn.targetCompany,
          targetContact: conn.targetContact,
          targetTitle: conn.targetTitle,
          targetLinkedinUrl: conn.targetLinkedinUrl,
          connectionPath: conn.connectionPath,
          connectionStrengthScore: conn.connectionStrengthScore,
          targetAccountPriority: conn.targetAccountPriority,
          roleMatchScore: conn.roleMatchScore,
          painAlignmentScore: conn.painAlignmentScore,
          timingSignalScore: conn.timingSignalScore,
          compositeScore: conn.compositeScore,
          suggestedFraming: conn.suggestedFraming,
          existingRelationship: conn.existingRelationship,
        });
      }

      // Format output
      const lines = [
        `# Network Analysis: ${champion.name}`,
        `**${champion.title}** at ${accountCompanyName} | Network Reach: ${analysis.champion.networkReachScore}/100`,
        `Analyzed ${analysis.totalConnectionsAnalyzed} connections`,
        '',
      ];

      if (analysis.highValueIntros.length > 0) {
        lines.push(`## High-Value Introductions (${analysis.highValueIntros.length})`);
        for (const intro of analysis.highValueIntros.slice(0, max_results)) {
          lines.push(`- **${intro.targetContact}** (${intro.targetTitle}) at **${intro.targetCompany}** — Score: ${intro.compositeScore}/10`);
          lines.push(`  Path: ${intro.connectionPath}`);
          lines.push(`  Framing: ${intro.suggestedFraming}`);
          if (intro.existingRelationship) {
            lines.push(`  ⚠ Existing relationship: ${intro.existingRelationship}`);
          }
        }
        lines.push('');
      }

      if (analysis.moderateValueIntros.length > 0) {
        lines.push(`## Moderate-Value Introductions (${analysis.moderateValueIntros.length})`);
        for (const intro of analysis.moderateValueIntros.slice(0, 5)) {
          lines.push(`- **${intro.targetContact}** (${intro.targetTitle}) at **${intro.targetCompany}** — Score: ${intro.compositeScore}/10`);
        }
        lines.push('');
      }

      if (analysis.networkGaps.length > 0) {
        lines.push(`## Network Gaps (${analysis.networkGaps.length})`);
        for (const gap of analysis.networkGaps) {
          lines.push(`- **${gap.targetAccount}**: ${gap.reason}`);
          lines.push(`  Alternative: ${gap.alternativeApproach}`);
        }
        lines.push('');
      }

      if (analysis.reverseReferralOpportunities.length > 0) {
        lines.push(`## Reverse Referral Opportunities`);
        for (const rev of analysis.reverseReferralOpportunities) {
          lines.push(`- **${rev.contact}** (${rev.title} at ${rev.company}): ${rev.reason}`);
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ─── Tool 2: Find warm paths to a specific target ───
  server.tool(
    'referral_mapper_find_warm_paths',
    'Find all warm introduction paths to a specific target account through existing customers',
    {
      target_company: z.string().describe('Target company name'),
      target_contact: z.string().optional().describe('Specific person to reach'),
      target_title: z.string().optional().describe('Target buyer title'),
    },
    async ({ target_company, target_contact, target_title }) => {
      // Find all champions and check their connections
      const allChampions = await db.select().from(champions);
      const paths: {
        champion: { id: string; name: string; company: string };
        connectionPath: string;
        compositeScore: number;
        suggestedFraming: string;
      }[] = [];

      for (const champ of allChampions) {
        // Check DB for existing connection maps
        const existingMaps = await db
          .select()
          .from(connectionMaps)
          .where(eq(connectionMaps.championId, champ.id));

        const matchingMaps = existingMaps.filter(
          (m) => m.targetCompany.toLowerCase() === target_company.toLowerCase() &&
            (!target_contact || m.targetContact.toLowerCase().includes(target_contact.toLowerCase()))
        );

        const [account] = await db.select().from(accounts).where(eq(accounts.id, champ.accountId)).limit(1);

        for (const map of matchingMaps) {
          paths.push({
            champion: { id: champ.id, name: champ.name, company: account?.companyName ?? 'Unknown' },
            connectionPath: map.connectionPath,
            compositeScore: map.compositeScore ?? 0,
            suggestedFraming: map.suggestedFraming ?? '',
          });
        }

        // Also check enrichment for connections not yet in DB
        if (matchingMaps.length === 0) {
          const connections = await enrichment.getConnections(champ.id);
          const targetConnections = connections.filter(
            (c) => c.company.toLowerCase() === target_company.toLowerCase() &&
              (!target_contact || c.name.toLowerCase().includes(target_contact.toLowerCase()))
          );

          for (const conn of targetConnections) {
            paths.push({
              champion: { id: champ.id, name: champ.name, company: account?.companyName ?? 'Unknown' },
              connectionPath: `${champ.name} → ${conn.name} (${conn.title}) at ${conn.company}`,
              compositeScore: conn.connectionStrength,
              suggestedFraming: `${champ.name} can introduce you to ${conn.name} at ${target_company}.`,
            });
          }
        }
      }

      // Sort by score
      paths.sort((a, b) => b.compositeScore - a.compositeScore);

      if (paths.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `# No Warm Paths Found\n\nNo existing customer champions have connections to **${target_company}**${target_contact ? ` (${target_contact})` : ''}.\n\n**Suggestions:**\n- Enrich more champion profiles to discover hidden connections\n- Check LinkedIn Sales Navigator for indirect paths\n- Consider cold outreach with social proof from similar customers`,
          }],
        };
      }

      const bestPath = paths[0];
      const lines = [
        `# Warm Paths to ${target_company}`,
        target_contact ? `Target: **${target_contact}**${target_title ? ` (${target_title})` : ''}` : '',
        `Found **${paths.length}** introduction path(s)`,
        '',
        `## Best Path (Score: ${bestPath.compositeScore}/10)`,
        `**Via:** ${bestPath.champion.name} (${bestPath.champion.company})`,
        `**Path:** ${bestPath.connectionPath}`,
        `**Framing:** ${bestPath.suggestedFraming}`,
        '',
      ];

      if (paths.length > 1) {
        lines.push(`## Alternative Paths`);
        for (const path of paths.slice(1, 5)) {
          lines.push(`- Via **${path.champion.name}** (${path.champion.company}) — Score: ${path.compositeScore}/10`);
          lines.push(`  ${path.connectionPath}`);
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ─── Tool 3: Enrich champion profile ───
  server.tool(
    'referral_mapper_enrich_champion',
    'Enrich a champion\'s profile with network data from enrichment APIs',
    {
      champion_id: z.string().describe('Champion UUID'),
      linkedin_url: z.string().optional().describe('LinkedIn URL for enrichment'),
    },
    async ({ champion_id, linkedin_url }) => {
      const [champion] = await db.select().from(champions).where(eq(champions.id, champion_id)).limit(1);
      if (!champion) {
        return { content: [{ type: 'text' as const, text: `Champion not found: ${champion_id}` }], isError: true };
      }

      const enriched = await enrichment.enrichPerson({
        name: champion.name,
        email: champion.email ?? undefined,
        linkedinUrl: linkedin_url ?? champion.linkedinUrl ?? undefined,
      });

      const connections = await enrichment.getConnections(champion_id);
      const icpConnections = connections.filter((c) => {
        const titleLower = c.title.toLowerCase();
        return ['cto', 'cio', 'vp', 'head of', 'director', 'chief'].some((t) => titleLower.includes(t));
      });

      // Update champion record with enrichment data
      await db.update(champions).set({
        networkReachScore: enriched.networkReachScore,
        formerCompanies: enriched.formerCompanies,
        industryCommunities: enriched.industryCommunities,
        seniorityLevel: enriched.seniorityLevel ?? champion.seniorityLevel,
        linkedinUrl: linkedin_url ?? champion.linkedinUrl,
        updatedAt: new Date(),
      }).where(eq(champions.id, champion_id));

      // Invalidate cache
      await cache.invalidate(`enrichment:champion:${champion_id}`);

      const lines = [
        `# Enrichment: ${champion.name}`,
        '',
        `**Network Reach Score:** ${enriched.networkReachScore}/100`,
        `**Former Companies:** ${enriched.formerCompanies.join(', ') || 'None found'}`,
        `**Industry Communities:** ${enriched.industryCommunities.join(', ') || 'None found'}`,
        `**ICP-Matching Connections:** ${icpConnections.length}`,
        '',
      ];

      if (enriched.notableConnections.length > 0) {
        lines.push('## Notable Connections');
        for (const nc of enriched.notableConnections) {
          lines.push(`- **${nc.name}** — ${nc.title} at ${nc.company}`);
        }
      }

      lines.push('', `*Champion record updated with enrichment data.*`);

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );
}
