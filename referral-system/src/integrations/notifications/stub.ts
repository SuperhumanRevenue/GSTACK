import pino from 'pino';
import type {
  NotificationAdapter,
  ReadinessDigest,
  AskApprovalRequest,
  ApprovalResponse,
  ReferralStatusUpdate,
  SuperReferrerAlert,
} from './interface.js';

const logger = pino({ name: 'notifications-stub' });

export class NotificationStub implements NotificationAdapter {
  private log: { type: string; data: unknown }[] = [];

  async sendReadinessDigest(_channel: string, report: ReadinessDigest): Promise<void> {
    this.log.push({ type: 'readiness_digest', data: report });
    logger.info({ hotCount: report.hotAccounts.length }, 'Readiness digest (stub)');
  }

  async sendAskForApproval(_userId: string, ask: AskApprovalRequest): Promise<ApprovalResponse> {
    this.log.push({ type: 'ask_approval', data: ask });
    logger.info({ referralId: ask.referralId }, 'Ask approval request (stub) — auto-approved');
    return { approved: true };
  }

  async sendReferralUpdate(_channel: string, update: ReferralStatusUpdate): Promise<void> {
    this.log.push({ type: 'referral_update', data: update });
    logger.info({ referralId: update.referralId, status: update.newStatus }, 'Referral update (stub)');
  }

  async sendSuperReferrerAlert(_channel: string, alert: SuperReferrerAlert): Promise<void> {
    this.log.push({ type: 'super_referrer_alert', data: alert });
    logger.info({ champion: alert.championName, tier: alert.newTier }, 'Super-referrer alert (stub)');
  }

  // Test helper
  getLog(): { type: string; data: unknown }[] {
    return this.log;
  }
}
