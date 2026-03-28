import { eq } from 'drizzle-orm';
import { differenceInDays } from 'date-fns';
import type { DbClient } from '../../db/client.js';
import { referrals, type Referral, type NewReferral } from '../../db/schema.js';
import { isValidTransition, VALID_TRANSITIONS, type ReferralUpdate, type StatusChange } from './types.js';
import { ValidationError, NotFoundError } from '../../shared/errors.js';

/**
 * Create a new referral record in the ledger.
 */
export async function createReferral(
  db: DbClient,
  input: NewReferral
): Promise<Referral> {
  const [created] = await db.insert(referrals).values({
    ...input,
    status: 'ask_pending',
    response: 'pending',
    followUpCount: 0,
  }).returning();

  return created;
}

/**
 * Update a referral's status and fields with transition validation.
 */
export async function updateReferral(
  db: DbClient,
  referralId: string,
  updates: ReferralUpdate,
  maxFollowUps: number = 2
): Promise<{ referral: Referral; statusChange: StatusChange | null }> {
  // Fetch current referral
  const [current] = await db.select().from(referrals).where(eq(referrals.id, referralId)).limit(1);
  if (!current) throw new NotFoundError('Referral', referralId);

  // Validate status transition
  let statusChange: StatusChange | null = null;
  if (updates.status && updates.status !== current.status) {
    if (!isValidTransition(current.status ?? 'ask_pending', updates.status)) {
      throw new ValidationError(
        `Invalid status transition: ${current.status} → ${updates.status}. ` +
        `Allowed transitions from ${current.status}: ${getValidTransitions(current.status ?? 'ask_pending').join(', ')}`
      );
    }
    statusChange = { from: current.status ?? 'ask_pending', to: updates.status };
  }

  // Validate follow-up count
  if (updates.followUpCount !== undefined && updates.followUpCount > maxFollowUps) {
    throw new ValidationError(
      `Follow-up count ${updates.followUpCount} exceeds maximum of ${maxFollowUps}`
    );
  }

  // Calculate time-to-close if transitioning to closed
  let timeToCloseDays: number | undefined;
  if (updates.status === 'closed_won' || updates.status === 'closed_lost') {
    if (current.askDate) {
      const closeDate = updates.closedDate ?? new Date();
      timeToCloseDays = differenceInDays(closeDate, current.askDate);
    }
  }

  // Build update object
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (updates.response !== undefined) updateData.response = updates.response;
  if (updates.responseDate !== undefined) updateData.responseDate = updates.responseDate;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.introDate !== undefined) updateData.introDate = updates.introDate;
  if (updates.introContent !== undefined) updateData.introContent = updates.introContent;
  if (updates.meetingDate !== undefined) updateData.meetingDate = updates.meetingDate;
  if (updates.crmOpportunityId !== undefined) updateData.crmOpportunityId = updates.crmOpportunityId;
  if (updates.opportunityAmount !== undefined) updateData.opportunityAmount = updates.opportunityAmount;
  if (updates.closedDate !== undefined) updateData.closedDate = updates.closedDate;
  if (updates.closedAmount !== undefined) updateData.closedAmount = updates.closedAmount;
  if (updates.championReward !== undefined) updateData.championReward = updates.championReward;
  if (updates.rewardDate !== undefined) updateData.rewardDate = updates.rewardDate;
  if (updates.followUpCount !== undefined) updateData.followUpCount = updates.followUpCount;
  if (updates.lastFollowUpDate !== undefined) updateData.lastFollowUpDate = updates.lastFollowUpDate;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (timeToCloseDays !== undefined) updateData.timeToCloseDays = timeToCloseDays;

  const [updated] = await db.update(referrals)
    .set(updateData)
    .where(eq(referrals.id, referralId))
    .returning();

  return { referral: updated, statusChange };
}

function getValidTransitions(status: string): string[] {
  return VALID_TRANSITIONS[status] ?? [];
}
