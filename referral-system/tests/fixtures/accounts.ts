import type { Account } from '../../src/db/schema.js';

const BASE_ACCOUNT: Account = {
  id: '00000000-0000-0000-0000-000000000001',
  crmAccountId: 'crm_001',
  companyName: 'Acme Corp',
  industry: 'Technology',
  employeeCount: 500,
  currentAcv: '100000',
  contractStartDate: new Date('2024-01-01'),
  renewalDate: new Date('2026-06-01'),
  tenureMonths: 24,
  csHealthScore: 85,
  npsScore: 9,
  lastQbrDate: new Date('2026-03-15'),
  lastQbrOutcome: 'positive',
  supportEscalationActive: false,
  churnRiskActive: false,
  usageTrend: 'growing',
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function buildAccount(overrides?: Partial<Account>): Account {
  return {
    ...BASE_ACCOUNT,
    id: overrides?.id ?? `00000000-0000-0000-0000-${String(Date.now()).slice(-12).padStart(12, '0')}`,
    ...overrides,
  };
}

// ─── Preset accounts across tiers ───

/** Hot account: high health, great NPS, growing usage, long tenure */
export const HOT_ACCOUNT = buildAccount({
  id: '00000000-0000-0000-0000-000000000010',
  companyName: 'TechCorp Pro',
  csHealthScore: 92,
  npsScore: 10,
  tenureMonths: 30,
  usageTrend: 'growing',
  lastQbrOutcome: 'positive',
  lastQbrDate: new Date('2026-03-20'),
  currentAcv: '150000',
});

/** Warm account: decent health, OK NPS, stable, reasonable tenure */
export const WARM_ACCOUNT = buildAccount({
  id: '00000000-0000-0000-0000-000000000011',
  companyName: 'MidRange Inc',
  csHealthScore: 75,
  npsScore: 8,
  tenureMonths: 14,
  usageTrend: 'stable',
  lastQbrOutcome: 'positive',
  lastQbrDate: new Date('2026-02-01'),
  currentAcv: '80000',
});

/** Not-yet account: low health, new customer */
export const NOT_YET_ACCOUNT = buildAccount({
  id: '00000000-0000-0000-0000-000000000012',
  companyName: 'NewCo Startup',
  csHealthScore: 50,
  npsScore: 5,
  tenureMonths: 3,
  usageTrend: 'stable',
  lastQbrOutcome: null,
  lastQbrDate: null,
  currentAcv: '30000',
});

/** Anti-trigger account: support escalation active */
export const ESCALATED_ACCOUNT = buildAccount({
  id: '00000000-0000-0000-0000-000000000013',
  companyName: 'TroubleCo',
  csHealthScore: 90,
  npsScore: 9,
  tenureMonths: 24,
  usageTrend: 'growing',
  supportEscalationActive: true,
  currentAcv: '200000',
});

/** Anti-trigger account: churn risk */
export const CHURN_RISK_ACCOUNT = buildAccount({
  id: '00000000-0000-0000-0000-000000000014',
  companyName: 'AtRiskCo',
  csHealthScore: 40,
  npsScore: 4,
  tenureMonths: 18,
  usageTrend: 'declining',
  churnRiskActive: true,
  currentAcv: '120000',
});

/** High ACV account (> $1M) */
export const HIGH_ACV_ACCOUNT = buildAccount({
  id: '00000000-0000-0000-0000-000000000015',
  companyName: 'EnterpriseMega',
  csHealthScore: 88,
  npsScore: 9,
  tenureMonths: 36,
  usageTrend: 'growing',
  currentAcv: '1500000',
});
