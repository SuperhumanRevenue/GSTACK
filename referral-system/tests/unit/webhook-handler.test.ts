import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebhookEvent, type WebhookEvent } from '../../src/server/webhook-handler.js';
import type { ServerDeps } from '../../src/shared/types.js';

// ─── Mock DB Builder ──────────────────────────────────────────────────────────

function buildMockDb() {
  const insertedValues: { table: string; values: unknown }[] = [];
  const updatedValues: { sets: unknown }[] = [];

  const chainable = () => {
    const chain: Record<string, unknown> = {
      values: (vals: unknown) => { insertedValues.push({ table: 'unknown', values: vals }); return Promise.resolve(); },
      set: (sets: unknown) => { updatedValues.push({ sets }); return chain; },
      where: () => chain,
      orderBy: () => chain,
      limit: (n: number) => Promise.resolve([]),
      then: (resolve: (v: unknown) => void) => resolve([]),
    };
    return chain;
  };

  // Track what account to return for lookups
  let accountForLookup: Record<string, unknown> | null = null;
  let championsForLookup: Record<string, unknown>[] = [];
  let triggersForLookup: Record<string, unknown>[] = [];

  const drizzleNameSymbol = Symbol.for('drizzle:Name');

  const db = {
    _insertedValues: insertedValues,
    _updatedValues: updatedValues,
    setAccount: (acct: Record<string, unknown> | null) => { accountForLookup = acct; },
    setChampions: (champs: Record<string, unknown>[]) => { championsForLookup = champs; },
    setTriggers: (triggers: Record<string, unknown>[]) => { triggersForLookup = triggers; },

    select: () => {
      let resolvedData: unknown[] = [];
      const chain: Record<string, unknown> = {
        from: (table: unknown) => {
          const name = (table as Record<symbol, string>)?.[drizzleNameSymbol] ?? '';
          if (name === 'accounts') resolvedData = accountForLookup ? [accountForLookup] : [];
          else if (name === 'champions') resolvedData = championsForLookup;
          else if (name === 'trigger_events') resolvedData = triggersForLookup;
          else resolvedData = [];
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(resolvedData),
      };
      (chain as Record<string, unknown>).then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(resolvedData).then(resolve, reject);
      return chain;
    },

    insert: (table: unknown) => {
      const name = (table as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] ?? 'unknown';
      return {
        values: (vals: unknown) => {
          insertedValues.push({ table: name, values: vals });
          return Promise.resolve();
        },
      };
    },

    update: (table: unknown) => {
      const name = (table as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] ?? 'unknown';
      return {
        set: (sets: unknown) => {
          updatedValues.push({ sets });
          return {
            where: () => Promise.resolve(),
          };
        },
      };
    },

    delete: () => ({ where: () => Promise.resolve() }),
  };

  return db;
}

function buildMockDeps(db: ReturnType<typeof buildMockDb>): ServerDeps {
  return {
    db: db as unknown as ServerDeps['db'],
    cache: {} as unknown as ServerDeps['cache'],
    crm: {} as unknown as ServerDeps['crm'],
    enrichment: {} as unknown as ServerDeps['enrichment'],
    conversationIntel: {} as unknown as ServerDeps['conversationIntel'],
    notifications: {
      sendReferralUpdate: vi.fn().mockResolvedValue(undefined),
      sendReadinessDigest: vi.fn(),
      sendAskForApproval: vi.fn(),
      sendSuperReferrerAlert: vi.fn(),
    } as unknown as ServerDeps['notifications'],
    intent: {} as unknown as ServerDeps['intent'],
    llm: {} as unknown as ServerDeps['llm'],
    webSearch: {} as unknown as ServerDeps['webSearch'],
    config: { slackReferralChannel: 'test-channel' } as unknown as ServerDeps['config'],
  };
}

function makeAccount() {
  return {
    id: 'aaaa-1111-2222-3333-444444444444',
    crmAccountId: 'crm-001',
    companyName: 'TestCo',
    industry: 'SaaS',
    employeeCount: 100,
    currentAcv: '50000.00',
    csHealthScore: 80,
    npsScore: 8,
    usageTrend: 'stable',
    supportEscalationActive: false,
    churnRiskActive: false,
    contractStartDate: new Date(),
    renewalDate: new Date(),
    tenureMonths: 12,
    lastQbrDate: null,
    lastQbrOutcome: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeChampion() {
  return {
    id: 'bbbb-1111-2222-3333-444444444444',
    accountId: 'aaaa-1111-2222-3333-444444444444',
    name: 'Jane Doe',
    title: 'VP Eng',
    email: 'jane@testco.com',
    linkedinUrl: null,
    seniorityLevel: 'vp',
    relationshipStrength: 'strong',
    isExecutiveSponsor: true,
    formerCompanies: [],
    industryCommunities: [],
    communicationStyle: 'casual',
    networkReachScore: 80,
    lastInteractionDate: new Date(),
    departedAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Webhook Handler', () => {
  it('returns processed: false when account not found', async () => {
    const db = buildMockDb();
    db.setAccount(null);
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'deal.closed_won',
      timestamp: new Date().toISOString(),
      crmAccountId: 'nonexistent-crm-id',
      data: { dealName: 'Big Deal' },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(false);
    expect(result.errors).toContain('Account not found');
  });

  it('deal.closed_won creates trigger and re-scores champions', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    db.setChampions([makeChampion()]);
    db.setTriggers([]);
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'deal.closed_won',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: { dealName: 'Enterprise Upgrade' },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('Recorded expansion trigger event');
    expect(result.actions.some((a) => a.includes('Re-scored Jane Doe'))).toBe(true);

    // Check trigger event was inserted
    const triggerInsert = db._insertedValues.find((v) => v.table === 'trigger_events');
    expect(triggerInsert).toBeTruthy();
  });

  it('nps.submitted updates NPS and creates promoter trigger for score >= 9', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'nps.submitted',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: { score: 10 },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('Updated NPS to 10');
    expect(result.actions).toContain('NPS promoter detected — recorded trigger event');
  });

  it('nps.submitted with low score does not create promoter trigger', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'nps.submitted',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: { score: 6 },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('Updated NPS to 6');
    expect(result.actions).not.toContain('NPS promoter detected — recorded trigger event');
  });

  it('champion.departed marks departed and creates anti-trigger', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'champion.departed',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      championId: 'bbbb-1111-2222-3333-444444444444',
      data: { name: 'Jane Doe' },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('Marked champion as departed');
    expect(result.actions).toContain('Recorded anti-trigger: champion departed');

    // Check anti-trigger was inserted
    const triggerInsert = db._insertedValues.find(
      (v) => v.table === 'trigger_events' && (v.values as Record<string, unknown>).isAntiTrigger === true
    );
    expect(triggerInsert).toBeTruthy();
  });

  it('support.escalation flags account', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'support.escalation',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: {},
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('Flagged support escalation active — referral asks paused');

    // Verify update was called with supportEscalationActive: true
    const update = db._updatedValues.find(
      (u) => (u.sets as Record<string, unknown>).supportEscalationActive === true
    );
    expect(update).toBeTruthy();
  });

  it('qbr.completed with positive outcome creates trigger', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'qbr.completed',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: { outcome: 'positive' },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('QBR recorded: positive');
    expect(result.actions).toContain('Positive QBR trigger — prime referral opportunity');
  });

  it('usage.alert with declining trend flags churn risk', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'usage.alert',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: { trend: 'declining' },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('Usage trend updated: declining');
    expect(result.actions).toContain('Churn risk flagged — referral asks paused');
  });

  it('deal.stage_changed records the stage transition', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'deal.stage_changed',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: { fromStage: 'discovery', toStage: 'proposal' },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions[0]).toContain('discovery');
    expect(result.actions[0]).toContain('proposal');
  });

  it('sends notification after processing', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'support.escalation',
      timestamp: new Date().toISOString(),
      accountId: 'aaaa-1111-2222-3333-444444444444',
      data: {},
    };

    await handleWebhookEvent(event, deps);
    expect(deps.notifications.sendReferralUpdate).toHaveBeenCalled();
  });

  it('resolves account by crmAccountId when accountId missing', async () => {
    const db = buildMockDb();
    db.setAccount(makeAccount());
    const deps = buildMockDeps(db);

    const event: WebhookEvent = {
      type: 'expansion.closed',
      timestamp: new Date().toISOString(),
      crmAccountId: 'crm-001',
      data: { description: 'New team onboarded' },
    };

    const result = await handleWebhookEvent(event, deps);
    expect(result.processed).toBe(true);
    expect(result.actions).toContain('Expansion recorded — strong referral signal');
  });
});
