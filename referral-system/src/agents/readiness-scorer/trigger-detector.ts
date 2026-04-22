import { differenceInDays } from 'date-fns';
import type { Account, Champion, TriggerEvent } from '../../db/schema.js';

export type TriggerCategory = 'usage' | 'relationship' | 'business' | 'calendar' | 'risk_flip';

export interface DetectedTrigger {
  eventType: string;
  eventCategory: TriggerCategory;
  eventDescription: string;
  eventDate: Date;
  dataSource: string;
  isAntiTrigger: boolean;
}

/**
 * Pure function: Detect trigger events from account and champion data.
 * Checks CRM-sourced signals for both positive triggers and anti-triggers.
 */
export function detectTriggers(
  account: Account,
  champion: Champion,
  existingEvents: TriggerEvent[]
): DetectedTrigger[] {
  const triggers: DetectedTrigger[] = [];
  const now = new Date();

  // ─── Positive Triggers ───

  // QBR success
  if (
    account.lastQbrOutcome === 'positive' &&
    account.lastQbrDate &&
    differenceInDays(now, account.lastQbrDate) <= 14
  ) {
    triggers.push({
      eventType: 'qbr_success',
      eventCategory: 'relationship',
      eventDescription: `Positive QBR at ${account.companyName}`,
      eventDate: account.lastQbrDate,
      dataSource: 'crm',
      isAntiTrigger: false,
    });
  }

  // High NPS
  if (account.npsScore !== null && account.npsScore >= 9) {
    triggers.push({
      eventType: 'nps_high',
      eventCategory: 'relationship',
      eventDescription: `NPS score of ${account.npsScore} at ${account.companyName}`,
      eventDate: now,
      dataSource: 'crm',
      isAntiTrigger: false,
    });
  }

  // Renewal approaching (within 60 days)
  if (
    account.renewalDate &&
    differenceInDays(account.renewalDate, now) <= 60 &&
    differenceInDays(account.renewalDate, now) > 0 &&
    !account.churnRiskActive
  ) {
    triggers.push({
      eventType: 'renewal_approaching',
      eventCategory: 'calendar',
      eventDescription: `Renewal approaching at ${account.companyName} — ask before renewal locks attention`,
      eventDate: account.renewalDate,
      dataSource: 'crm',
      isAntiTrigger: false,
    });
  }

  // Growing usage
  if (account.usageTrend === 'growing') {
    triggers.push({
      eventType: 'usage_growing',
      eventCategory: 'usage',
      eventDescription: `Usage trending up at ${account.companyName}`,
      eventDate: now,
      dataSource: 'crm',
      isAntiTrigger: false,
    });
  }

  // Recent interaction with champion (within 7 days)
  if (
    champion.lastInteractionDate &&
    differenceInDays(now, champion.lastInteractionDate) <= 7
  ) {
    triggers.push({
      eventType: 'recent_champion_interaction',
      eventCategory: 'relationship',
      eventDescription: `Recent interaction with ${champion.name} at ${account.companyName}`,
      eventDate: champion.lastInteractionDate,
      dataSource: 'crm',
      isAntiTrigger: false,
    });
  }

  // High CS health + long tenure = stable advocate
  if (
    (account.csHealthScore ?? 0) >= 85 &&
    (account.tenureMonths ?? 0) >= 18
  ) {
    triggers.push({
      eventType: 'stable_advocate',
      eventCategory: 'business',
      eventDescription: `Long-tenured healthy account at ${account.companyName} (${account.tenureMonths}mo, health ${account.csHealthScore})`,
      eventDate: now,
      dataSource: 'crm',
      isAntiTrigger: false,
    });
  }

  // ─── Anti-Triggers ───

  if (account.supportEscalationActive) {
    triggers.push({
      eventType: 'support_escalation',
      eventCategory: 'risk_flip',
      eventDescription: `Active support escalation at ${account.companyName}`,
      eventDate: now,
      dataSource: 'crm',
      isAntiTrigger: true,
    });
  }

  if (account.churnRiskActive) {
    triggers.push({
      eventType: 'churn_risk',
      eventCategory: 'risk_flip',
      eventDescription: `Churn risk active at ${account.companyName}`,
      eventDate: now,
      dataSource: 'crm',
      isAntiTrigger: true,
    });
  }

  if (account.usageTrend === 'declining') {
    triggers.push({
      eventType: 'usage_declining',
      eventCategory: 'usage',
      eventDescription: `Usage declining at ${account.companyName}`,
      eventDate: now,
      dataSource: 'crm',
      isAntiTrigger: true,
    });
  }

  if (champion.departedAt) {
    triggers.push({
      eventType: 'champion_departed',
      eventCategory: 'relationship',
      eventDescription: `Champion ${champion.name} departed from ${account.companyName}`,
      eventDate: champion.departedAt,
      dataSource: 'crm',
      isAntiTrigger: true,
    });
  }

  // Deduplicate against existing events (by type + account within 7 days)
  return triggers.filter((t) => {
    return !existingEvents.some(
      (e) =>
        e.eventType === t.eventType &&
        e.accountId === account.id &&
        Math.abs(differenceInDays(t.eventDate, e.eventDate)) <= 7
    );
  });
}
