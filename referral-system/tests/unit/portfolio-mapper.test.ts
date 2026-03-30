import { describe, it, expect } from 'vitest';
import { buildGraph, findSecondOrderOpportunities, buildPortfolioMaps } from '../../src/agents/portfolio-mapper/graph-builder.js';
import type { EntityRelationship } from '../../src/agents/portfolio-mapper/types.js';

// ─── Fixtures ───

function makeRelationships(): EntityRelationship[] {
  return [
    // Sequoia invested in Acme (customer) and TargetCo (not customer)
    {
      parentEntity: { name: 'Sequoia Capital', entityType: 'investor' },
      childEntity: { name: 'Acme Corp', entityType: 'company', industry: 'SaaS' },
      relationType: 'vc_portfolio',
      confidence: 0.9,
      source: 'web_search',
    },
    {
      parentEntity: { name: 'Sequoia Capital', entityType: 'investor' },
      childEntity: { name: 'TargetCo', entityType: 'company', industry: 'FinTech' },
      relationType: 'vc_portfolio',
      confidence: 0.85,
      source: 'web_search',
    },
    {
      parentEntity: { name: 'Sequoia Capital', entityType: 'investor' },
      childEntity: { name: 'AnotherTarget', entityType: 'company', industry: 'SaaS' },
      relationType: 'vc_portfolio',
      confidence: 0.7,
      source: 'web_search',
    },
    // BigCorp parent with subsidiary
    {
      parentEntity: { name: 'BigCorp Holdings', entityType: 'holding_company' },
      childEntity: { name: 'BigCorp Tech', entityType: 'company', industry: 'Enterprise' },
      relationType: 'parent_subsidiary',
      confidence: 0.95,
      source: 'crm',
    },
    {
      parentEntity: { name: 'BigCorp Holdings', entityType: 'holding_company' },
      childEntity: { name: 'BigCorp Finance', entityType: 'company', industry: 'FinTech' },
      relationType: 'parent_subsidiary',
      confidence: 0.95,
      source: 'crm',
    },
    // PE fund
    {
      parentEntity: { name: 'Vista Equity', entityType: 'investor' },
      childEntity: { name: 'Acme Corp', entityType: 'company' },
      relationType: 'pe_portfolio',
      confidence: 0.8,
      source: 'web_search',
    },
    {
      parentEntity: { name: 'Vista Equity', entityType: 'investor' },
      childEntity: { name: 'PETarget', entityType: 'company' },
      relationType: 'pe_portfolio',
      confidence: 0.75,
      source: 'web_search',
    },
  ];
}

const CUSTOMER_ACCOUNTS = [
  { name: 'Acme Corp', accountId: 'acct-1', industry: 'SaaS' },
  { name: 'BigCorp Tech', accountId: 'acct-2', industry: 'Enterprise' },
];

// ─── Graph Builder Tests ───

describe('buildGraph', () => {
  it('creates nodes for all entities', () => {
    const { nodes } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);

    expect(nodes.size).toBe(9); // Sequoia, Acme, TargetCo, AnotherTarget, BigCorp Holdings, BigCorp Tech, BigCorp Finance, Vista, PETarget
  });

  it('marks customer accounts correctly', () => {
    const { nodes } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);

    const acme = nodes.get('acme corp');
    expect(acme?.isCustomer).toBe(true);
    expect(acme?.accountId).toBe('acct-1');

    const target = nodes.get('targetco');
    expect(target?.isCustomer).toBe(false);
  });

  it('creates edges for all relationships', () => {
    const { edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    expect(edges.length).toBe(7);
  });
});

describe('findSecondOrderOpportunities', () => {
  it('finds paths from customer through investor to non-customer', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const opps = findSecondOrderOpportunities(nodes, edges);

    // Acme → Sequoia → TargetCo, Acme → Sequoia → AnotherTarget, Acme → Vista → PETarget
    // BigCorp Tech → BigCorp Holdings → BigCorp Finance
    expect(opps.length).toBeGreaterThanOrEqual(4);
  });

  it('includes correct connection paths', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const opps = findSecondOrderOpportunities(nodes, edges);

    const sequoiaOpp = opps.find((o) => o.targetCompany === 'TargetCo');
    expect(sequoiaOpp).toBeDefined();
    expect(sequoiaOpp!.connectionPath).toContain('Acme Corp');
    expect(sequoiaOpp!.connectionPath).toContain('Sequoia Capital');
    expect(sequoiaOpp!.connectionPath).toContain('TargetCo');
  });

  it('classifies opportunity types correctly', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const opps = findSecondOrderOpportunities(nodes, edges);

    const vcOpp = opps.find((o) => o.intermediary === 'Sequoia Capital');
    expect(vcOpp?.connectionType).toBe('investor_intro');

    const subsidiaryOpp = opps.find((o) => o.targetCompany === 'BigCorp Finance');
    expect(subsidiaryOpp?.connectionType).toBe('subsidiary_cross_sell');

    const peOpp = opps.find((o) => o.intermediary === 'Vista Equity');
    expect(peOpp?.connectionType).toBe('portfolio_expansion');
  });

  it('does not include existing customers as targets', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const opps = findSecondOrderOpportunities(nodes, edges);

    const customerNames = CUSTOMER_ACCOUNTS.map((c) => c.name);
    for (const opp of opps) {
      expect(customerNames).not.toContain(opp.targetCompany);
    }
  });

  it('deduplicates opportunities by source+target', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const opps = findSecondOrderOpportunities(nodes, edges);

    const keys = opps.map((o) => `${o.sourceAccountId}:${o.targetCompany}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sorts by confidence descending', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const opps = findSecondOrderOpportunities(nodes, edges);

    for (let i = 1; i < opps.length; i++) {
      expect(opps[i].confidence).toBeLessThanOrEqual(opps[i - 1].confidence);
    }
  });

  it('provides rationale and approach for each opportunity', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const opps = findSecondOrderOpportunities(nodes, edges);

    for (const opp of opps) {
      expect(opp.rationale.length).toBeGreaterThan(10);
      expect(opp.suggestedApproach.length).toBeGreaterThan(10);
    }
  });

  it('handles empty graph', () => {
    const opps = findSecondOrderOpportunities(new Map(), []);
    expect(opps.length).toBe(0);
  });
});

describe('buildPortfolioMaps', () => {
  it('groups companies by investor', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const portfolios = buildPortfolioMaps(nodes, edges);

    const sequoia = portfolios.find((p) => p.investorName === 'Sequoia Capital');
    expect(sequoia).toBeDefined();
    expect(sequoia!.totalCompanies).toBe(3); // Acme, TargetCo, AnotherTarget
    expect(sequoia!.customerOverlap).toBe(1); // Just Acme
  });

  it('sorts by customer overlap descending', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const portfolios = buildPortfolioMaps(nodes, edges);

    for (let i = 1; i < portfolios.length; i++) {
      expect(portfolios[i].customerOverlap).toBeLessThanOrEqual(portfolios[i - 1].customerOverlap);
    }
  });

  it('classifies investor types', () => {
    const { nodes, edges } = buildGraph(makeRelationships(), CUSTOMER_ACCOUNTS);
    const portfolios = buildPortfolioMaps(nodes, edges);

    const vista = portfolios.find((p) => p.investorName === 'Vista Equity');
    expect(vista?.investorType).toBe('pe');

    const bigcorp = portfolios.find((p) => p.investorName === 'BigCorp Holdings');
    expect(bigcorp?.investorType).toBe('holding_company');
  });

  it('handles empty graph', () => {
    const portfolios = buildPortfolioMaps(new Map(), []);
    expect(portfolios.length).toBe(0);
  });
});
