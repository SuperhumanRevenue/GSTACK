import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { composeLiveAsk, composeAsyncAsk, composeSoftSeed, recommendVersion } from './template-engine.js';
import { routeResponse } from './response-router.js';
import type { ComposeInput } from './types.js';
import { accounts, champions, connectionMaps, referrals } from '../../db/schema.js';

export function registerAskTools(server: McpServer, deps: ServerDeps) {
  const { db } = deps;

  // ─── Tool 1: Compose referral ask ───
  server.tool(
    'referral_ask_compose',
    'Generate a referral ask in three versions (live, async, soft seed) tailored to the champion, value moment, and target',
    {
      champion_id: z.string().describe('Champion UUID'),
      connection_map_id: z.string().describe('Connection map UUID'),
      trigger_event: z.string().describe('The trigger event to reference'),
      results_to_reference: z.string().describe('Specific results to anchor the ask'),
      acv_range: z.enum(['30k_75k', '75k_250k', '250k_plus', '1m_plus']).describe('ACV range of the target deal'),
      champion_communication_style: z.enum(['formal', 'casual']).optional().default('casual'),
      has_upcoming_meeting: z.boolean().optional().default(false),
      trigger_recency: z.enum(['recent', 'moderate', 'old']).optional().default('recent'),
    },
    async ({ champion_id, connection_map_id, trigger_event, results_to_reference, acv_range, champion_communication_style, has_upcoming_meeting, trigger_recency }) => {
      // Fetch champion
      const [champion] = await db.select().from(champions).where(eq(champions.id, champion_id)).limit(1);
      if (!champion) return { content: [{ type: 'text' as const, text: `Champion not found: ${champion_id}` }], isError: true };

      // Fetch connection map
      const [connMap] = await db.select().from(connectionMaps).where(eq(connectionMaps.id, connection_map_id)).limit(1);
      if (!connMap) return { content: [{ type: 'text' as const, text: `Connection map not found: ${connection_map_id}` }], isError: true };

      // Fetch account
      const [account] = await db.select().from(accounts).where(eq(accounts.id, champion.accountId)).limit(1);

      const input: ComposeInput = {
        championName: champion.name,
        championTitle: champion.title,
        championCompany: account?.companyName ?? 'your company',
        targetContact: connMap.targetContact,
        targetTitle: connMap.targetTitle,
        targetCompany: connMap.targetCompany,
        triggerEvent: trigger_event,
        resultsToReference: results_to_reference,
        acvRange: acv_range,
        communicationStyle: champion_communication_style,
        connectionPath: connMap.connectionPath,
      };

      const recommendation = recommendVersion({
        relationshipStrength: champion.relationshipStrength ?? 'warm',
        communicationStyle: champion_communication_style,
        triggerRecency: trigger_recency,
        hasUpcomingMeeting: has_upcoming_meeting,
      });

      const liveAsk = composeLiveAsk(input);
      const asyncAsk = composeAsyncAsk(input);
      const softSeed = composeSoftSeed(input);

      const lines = [
        `# Referral Ask: ${champion.name} → ${connMap.targetContact} at ${connMap.targetCompany}`,
        '',
        `**Recommended Version:** ${recommendation.version.toUpperCase()}`,
        `**Reason:** ${recommendation.reason}`,
        '',
        '---',
        '',
        '## Live Ask (Script)',
        '',
        liveAsk.script,
        '',
        `**Key Mechanics:** ${liveAsk.keyMechanics.join(' | ')}`,
        '',
        '---',
        '',
        '## Async Ask (Email/Slack)',
        '',
        `**Subject:** ${asyncAsk.subject}`,
        '',
        asyncAsk.body,
        '',
        `**Key Mechanics:** ${asyncAsk.keyMechanics.join(' | ')}`,
        '',
        '---',
        '',
        '## Soft Seed',
        '',
        softSeed.message,
        '',
        `**Key Mechanics:** ${softSeed.keyMechanics.join(' | ')}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ─── Tool 2: Handle response ───
  server.tool(
    'referral_ask_handle_response',
    'Generate appropriate follow-up based on champion\'s response to the ask',
    {
      referral_id: z.string().describe('Referral UUID'),
      response: z.enum(['yes', 'maybe', 'no']).describe('Champion\'s response'),
      context: z.string().optional().describe('Additional context from the champion'),
    },
    async ({ referral_id, response, context }) => {
      // Fetch referral
      const [referral] = await db.select().from(referrals).where(eq(referrals.id, referral_id)).limit(1);
      if (!referral) return { content: [{ type: 'text' as const, text: `Referral not found: ${referral_id}` }], isError: true };

      // Fetch champion
      const [champion] = await db.select().from(champions).where(eq(champions.id, referral.championId)).limit(1);
      if (!champion) return { content: [{ type: 'text' as const, text: `Champion not found` }], isError: true };

      // Fetch account
      const [account] = await db.select().from(accounts).where(eq(accounts.id, referral.accountId)).limit(1);

      const result = routeResponse({
        response,
        championName: champion.name,
        championCompany: account?.companyName ?? '',
        targetContact: referral.targetContact,
        targetTitle: referral.targetTitle,
        targetCompany: referral.targetCompany,
        triggerEvent: referral.triggerEvent,
        context,
        owningAe: referral.owningAe ?? 'Your AE',
      });

      // Update referral record
      await db.update(referrals).set({
        response,
        responseDate: new Date(),
        status: response === 'yes' ? 'intro_pending' : response === 'no' ? 'declined' : 'ask_sent',
        updatedAt: new Date(),
      }).where(eq(referrals.id, referral_id));

      // Format output based on response type
      const lines = [`# Response: ${response.toUpperCase()} — ${champion.name} → ${referral.targetCompany}`, ''];

      if (result.type === 'yes') {
        const assets = result.assets as import('./types.js').YesResponseAssets;
        lines.push(
          '## Intro Email (for champion to forward)',
          '', assets.introEmailTemplate, '',
          '---',
          '## AE First Response (to referred contact)',
          '', assets.aeFirstResponse, '',
          '---',
          '## Champion Thank-You',
          '', assets.championThankYou,
        );
      } else if (result.type === 'maybe') {
        const assets = result.assets as import('./types.js').MaybeResponseAssets;
        lines.push(
          '## Day 5 Follow-Up',
          '', assets.day5Followup, '',
          '---',
          '## Day 12 Final Nudge',
          '', assets.day12FinalNudge, '',
          '---',
          '## Friction Remover (pre-drafted intro)',
          '', assets.frictionRemover,
        );
      } else {
        const assets = result.assets as import('./types.js').NoResponseAssets;
        lines.push(
          '## Graceful Close',
          '', assets.gracefulClose, '',
          '---',
          '## Alternative Ask (Case Study)',
          '', assets.alternativeAsk,
        );
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ─── Tool 3: Get templates ───
  server.tool(
    'referral_ask_get_templates',
    'Retrieve ask templates filtered by ACV range, industry, and trigger type',
    {
      acv_range: z.enum(['30k_75k', '75k_250k', '250k_plus', '1m_plus']).optional(),
      industry: z.string().optional(),
      trigger_type: z.string().optional(),
    },
    async ({ acv_range, industry, trigger_type }) => {
      // For Phase 3, return template guidance rather than a template database
      const lines = [
        '# Ask Template Guidance',
        '',
        `**ACV Range:** ${acv_range ?? 'All'}`,
        `**Industry:** ${industry ?? 'All'}`,
        `**Trigger Type:** ${trigger_type ?? 'All'}`,
        '',
        '## Template Structure',
        '',
        '### Live Ask',
        '1. Open with value anchor (reference their results)',
        '2. Name the specific target person (never "anyone you know")',
        '3. Explain the connection naturally',
        '4. Offer to draft the intro email',
        '',
        '### Async Ask (< 100 words)',
        '1. Subject line names the target',
        '2. Reference trigger event + results',
        '3. One clear ask',
        '4. Offer friction remover',
        '',
        '### Soft Seed',
        '1. No direct ask',
        '2. Reference results naturally',
        '3. Name the target to make it concrete',
        '4. "Just planting a thought"',
        '',
        '## ACV-Specific Notes',
      ];

      if (!acv_range || acv_range === '30k_75k') {
        lines.push('- **$30K-$75K:** Keep it casual, quick. Champion time = valuable. One-touch ask preferred.');
      }
      if (!acv_range || acv_range === '75k_250k') {
        lines.push('- **$75K-$250K:** Balance warmth with professionalism. Multi-touch OK. Personalize heavily.');
      }
      if (!acv_range || acv_range === '250k_plus') {
        lines.push('- **$250K+:** Executive tone. Reference strategic value, not features. Peer-to-peer framing.');
      }
      if (!acv_range || acv_range === '1m_plus') {
        lines.push('- **$1M+:** Board-level framing. This is a strategic relationship, not a sales ask. Human review required.');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );
}
