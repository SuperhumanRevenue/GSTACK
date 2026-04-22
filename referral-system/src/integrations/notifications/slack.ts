import pino from 'pino';
import type {
  NotificationAdapter,
  ReadinessDigest,
  AskApprovalRequest,
  ApprovalResponse,
  ReferralStatusUpdate,
  SuperReferrerAlert,
} from './interface.js';

const logger = pino({ name: 'slack' });

/**
 * Slack notification adapter — sends referral notifications via Slack Bot API.
 * Ask approvals use interactive messages with approve/reject buttons.
 */
export class SlackAdapter implements NotificationAdapter {
  private botToken: string;
  private defaultChannel: string;

  constructor(botToken: string, defaultChannel: string) {
    this.botToken = botToken;
    this.defaultChannel = defaultChannel;
  }

  private async postMessage(channel: string, blocks: SlackBlock[], text: string): Promise<string> {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, blocks, text }),
    });

    const data = await res.json() as SlackResponse;
    if (!data.ok) {
      logger.error({ error: data.error, channel }, 'Slack postMessage failed');
      throw new Error(`Slack error: ${data.error}`);
    }

    return data.ts ?? '';
  }

  async sendReadinessDigest(channel: string, report: ReadinessDigest): Promise<void> {
    const blocks: SlackBlock[] = [
      { type: 'header', text: { type: 'plain_text', text: 'Referral Readiness Digest' } },
      { type: 'divider' },
    ];

    if (report.hotAccounts.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Hot Accounts (${report.hotAccounts.length}):*\n${report.hotAccounts.map(
            (a) => `• *${a.name}* — Score: ${a.score}/100 — Trigger: ${a.trigger}`
          ).join('\n')}`,
        },
      });
    }

    if (report.newTriggers.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*New Triggers:*\n${report.newTriggers.map(
            (t) => `• ${t.account}: ${t.event}`
          ).join('\n')}`,
        },
      });
    }

    await this.postMessage(
      channel || this.defaultChannel,
      blocks,
      `Referral Readiness Digest: ${report.hotAccounts.length} hot accounts`
    );
  }

  async sendAskForApproval(userId: string, ask: AskApprovalRequest): Promise<ApprovalResponse> {
    // Post interactive message — in a real implementation, this would use
    // Slack interactive components and wait for a callback.
    // For now, we post the message and auto-approve (human reviews in Slack).
    const blocks: SlackBlock[] = [
      { type: 'header', text: { type: 'plain_text', text: 'Referral Ask — Approval Needed' } },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*Champion:* ${ask.championName}`,
            `*Target:* ${ask.targetCompany}`,
            `*Ask Type:* ${ask.askType}`,
            '',
            `*Content:*`,
            ask.askContent,
          ].join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve' },
            style: 'primary',
            action_id: `approve_ask_${ask.referralId}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Reject' },
            style: 'danger',
            action_id: `reject_ask_${ask.referralId}`,
          },
        ],
      },
    ];

    await this.postMessage(
      userId, // DM to the approver
      blocks,
      `Referral ask approval needed: ${ask.championName} → ${ask.targetCompany}`
    );

    // Return pending — real implementation would wait for Slack callback
    logger.info({ referralId: ask.referralId, userId }, 'Ask approval sent to Slack — awaiting response');
    return { approved: false, notes: 'Pending Slack approval — check your DMs' };
  }

  async sendReferralUpdate(channel: string, update: ReferralStatusUpdate): Promise<void> {
    const emoji = getStatusEmoji(update.newStatus);
    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *Referral Update*\n*${update.championName}* → ${update.targetCompany}\n*Status:* ${update.oldStatus} → *${update.newStatus}*${update.details ? `\n${update.details}` : ''}`,
        },
      },
    ];

    await this.postMessage(
      channel || this.defaultChannel,
      blocks,
      `Referral update: ${update.championName} → ${update.targetCompany} (${update.newStatus})`
    );
  }

  async sendSuperReferrerAlert(channel: string, alert: SuperReferrerAlert): Promise<void> {
    const blocks: SlackBlock[] = [
      { type: 'header', text: { type: 'plain_text', text: 'Super-Referrer Tier Change' } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*${alert.championName}* (${alert.company})`,
            alert.oldTier ? `Tier: ${alert.oldTier.toUpperCase()} → *${alert.newTier.toUpperCase()}*` : `New tier: *${alert.newTier.toUpperCase()}*`,
            `Total referrals: ${alert.totalReferrals}`,
            `Total revenue: $${alert.totalRevenue.toLocaleString()}`,
          ].join('\n'),
        },
      },
    ];

    await this.postMessage(
      channel || this.defaultChannel,
      blocks,
      `Super-referrer alert: ${alert.championName} is now ${alert.newTier}`
    );
  }
}

// ─── Types ───

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: unknown[];
  [key: string]: unknown;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  ts?: string;
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'ask_sent': return '[ASK]';
    case 'intro_pending': return '[INTRO PENDING]';
    case 'intro_sent': return '[INTRO]';
    case 'meeting_booked': return '[MEETING]';
    case 'opportunity_created': return '[OPP]';
    case 'closed_won': return '[WON]';
    case 'closed_lost': return '[LOST]';
    case 'declined': return '[DECLINED]';
    default: return '[UPDATE]';
  }
}
