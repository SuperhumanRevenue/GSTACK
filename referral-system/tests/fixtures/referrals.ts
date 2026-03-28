import type { Referral } from '../../src/db/schema.js';

const BASE_REFERRAL: Referral = {
  id: '00000000-0000-0000-0003-000000000001',
  accountId: '00000000-0000-0000-0000-000000000010',
  championId: '00000000-0000-0000-0001-000000000010',
  connectionMapId: null,
  readinessScoreId: null,
  targetCompany: 'TargetCo',
  targetContact: 'Jane Smith',
  targetTitle: 'CTO',
  askType: 'async',
  askDate: new Date('2026-02-01'),
  askContent: null,
  triggerEvent: 'qbr_success',
  readinessScoreAtAsk: 85,
  response: 'pending',
  responseDate: null,
  followUpCount: 0,
  lastFollowUpDate: null,
  status: 'ask_pending',
  introDate: null,
  introContent: null,
  meetingDate: null,
  crmOpportunityId: null,
  opportunityAmount: null,
  closedDate: null,
  closedAmount: null,
  timeToCloseDays: null,
  championReward: null,
  rewardDate: null,
  owningAe: 'Alex Thompson',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function buildReferral(overrides?: Partial<Referral>): Referral {
  return {
    ...BASE_REFERRAL,
    id: overrides?.id ?? `00000000-0000-0000-0003-${String(Date.now()).slice(-12).padStart(12, '0')}`,
    ...overrides,
  };
}

// ─── Presets ───

/** Successful referral — closed won */
export const CLOSED_WON_REFERRAL = buildReferral({
  id: '00000000-0000-0000-0003-000000000010',
  response: 'yes',
  responseDate: new Date('2026-01-10'),
  status: 'closed_won',
  introDate: new Date('2026-01-12'),
  meetingDate: new Date('2026-01-20'),
  closedDate: new Date('2026-02-28'),
  closedAmount: '120000',
  timeToCloseDays: 49,
  askDate: new Date('2026-01-05'),
});

/** Referral that was declined */
export const DECLINED_REFERRAL = buildReferral({
  id: '00000000-0000-0000-0003-000000000011',
  response: 'no',
  responseDate: new Date('2026-02-05'),
  status: 'declined',
  askDate: new Date('2026-02-01'),
});

/** Referral with no response */
export const NO_RESPONSE_REFERRAL = buildReferral({
  id: '00000000-0000-0000-0003-000000000012',
  response: 'no_response',
  status: 'expired',
  followUpCount: 2,
  askDate: new Date('2026-01-15'),
});

/** Referral in progress — maybe response, awaiting follow-up */
export const MAYBE_REFERRAL = buildReferral({
  id: '00000000-0000-0000-0003-000000000013',
  response: 'maybe',
  responseDate: new Date('2026-03-20'),
  status: 'ask_sent',
  followUpCount: 1,
  askDate: new Date('2026-03-15'),
});
