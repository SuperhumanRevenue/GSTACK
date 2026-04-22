import type { Champion } from '../../src/db/schema.js';

const BASE_CHAMPION: Champion = {
  id: '00000000-0000-0000-0001-000000000001',
  accountId: '00000000-0000-0000-0000-000000000010',
  name: 'Sarah Chen',
  title: 'VP of Engineering',
  email: 'sarah@techcorp.com',
  linkedinUrl: 'https://linkedin.com/in/sarahchen',
  seniorityLevel: 'vp',
  relationshipStrength: 'strong',
  isExecutiveSponsor: true,
  formerCompanies: ['Google', 'Stripe', 'Notion'],
  industryCommunities: ['SaaStr', 'Pavilion'],
  communicationStyle: 'casual',
  networkReachScore: 75,
  lastInteractionDate: new Date('2026-03-25'),
  departedAt: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function buildChampion(overrides?: Partial<Champion>): Champion {
  return {
    ...BASE_CHAMPION,
    id: overrides?.id ?? `00000000-0000-0000-0001-${String(Date.now()).slice(-12).padStart(12, '0')}`,
    ...overrides,
  };
}

// ─── Presets ───

/** Strong champion: VP, exec sponsor, great network, recent interaction */
export const STRONG_CHAMPION = buildChampion({
  id: '00000000-0000-0000-0001-000000000010',
  accountId: '00000000-0000-0000-0000-000000000010',
  name: 'Sarah Chen',
  seniorityLevel: 'vp',
  relationshipStrength: 'strong',
  isExecutiveSponsor: true,
  networkReachScore: 80,
  lastInteractionDate: new Date('2026-03-25'),
});

/** Warm champion: director, decent relationship */
export const WARM_CHAMPION = buildChampion({
  id: '00000000-0000-0000-0001-000000000011',
  accountId: '00000000-0000-0000-0000-000000000011',
  name: 'Mike Johnson',
  title: 'Director of Product',
  seniorityLevel: 'director',
  relationshipStrength: 'warm',
  isExecutiveSponsor: false,
  networkReachScore: 50,
  formerCompanies: ['Salesforce'],
  industryCommunities: [],
  lastInteractionDate: new Date('2026-02-15'),
});

/** Cold champion: manager, minimal relationship */
export const COLD_CHAMPION = buildChampion({
  id: '00000000-0000-0000-0001-000000000012',
  accountId: '00000000-0000-0000-0000-000000000012',
  name: 'Lisa Park',
  title: 'Engineering Manager',
  seniorityLevel: 'manager',
  relationshipStrength: 'cold',
  isExecutiveSponsor: false,
  networkReachScore: 25,
  formerCompanies: [],
  industryCommunities: [],
  lastInteractionDate: new Date('2026-01-01'),
});

/** Departed champion */
export const DEPARTED_CHAMPION = buildChampion({
  id: '00000000-0000-0000-0001-000000000013',
  accountId: '00000000-0000-0000-0000-000000000013',
  name: 'Tom Richards',
  title: 'CTO',
  seniorityLevel: 'c_suite',
  relationshipStrength: 'strong',
  departedAt: new Date('2026-03-01'),
});

/** C-suite champion for high ACV account */
export const CSUITE_CHAMPION = buildChampion({
  id: '00000000-0000-0000-0001-000000000014',
  accountId: '00000000-0000-0000-0000-000000000015',
  name: 'Diana Lee',
  title: 'CEO',
  seniorityLevel: 'c_suite',
  relationshipStrength: 'strong',
  isExecutiveSponsor: true,
  networkReachScore: 90,
  formerCompanies: ['Meta', 'Twitter', 'Uber', 'Airbnb'],
  industryCommunities: ['YPO', 'SaaStr', 'Founders Forum'],
  lastInteractionDate: new Date('2026-03-27'),
});
