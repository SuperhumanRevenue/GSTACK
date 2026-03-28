import type { EnrichedConnection } from '../../src/integrations/enrichment/interface.js';

export function buildConnection(overrides?: Partial<EnrichedConnection>): EnrichedConnection {
  return {
    id: 'conn_001',
    name: 'Jane Smith',
    title: 'CTO',
    company: 'TargetCo',
    connectionType: 'linkedin',
    connectionStrength: 5,
    ...overrides,
  };
}

// ─── Presets ───

/** Former colleague — highest connection value */
export const FORMER_COLLEAGUE = buildConnection({
  id: 'conn_former_01',
  name: 'Alice Zhang',
  title: 'VP of Engineering',
  company: 'PriorityTarget Inc',
  connectionType: 'former_colleague',
  connectionStrength: 8,
});

/** Community connection — medium value */
export const COMMUNITY_CONNECTION = buildConnection({
  id: 'conn_community_01',
  name: 'Bob Martinez',
  title: 'Head of Product',
  company: 'CommunityTarget LLC',
  connectionType: 'community',
  connectionStrength: 6,
});

/** LinkedIn-only connection — lower value */
export const LINKEDIN_CONNECTION = buildConnection({
  id: 'conn_linkedin_01',
  name: 'Carol Williams',
  title: 'Engineering Manager',
  company: 'LinkedInTarget Co',
  connectionType: 'linkedin',
  connectionStrength: 3,
});

/** High-value buyer title match */
export const BUYER_TITLE_MATCH = buildConnection({
  id: 'conn_buyer_01',
  name: 'David Lee',
  title: 'CIO',
  company: 'BuyerTarget Corp',
  connectionType: 'former_colleague',
  connectionStrength: 7,
});

/** Weak connection — low scores */
export const WEAK_CONNECTION = buildConnection({
  id: 'conn_weak_01',
  name: 'Eve Brown',
  title: 'Junior Developer',
  company: 'WeakTarget Inc',
  connectionType: 'other',
  connectionStrength: 2,
});

/** Named target connection */
export const NAMED_TARGET_CONNECTION = buildConnection({
  id: 'conn_named_01',
  name: 'Frank Chen',
  title: 'VP Sales',
  company: 'NamedTarget Corp',
  connectionType: 'linkedin',
  connectionStrength: 6,
});

/** Full set of connections for network analysis testing */
export const FULL_NETWORK = [
  FORMER_COLLEAGUE,
  COMMUNITY_CONNECTION,
  LINKEDIN_CONNECTION,
  BUYER_TITLE_MATCH,
  WEAK_CONNECTION,
  NAMED_TARGET_CONNECTION,
];
