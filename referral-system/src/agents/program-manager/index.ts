import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { createReferral, updateReferral } from './ledger.js';
import { accounts, champions, referrals } from '../../db/schema.js';
import { formatCurrency } from '../../shared/formatting.js';

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
}
