import type { Account, Champion } from '../../db/schema.js';
import { ANTI_TRIGGER_PENALTIES } from './types.js';

export interface AntiTriggerCheck {
  trigger: string;
  active: boolean;
  severity: 'hard_block' | 'penalty';
  penaltyPoints: number;
  description: string;
}

/**
 * Pure function: Check all anti-trigger conditions for an account+champion pair.
 * Returns a list of all checks with their status.
 */
export function checkAntiTriggers(
  account: Account,
  champion: Champion
): AntiTriggerCheck[] {
  const checks: AntiTriggerCheck[] = [];

  // Hard blocks
  checks.push({
    trigger: 'support_escalation_active',
    active: !!account.supportEscalationActive,
    severity: 'hard_block',
    penaltyPoints: 0,
    description: 'Active support escalation — customer is experiencing issues',
  });

  checks.push({
    trigger: 'churn_risk_active',
    active: !!account.churnRiskActive,
    severity: 'hard_block',
    penaltyPoints: 0,
    description: 'Account flagged as churn risk — focus on retention',
  });

  checks.push({
    trigger: 'usage_declining_20pct',
    active: account.usageTrend === 'declining',
    severity: 'hard_block',
    penaltyPoints: 0,
    description: 'Usage is declining — address adoption before asking for referrals',
  });

  checks.push({
    trigger: 'champion_departed',
    active: !!champion.departedAt,
    severity: 'hard_block',
    penaltyPoints: 0,
    description: 'Champion has left the company — identify new champion first',
  });

  return checks;
}

/**
 * Quick check: are any hard-block anti-triggers active?
 */
export function hasHardBlock(account: Account, champion: Champion): boolean {
  return checkAntiTriggers(account, champion).some(
    (c) => c.active && c.severity === 'hard_block'
  );
}

/**
 * Get list of active anti-trigger names for scoring penalty application.
 */
export function getActiveAntiTriggerNames(
  account: Account,
  champion: Champion
): string[] {
  return checkAntiTriggers(account, champion)
    .filter((c) => c.active)
    .map((c) => c.trigger);
}
