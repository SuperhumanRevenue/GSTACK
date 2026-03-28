import type { ReferrerProfile, RewardCategory, ReferrerMotivation } from './types.js';

/**
 * Seniority × Motivation matrix → reward type.
 * Pure function: matches referrer profile to optimal reward approach.
 */

export interface ReferrerMatchResult {
  recommendedCategory: RewardCategory;
  description: string;
  examples: string[];
}

/**
 * Matrix: seniority × motivation → reward category.
 *
 * |             | altruistic      | reciprocal       | economic         | status           |
 * |-------------|-----------------|------------------|------------------|------------------|
 * | c_suite     | recognition     | access           | access           | recognition      |
 * | vp          | recognition     | reciprocal       | economic         | access           |
 * | director    | co_marketing    | reciprocal       | economic         | recognition      |
 * | manager     | recognition     | reciprocal       | economic         | recognition      |
 */
const SENIORITY_MOTIVATION_MATRIX: Record<string, Record<ReferrerMotivation, RewardCategory>> = {
  c_suite: {
    altruistic: 'recognition',
    reciprocal: 'access',
    economic: 'access', // C-suite don't want cash; exclusive access is more valued
    status: 'recognition',
  },
  vp: {
    altruistic: 'recognition',
    reciprocal: 'reciprocal',
    economic: 'economic',
    status: 'access',
  },
  director: {
    altruistic: 'co_marketing',
    reciprocal: 'reciprocal',
    economic: 'economic',
    status: 'recognition',
  },
  manager: {
    altruistic: 'recognition',
    reciprocal: 'reciprocal',
    economic: 'economic',
    status: 'recognition',
  },
};

const REWARD_EXAMPLES: Record<RewardCategory, string[]> = {
  recognition: [
    'Featured in customer success story',
    'Speaker slot at annual user conference',
    'LinkedIn endorsement from CEO',
    'Award nomination in industry publication',
  ],
  reciprocal: [
    'Warm introduction to a target in your network',
    'Co-hosted webinar with your brand',
    'Joint case study highlighting both companies',
    'Strategic partnership discussion',
  ],
  economic: [
    'Gift card ($100-$500 based on deal size)',
    'Charitable donation in your name',
    'Professional development stipend',
    'Team dinner for your department',
  ],
  access: [
    'Advisory board seat with executive access',
    'Early access to beta features',
    'VIP invite to executive roundtable',
    'Dedicated customer success resources',
  ],
  co_marketing: [
    'Joint blog post highlighting your expertise',
    'Co-branded research report',
    'Podcast interview feature',
    'Social media spotlight campaign',
  ],
};

export function matchReferrer(profile: ReferrerProfile): ReferrerMatchResult {
  const category = SENIORITY_MOTIVATION_MATRIX[profile.seniority]?.[profile.motivation]
    ?? 'recognition'; // Default fallback

  return {
    recommendedCategory: category,
    description: describeMatch(profile, category),
    examples: REWARD_EXAMPLES[category] ?? [],
  };
}

function describeMatch(profile: ReferrerProfile, category: RewardCategory): string {
  const seniorityLabel = profile.seniority.replace('_', '-');
  const motivationLabel = profile.motivation;

  const descriptions: Record<RewardCategory, string> = {
    recognition: `${seniorityLabel}-level referrers with ${motivationLabel} motivation respond best to public recognition and thought leadership opportunities.`,
    reciprocal: `${seniorityLabel}-level referrers with ${motivationLabel} motivation value mutual exchange — introductions, partnerships, and shared visibility.`,
    economic: `${seniorityLabel}-level referrers with ${motivationLabel} motivation appreciate tangible appreciation — gift cards, stipends, or charitable donations.`,
    access: `${seniorityLabel}-level referrers with ${motivationLabel} motivation are drawn to exclusive access — advisory boards, beta features, and executive events.`,
    co_marketing: `${seniorityLabel}-level referrers with ${motivationLabel} motivation benefit from co-marketing — joint content that elevates their personal brand.`,
  };

  return descriptions[category];
}
