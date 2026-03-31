import type { ServerDeps } from '../shared/types.js';
import { eq } from 'drizzle-orm';
import { accounts, triggerEvents, champions } from '../db/schema.js';
import { scoreReadiness } from '../agents/readiness-scorer/scoring-engine.js';

// Supported webhook event types
export type WebhookEventType =
  | 'deal.closed_won'
  | 'deal.closed_lost'
  | 'deal.stage_changed'
  | 'nps.submitted'
  | 'champion.departed'
  | 'champion.promoted'
  | 'expansion.closed'
  | 'support.escalation'
  | 'qbr.completed'
  | 'usage.alert';

export interface WebhookEvent {
  type: WebhookEventType;
  timestamp: string;
  accountId?: string;
  crmAccountId?: string;
  championId?: string;
  data: Record<string, unknown>;
}

export interface WebhookResult {
  event: WebhookEventType;
  processed: boolean;
  actions: string[];
  errors?: string[];
}

export async function handleWebhookEvent(
  event: WebhookEvent,
  deps: ServerDeps
): Promise<WebhookResult> {
  const actions: string[] = [];
  const errors: string[] = [];

  try {
    // Resolve account — look up by internal ID or CRM ID
    let accountId = event.accountId;
    if (!accountId && event.crmAccountId) {
      const [found] = await deps.db
        .select()
        .from(accounts)
        .where(eq(accounts.crmAccountId, event.crmAccountId))
        .limit(1);
      accountId = found?.id;
    }

    if (!accountId) {
      return { event: event.type, processed: false, actions: [], errors: ['Account not found'] };
    }

    switch (event.type) {
      case 'deal.closed_won': {
        await deps.db.insert(triggerEvents).values({
          accountId,
          eventType: 'expansion_closed',
          eventCategory: 'business',
          eventDescription: `Deal closed won: ${event.data.dealName ?? 'unknown'}`,
          eventDate: new Date(event.timestamp),
          dataSource: 'crm',
          isAntiTrigger: false,
        });
        actions.push('Recorded expansion trigger event');

        // Re-score all champions on this account
        const accountChamps = await deps.db
          .select()
          .from(champions)
          .where(eq(champions.accountId, accountId));

        const acctTriggers = await deps.db
          .select()
          .from(triggerEvents)
          .where(eq(triggerEvents.accountId, accountId));

        const [acct] = await deps.db
          .select()
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .limit(1);

        if (acct) {
          for (const champ of accountChamps) {
            const score = scoreReadiness({
              account: acct,
              champion: champ,
              triggerEvents: acctTriggers,
              referralHistory: [],
            });
            actions.push(`Re-scored ${champ.name}: ${score.totalScore} (${score.tier})`);
          }
        }
        break;
      }

      case 'deal.closed_lost': {
        await deps.db.insert(triggerEvents).values({
          accountId,
          eventType: 'deal_lost',
          eventCategory: 'business',
          eventDescription: `Deal lost: ${event.data.dealName ?? 'unknown'}. Reason: ${event.data.lossReason ?? 'unknown'}`,
          eventDate: new Date(event.timestamp),
          dataSource: 'crm',
          isAntiTrigger: true,
        });
        actions.push('Recorded deal lost event');
        break;
      }

      case 'nps.submitted': {
        const npsScore = event.data.score as number | undefined;
        if (npsScore !== undefined) {
          await deps.db
            .update(accounts)
            .set({ npsScore, updatedAt: new Date() })
            .where(eq(accounts.id, accountId));
          actions.push(`Updated NPS to ${npsScore}`);

          if (npsScore >= 9) {
            await deps.db.insert(triggerEvents).values({
              accountId,
              eventType: 'nps_survey_completed',
              eventCategory: 'relationship',
              eventDescription: `NPS ${npsScore} — promoter detected`,
              eventDate: new Date(event.timestamp),
              dataSource: 'nps_platform',
              isAntiTrigger: false,
            });
            actions.push('NPS promoter detected — recorded trigger event');
          }
        }
        break;
      }

      case 'champion.departed': {
        if (event.championId) {
          await deps.db
            .update(champions)
            .set({ departedAt: new Date(event.timestamp), updatedAt: new Date() })
            .where(eq(champions.id, event.championId));
          actions.push('Marked champion as departed');

          await deps.db.insert(triggerEvents).values({
            accountId,
            eventType: 'champion_departed',
            eventCategory: 'risk_flip',
            eventDescription: `Champion departed: ${event.data.name ?? 'unknown'}`,
            eventDate: new Date(event.timestamp),
            dataSource: 'crm',
            isAntiTrigger: true,
          });
          actions.push('Recorded anti-trigger: champion departed');
        }
        break;
      }

      case 'champion.promoted': {
        if (event.championId) {
          const newTitle = event.data.newTitle as string | undefined;
          const newSeniority = event.data.newSeniority as string | undefined;
          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (newTitle) updates.title = newTitle;
          if (newSeniority) updates.seniorityLevel = newSeniority;

          await deps.db
            .update(champions)
            .set(updates)
            .where(eq(champions.id, event.championId));
          actions.push(`Updated champion: ${newTitle ?? 'promoted'}`);

          await deps.db.insert(triggerEvents).values({
            accountId,
            eventType: 'champion_promoted',
            eventCategory: 'relationship',
            eventDescription: `Champion promoted to ${newTitle ?? 'new role'}`,
            eventDate: new Date(event.timestamp),
            dataSource: 'crm',
            isAntiTrigger: false,
          });
          actions.push('Recorded promotion trigger');
        }
        break;
      }

      case 'support.escalation': {
        await deps.db
          .update(accounts)
          .set({ supportEscalationActive: true, updatedAt: new Date() })
          .where(eq(accounts.id, accountId));
        actions.push('Flagged support escalation active — referral asks paused');
        break;
      }

      case 'qbr.completed': {
        const outcome = event.data.outcome as string | undefined;
        await deps.db
          .update(accounts)
          .set({
            lastQbrDate: new Date(event.timestamp),
            lastQbrOutcome: outcome ?? 'neutral',
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, accountId));
        actions.push(`QBR recorded: ${outcome ?? 'neutral'}`);

        if (outcome === 'positive') {
          await deps.db.insert(triggerEvents).values({
            accountId,
            eventType: 'qbr_positive',
            eventCategory: 'relationship',
            eventDescription: 'Positive QBR — optimal referral window',
            eventDate: new Date(event.timestamp),
            dataSource: 'crm',
            isAntiTrigger: false,
          });
          actions.push('Positive QBR trigger — prime referral opportunity');
        }
        break;
      }

      case 'usage.alert': {
        const trend = event.data.trend as string | undefined;
        if (trend) {
          await deps.db
            .update(accounts)
            .set({ usageTrend: trend, updatedAt: new Date() })
            .where(eq(accounts.id, accountId));
          actions.push(`Usage trend updated: ${trend}`);

          if (trend === 'declining') {
            await deps.db
              .update(accounts)
              .set({ churnRiskActive: true })
              .where(eq(accounts.id, accountId));
            actions.push('Churn risk flagged — referral asks paused');
          }
        }
        break;
      }

      case 'expansion.closed': {
        await deps.db.insert(triggerEvents).values({
          accountId,
          eventType: 'expansion_closed',
          eventCategory: 'business',
          eventDescription: `Expansion: ${event.data.description ?? 'new expansion'}`,
          eventDate: new Date(event.timestamp),
          dataSource: 'crm',
          isAntiTrigger: false,
        });
        actions.push('Expansion recorded — strong referral signal');
        break;
      }

      case 'deal.stage_changed': {
        actions.push(`Stage change recorded: ${event.data.fromStage} → ${event.data.toStage}`);
        break;
      }
    }

    // Send notification if actions were taken
    if (actions.length > 0) {
      try {
        await deps.notifications.sendReferralUpdate(
          deps.config.slackReferralChannel ?? 'referral-system',
          {
            referralId: 'webhook',
            championName: 'system',
            targetCompany: 'n/a',
            oldStatus: 'n/a',
            newStatus: event.type,
            details: actions.join('. '),
          }
        );
      } catch {
        // Notification failure is non-fatal
      }
    }

    return { event: event.type, processed: true, actions };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { event: event.type, processed: false, actions, errors };
  }
}
