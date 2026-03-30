import { describe, it, expect } from 'vitest';
import { analyzeRevenue, computeGini } from '../../src/agents/pcp-builder/revenue-analyzer.js';
import { extractAttributes, bucketEmployeeCount, bucketAcv, bucketHealthScore, bucketNps, bucketTenure } from '../../src/agents/pcp-builder/attribute-extractor.js';
import { buildIcpWeights, scoreTarget } from '../../src/agents/pcp-builder/icp-weight-builder.js';
import { ValidationError } from '../../src/shared/errors.js';
import type { RevenueDataPoint, AccountAttribute } from '../../src/agents/pcp-builder/types.js';
import type { Account } from '../../src/db/schema.js';

// ─── Fixtures ───

function makeRevenueData(count: number): RevenueDataPoint[] {
  // Create power-law-like distribution: top accounts have exponentially more revenue
  return Array.from({ length: count }, (_, i) => ({
    accountId: `acct-${i}`,
    companyName: `Company ${i}`,
    revenue: Math.pow(count - i, 2) * 1000, // quadratic: top account >> bottom
    industry: i % 3 === 0 ? 'SaaS' : i % 3 === 1 ? 'FinTech' : 'Healthcare',
    employeeCount: (i + 1) * 100,
    dealCount: Math.ceil(Math.random() * 5),
  }));
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'test-id',
    crmAccountId: null,
    companyName: 'Test Corp',
    industry: 'SaaS',
    employeeCount: 500,
    currentAcv: '150000',
    contractStartDate: null,
    renewalDate: null,
    tenureMonths: 24,
    csHealthScore: 85,
    npsScore: 9,
    lastQbrDate: null,
    lastQbrOutcome: null,
    supportEscalationActive: false,
    churnRiskActive: false,
    usageTrend: 'growing',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Account;
}

// ─── Revenue Analyzer Tests ───

describe('analyzeRevenue', () => {
  it('assigns tiers based on revenue rank', () => {
    const data = makeRevenueData(100);
    const result = analyzeRevenue(data);

    expect(result.totalAccounts).toBe(100);
    expect(result.tiers.powerLaw.count).toBe(3); // top 3%
    // ceil(7%) = 7 or 8 depending on rounding; just check total adds up
    const totalTiered =
      result.tiers.powerLaw.count +
      result.tiers.highValue.count +
      result.tiers.core.count +
      result.tiers.longTail.count;
    expect(totalTiered).toBe(100);
  });

  it('power-law accounts capture disproportionate revenue', () => {
    const data = makeRevenueData(100);
    const result = analyzeRevenue(data);

    // With quadratic distribution, top 3% should have significantly more than 3% of revenue
    expect(result.tiers.powerLaw.revenuePct).toBeGreaterThan(3);
  });

  it('all tiers sum to 100% revenue', () => {
    const data = makeRevenueData(50);
    const result = analyzeRevenue(data);

    const totalPct =
      result.tiers.powerLaw.revenuePct +
      result.tiers.highValue.revenuePct +
      result.tiers.core.revenuePct +
      result.tiers.longTail.revenuePct;

    expect(totalPct).toBeCloseTo(100, 1);
  });

  it('all accounts sum to total count', () => {
    const data = makeRevenueData(33);
    const result = analyzeRevenue(data);

    const totalAccounts =
      result.tiers.powerLaw.count +
      result.tiers.highValue.count +
      result.tiers.core.count +
      result.tiers.longTail.count;

    expect(totalAccounts).toBe(33);
  });

  it('throws on empty data', () => {
    expect(() => analyzeRevenue([])).toThrow(ValidationError);
  });

  it('throws on zero total revenue', () => {
    const data = [{ accountId: 'a', companyName: 'A', revenue: 0 }];
    expect(() => analyzeRevenue(data)).toThrow(ValidationError);
  });

  it('handles single account', () => {
    const data = [{ accountId: 'a', companyName: 'A', revenue: 100000 }];
    const result = analyzeRevenue(data);

    expect(result.totalAccounts).toBe(1);
    expect(result.tiers.powerLaw.count).toBe(1);
    expect(result.tiers.powerLaw.revenuePct).toBe(100);
  });

  it('accepts custom tier thresholds', () => {
    const data = makeRevenueData(100);
    const result = analyzeRevenue(data, { powerLawPct: 5, highValuePct: 10, corePct: 35 });

    expect(result.tiers.powerLaw.count).toBe(5);
    expect(result.tiers.highValue.count).toBe(10);
    expect(result.tiers.core.count).toBe(35);
    expect(result.tiers.longTail.count).toBe(50);
  });

  it('accounts are sorted by revenue descending', () => {
    const data = makeRevenueData(20);
    const result = analyzeRevenue(data);

    const powerLawRevenues = result.tiers.powerLaw.accounts.map((a) => a.revenue);
    for (let i = 1; i < powerLawRevenues.length; i++) {
      expect(powerLawRevenues[i]).toBeLessThanOrEqual(powerLawRevenues[i - 1]);
    }
  });
});

describe('computeGini', () => {
  it('returns 0 for perfectly equal distribution', () => {
    expect(computeGini([100, 100, 100, 100])).toBeCloseTo(0, 1);
  });

  it('returns high value for highly unequal distribution', () => {
    const values = [1000000, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    expect(computeGini(values)).toBeGreaterThan(0.8);
  });

  it('returns 0 for single value', () => {
    expect(computeGini([500])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(computeGini([])).toBe(0);
  });

  it('Gini is between 0 and 1', () => {
    const gini = computeGini(makeRevenueData(100).map((d) => d.revenue));
    expect(gini).toBeGreaterThanOrEqual(0);
    expect(gini).toBeLessThanOrEqual(1);
  });
});

// ─── Attribute Extractor Tests ───

describe('extractAttributes', () => {
  it('extracts all available attributes', () => {
    const account = makeAccount();
    const attrs = extractAttributes(account);

    const attrNames = attrs.map((a) => a.attribute);
    expect(attrNames).toContain('industry');
    expect(attrNames).toContain('employee_count_range');
    expect(attrNames).toContain('acv_range');
    expect(attrNames).toContain('usage_trend');
    expect(attrNames).toContain('cs_health_range');
    expect(attrNames).toContain('nps_range');
    expect(attrNames).toContain('tenure_range');
    expect(attrNames).toContain('support_escalation');
    expect(attrNames).toContain('churn_risk');
  });

  it('skips null/undefined attributes', () => {
    const account = makeAccount({
      industry: null,
      employeeCount: null,
      currentAcv: null,
      usageTrend: null,
      csHealthScore: null,
      npsScore: null,
      tenureMonths: null,
    });
    const attrs = extractAttributes(account);

    // Should only have support_escalation and churn_risk (booleans)
    expect(attrs.length).toBe(2);
  });
});

describe('bucketEmployeeCount', () => {
  it('buckets correctly', () => {
    expect(bucketEmployeeCount(10)).toBe('1-49');
    expect(bucketEmployeeCount(100)).toBe('50-199');
    expect(bucketEmployeeCount(300)).toBe('200-499');
    expect(bucketEmployeeCount(750)).toBe('500-999');
    expect(bucketEmployeeCount(2000)).toBe('1000-4999');
    expect(bucketEmployeeCount(10000)).toBe('5000+');
  });
});

describe('bucketAcv', () => {
  it('buckets correctly', () => {
    expect(bucketAcv(10000)).toBe('under_30k');
    expect(bucketAcv(50000)).toBe('30k_75k');
    expect(bucketAcv(150000)).toBe('75k_250k');
    expect(bucketAcv(500000)).toBe('250k_1m');
    expect(bucketAcv(2000000)).toBe('1m_plus');
  });
});

describe('bucketHealthScore', () => {
  it('buckets correctly', () => {
    expect(bucketHealthScore(90)).toBe('healthy');
    expect(bucketHealthScore(70)).toBe('moderate');
    expect(bucketHealthScore(50)).toBe('at_risk');
    expect(bucketHealthScore(20)).toBe('critical');
  });
});

describe('bucketNps', () => {
  it('buckets correctly', () => {
    expect(bucketNps(10)).toBe('promoter');
    expect(bucketNps(8)).toBe('passive');
    expect(bucketNps(5)).toBe('detractor');
  });
});

describe('bucketTenure', () => {
  it('buckets correctly', () => {
    expect(bucketTenure(3)).toBe('new');
    expect(bucketTenure(9)).toBe('6_12m');
    expect(bucketTenure(18)).toBe('1_2y');
    expect(bucketTenure(36)).toBe('2_4y');
    expect(bucketTenure(60)).toBe('4y_plus');
  });
});

// ─── ICP Weight Builder Tests ───

describe('buildIcpWeights', () => {
  it('computes lift scores for attributes overrepresented in power-law tier', () => {
    // Power-law accounts: all SaaS, 500+ employees
    const powerLawAttrs: AccountAttribute[][] = [
      [{ attribute: 'industry', value: 'SaaS' }, { attribute: 'employee_count_range', value: '500-999' }],
      [{ attribute: 'industry', value: 'SaaS' }, { attribute: 'employee_count_range', value: '500-999' }],
      [{ attribute: 'industry', value: 'SaaS' }, { attribute: 'employee_count_range', value: '1000-4999' }],
    ];

    // All accounts: mixed
    const allAttrs: AccountAttribute[][] = [
      ...powerLawAttrs,
      [{ attribute: 'industry', value: 'SaaS' }, { attribute: 'employee_count_range', value: '1-49' }],
      [{ attribute: 'industry', value: 'Healthcare' }, { attribute: 'employee_count_range', value: '50-199' }],
      [{ attribute: 'industry', value: 'Healthcare' }, { attribute: 'employee_count_range', value: '50-199' }],
      [{ attribute: 'industry', value: 'FinTech' }, { attribute: 'employee_count_range', value: '200-499' }],
      [{ attribute: 'industry', value: 'FinTech' }, { attribute: 'employee_count_range', value: '1-49' }],
      [{ attribute: 'industry', value: 'Healthcare' }, { attribute: 'employee_count_range', value: '1-49' }],
      [{ attribute: 'industry', value: 'SaaS' }, { attribute: 'employee_count_range', value: '200-499' }],
    ];

    const result = buildIcpWeights(powerLawAttrs, allAttrs);

    // SaaS appears in 100% of power-law vs 50% overall → lift = 2.0
    const saasAttr = result.attributes.find((a) => a.attribute === 'industry' && a.value === 'SaaS');
    expect(saasAttr).toBeDefined();
    expect(saasAttr!.liftScore).toBeCloseTo(2.0, 1);

    // 500-999 appears in 66% of power-law vs 20% overall → lift > 1
    const empAttr = result.attributes.find((a) => a.attribute === 'employee_count_range' && a.value === '500-999');
    expect(empAttr).toBeDefined();
    expect(empAttr!.liftScore).toBeGreaterThan(1);

    // Healthcare in 0% of power-law → not in results (power_law_freq = 0)
    const healthcareAttr = result.attributes.find((a) => a.value === 'Healthcare');
    expect(healthcareAttr).toBeUndefined();
  });

  it('handles empty power-law set', () => {
    const result = buildIcpWeights([], [[{ attribute: 'industry', value: 'SaaS' }]]);
    expect(result.attributes.length).toBe(0);
    expect(result.totalPowerLawAccounts).toBe(0);
  });

  it('weights are normalized 0-1', () => {
    const powerLaw: AccountAttribute[][] = [
      [{ attribute: 'industry', value: 'SaaS' }],
      [{ attribute: 'industry', value: 'SaaS' }],
    ];
    const all: AccountAttribute[][] = [
      ...powerLaw,
      [{ attribute: 'industry', value: 'FinTech' }],
      [{ attribute: 'industry', value: 'FinTech' }],
    ];

    const result = buildIcpWeights(powerLaw, all);
    for (const attr of result.attributes) {
      expect(attr.weight).toBeGreaterThanOrEqual(0);
      expect(attr.weight).toBeLessThanOrEqual(1);
    }
  });

  it('topAttributes returns top 10 sorted by lift', () => {
    const powerLaw: AccountAttribute[][] = Array(5).fill([
      { attribute: 'a', value: '1' },
      { attribute: 'b', value: '2' },
      { attribute: 'c', value: '3' },
    ]);
    const all: AccountAttribute[][] = [
      ...powerLaw,
      ...Array(95).fill([
        { attribute: 'a', value: '1' },
        { attribute: 'b', value: '2' },
        { attribute: 'd', value: '4' },
      ]),
    ];

    const result = buildIcpWeights(powerLaw, all);
    expect(result.topAttributes.length).toBeLessThanOrEqual(10);
    // c=3 has highest lift (in 100% of power-law, only 5% of overall)
    expect(result.topAttributes[0].attribute).toBe('c');
  });
});

describe('scoreTarget', () => {
  const weights = [
    { attribute: 'industry', value: 'SaaS', powerLawFrequency: 1.0, overallFrequency: 0.5, liftScore: 2.0, weight: 1.0, sampleSize: 3 },
    { attribute: 'employee_count_range', value: '500-999', powerLawFrequency: 0.67, overallFrequency: 0.2, liftScore: 3.35, weight: 0.8, sampleSize: 2 },
    { attribute: 'acv_range', value: '75k_250k', powerLawFrequency: 0.67, overallFrequency: 0.3, liftScore: 2.23, weight: 0.6, sampleSize: 2 },
    { attribute: 'usage_trend', value: 'growing', powerLawFrequency: 1.0, overallFrequency: 0.4, liftScore: 2.5, weight: 0.9, sampleSize: 3 },
  ];

  it('scores a perfect match as excellent', () => {
    const result = scoreTarget(
      { industry: 'SaaS', employeeCount: 750, acv: 150000, usageTrend: 'growing' },
      weights
    );
    expect(result.totalScore).toBe(100);
    expect(result.tier).toBe('excellent');
    expect(result.matchedAttributes.length).toBe(4);
  });

  it('scores partial match proportionally', () => {
    const result = scoreTarget({ industry: 'SaaS' }, weights);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.totalScore).toBeLessThan(100);
    expect(result.matchedAttributes.length).toBe(1);
    expect(result.unmatchedTopAttributes.length).toBeGreaterThan(0);
  });

  it('scores no match as weak', () => {
    const result = scoreTarget({ industry: 'Construction' }, weights);
    expect(result.totalScore).toBe(0);
    expect(result.tier).toBe('weak');
    expect(result.matchedAttributes.length).toBe(0);
  });

  it('provides gap analysis for unmatched attributes', () => {
    const result = scoreTarget({ industry: 'SaaS' }, weights);
    const unmatchedAttrs = result.unmatchedTopAttributes.map((u) => u.attribute);
    expect(unmatchedAttrs).toContain('employee_count_range');
    expect(unmatchedAttrs).toContain('usage_trend');
  });

  it('classifies tiers correctly', () => {
    // 4 of 4 matched = 100 -> excellent
    const all = scoreTarget({ industry: 'SaaS', employeeCount: 750, acv: 150000, usageTrend: 'growing' }, weights);
    expect(all.tier).toBe('excellent');

    // 0 matched = 0 -> weak
    const none = scoreTarget({}, weights);
    expect(none.tier).toBe('weak');
  });
});
