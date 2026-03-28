import type { Referral } from '../../db/schema.js';

/** Valid status transitions — enforces pipeline integrity */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  ask_pending: ['ask_sent', 'deferred', 'expired'],
  ask_sent: ['intro_pending', 'deferred', 'declined', 'expired'],
  intro_pending: ['intro_sent', 'deferred'],
  intro_sent: ['meeting_booked', 'deferred', 'expired'],
  meeting_booked: ['opportunity_created', 'closed_lost', 'deferred'],
  opportunity_created: ['closed_won', 'closed_lost'],
  closed_won: [], // Terminal state
  closed_lost: [], // Terminal state
  deferred: ['ask_pending', 'ask_sent'], // Can re-enter pipeline
  expired: ['ask_pending'], // Can restart
  declined: [], // Terminal state
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export interface ReferralUpdate {
  response?: 'yes' | 'maybe' | 'no' | 'no_response' | 'pending';
  responseDate?: Date;
  status?: string;
  introDate?: Date;
  introContent?: string;
  meetingDate?: Date;
  crmOpportunityId?: string;
  opportunityAmount?: string;
  closedDate?: Date;
  closedAmount?: string;
  championReward?: string;
  rewardDate?: Date;
  followUpCount?: number;
  lastFollowUpDate?: Date;
  notes?: string;
}

export interface StatusChange {
  from: string;
  to: string;
}
