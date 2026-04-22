/**
 * Deal Health Scorer — Pure function scoring engine for referral deal health.
 *
 * Analyzes pipeline deals based on:
 * - Stage progression velocity
 * - Time since last activity
 * - Response quality
 * - Follow-up cadence
 */

import type { DealHealthInput, DealHealthResult, DealHealthTier } from './types.js';
import { STALL_THRESHOLDS } from './types.js';

/**
 * Score the health of a single referral deal.
 */
export function scoreDealHealth(input: DealHealthInput, now: Date = new Date()): DealHealthResult {
  let score = 100;
  const factors: string[] = [];

  // 1. Days since last activity (0-30 pts deduction)
  const lastActivity = input.lastActivityDate ?? input.createdAt;
  const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

  const stallThreshold = STALL_THRESHOLDS[input.status] ?? 14;
  if (daysSinceActivity > stallThreshold * 2) {
    score -= 30;
    factors.push(`No activity in ${daysSinceActivity} days (critical)`);
  } else if (daysSinceActivity > stallThreshold) {
    score -= 20;
    factors.push(`No activity in ${daysSinceActivity} days (stalled)`);
  } else if (daysSinceActivity > stallThreshold * 0.7) {
    score -= 10;
    factors.push(`Activity slowing (${daysSinceActivity} days)`);
  }

  // 2. Response quality (0-25 pts deduction)
  if (input.response === 'no') {
    score -= 25;
    factors.push('Champion declined');
  } else if (input.response === 'no_response') {
    score -= 20;
    factors.push('No response from champion');
  } else if (input.response === 'maybe') {
    score -= 10;
    factors.push('Tentative response');
  } else if (input.response === 'yes') {
    factors.push('Champion confirmed');
  }

  // 3. Follow-up cadence (0-15 pts deduction)
  if (input.response === 'pending' || input.response === 'no_response') {
    if (input.followUpCount === 0 && daysSinceActivity > 7) {
      score -= 15;
      factors.push('No follow-up sent after 7+ days');
    } else if (input.followUpCount === 1 && daysSinceActivity > 14) {
      score -= 10;
      factors.push('Only 1 follow-up after 14+ days');
    }
  }

  // 4. Stage progression velocity (0-20 pts deduction)
  const daysSinceCreated = Math.floor((now.getTime() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24));

  if (input.status === 'ask_pending' && daysSinceCreated > 14) {
    score -= 15;
    factors.push(`Ask pending for ${daysSinceCreated} days`);
  } else if (input.status === 'ask_sent' && !input.introDate && daysSinceCreated > 30) {
    score -= 20;
    factors.push(`No intro after ${daysSinceCreated} days`);
  } else if (input.status === 'intro_sent' && !input.meetingDate && daysSinceCreated > 45) {
    score -= 15;
    factors.push(`No meeting booked after intro ${daysSinceCreated} days ago`);
  }

  // 5. Deal value bonus (encourages larger deals)
  if (input.opportunityAmount != null && input.opportunityAmount > 100000) {
    score = Math.min(100, score + 5);
    factors.push('High-value opportunity');
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const tier = classifyHealthTier(score);
  const recommendedAction = getRecommendedAction(tier, factors, input);

  return { score, tier, factors, recommendedAction };
}

function classifyHealthTier(score: number): DealHealthTier {
  if (score >= 70) return 'healthy';
  if (score >= 50) return 'at_risk';
  if (score >= 25) return 'stalled';
  return 'critical';
}

function getRecommendedAction(tier: DealHealthTier, factors: string[], input: DealHealthInput): string {
  if (tier === 'critical') {
    if (input.response === 'no') return 'Close this referral. Champion has declined. Consider re-engaging at a later date.';
    return 'Urgent: Schedule 1:1 with AE to review this deal. Consider re-engaging champion with new trigger event.';
  }
  if (tier === 'stalled') {
    if (factors.some((f) => f.includes('No follow-up'))) return 'Send follow-up immediately. Use a different channel or angle.';
    if (factors.some((f) => f.includes('No response'))) return 'Try a different communication channel. Consider having mutual connection ping champion.';
    return 'Review deal strategy. Update timeline or escalate to manager for coaching.';
  }
  if (tier === 'at_risk') {
    if (factors.some((f) => f.includes('Tentative'))) return 'Provide additional social proof or case study to convert maybe to yes.';
    return 'Monitor closely. Set reminder to check in within 3 days.';
  }
  return 'On track. Continue current cadence.';
}
