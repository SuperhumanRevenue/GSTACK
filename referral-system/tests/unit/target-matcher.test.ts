import { describe, it, expect } from 'vitest';
import { matchTargets, type TargetAccount } from '../../src/agents/relationship-mapper/target-matcher.js';
import type { ScoredConnection } from '../../src/agents/relationship-mapper/types.js';

function makeScoredConnection(overrides?: Partial<ScoredConnection>): ScoredConnection {
  return {
    targetCompany: 'TargetCo',
    targetContact: 'Jane Smith',
    targetTitle: 'CTO',
    connectionPath: 'Sarah → Jane at TargetCo',
    connectionStrengthScore: 7,
    targetAccountPriority: 8,
    roleMatchScore: 9,
    painAlignmentScore: 7,
    timingSignalScore: 5,
    compositeScore: 7,
    suggestedFraming: 'Introduction via shared history',
    ...overrides,
  };
}

function makeTargetAccount(overrides?: Partial<TargetAccount>): TargetAccount {
  return {
    companyName: 'TargetCo',
    industry: 'Technology',
    employeeCount: 500,
    ...overrides,
  };
}

describe('matchTargets', () => {
  it('matches target accounts with available connections', () => {
    const result = matchTargets({
      scoredConnections: [makeScoredConnection({ targetCompany: 'AlphaCo' })],
      targetAccounts: [makeTargetAccount({ companyName: 'AlphaCo' })],
    });
    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0].bestConnection.targetCompany).toBe('AlphaCo');
  });

  it('reports unmatched targets with no connections', () => {
    const result = matchTargets({
      scoredConnections: [makeScoredConnection({ targetCompany: 'OtherCo' })],
      targetAccounts: [makeTargetAccount({ companyName: 'MissingCo' })],
    });
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].targetAccount.companyName).toBe('MissingCo');
    expect(result.unmatched[0].reason).toBeTruthy();
    expect(result.unmatched[0].suggestion).toBeTruthy();
  });

  it('selects the best connection (highest composite) for each target', () => {
    const result = matchTargets({
      scoredConnections: [
        makeScoredConnection({ targetCompany: 'AlphaCo', targetContact: 'Weak', compositeScore: 4 }),
        makeScoredConnection({ targetCompany: 'AlphaCo', targetContact: 'Strong', compositeScore: 9 }),
      ],
      targetAccounts: [makeTargetAccount({ companyName: 'AlphaCo' })],
    });
    expect(result.matched[0].bestConnection.targetContact).toBe('Strong');
    expect(result.matched[0].connections).toHaveLength(2);
  });

  it('sorts matched targets by best connection score descending', () => {
    const result = matchTargets({
      scoredConnections: [
        makeScoredConnection({ targetCompany: 'Low', compositeScore: 4 }),
        makeScoredConnection({ targetCompany: 'High', compositeScore: 9 }),
        makeScoredConnection({ targetCompany: 'Mid', compositeScore: 6 }),
      ],
      targetAccounts: [
        makeTargetAccount({ companyName: 'Low' }),
        makeTargetAccount({ companyName: 'High' }),
        makeTargetAccount({ companyName: 'Mid' }),
      ],
    });
    expect(result.matched[0].targetAccount.companyName).toBe('High');
    expect(result.matched[1].targetAccount.companyName).toBe('Mid');
    expect(result.matched[2].targetAccount.companyName).toBe('Low');
  });

  it('calculates ICP fit score with industry match', () => {
    const result = matchTargets({
      scoredConnections: [makeScoredConnection({ targetCompany: 'TechCo' })],
      targetAccounts: [makeTargetAccount({ companyName: 'TechCo', industry: 'Technology' })],
      icpCriteria: { industries: ['Technology'] },
    });
    expect(result.matched[0].icpFitScore).toBeGreaterThan(5); // Base + industry match bonus
  });

  it('returns neutral ICP score when no criteria provided', () => {
    const result = matchTargets({
      scoredConnections: [makeScoredConnection({ targetCompany: 'AnyCo' })],
      targetAccounts: [makeTargetAccount({ companyName: 'AnyCo' })],
    });
    expect(result.matched[0].icpFitScore).toBe(5);
  });

  it('handles case-insensitive company name matching', () => {
    const result = matchTargets({
      scoredConnections: [makeScoredConnection({ targetCompany: 'targetco' })],
      targetAccounts: [makeTargetAccount({ companyName: 'TargetCo' })],
    });
    expect(result.matched).toHaveLength(1);
  });

  it('handles empty inputs gracefully', () => {
    const result = matchTargets({
      scoredConnections: [],
      targetAccounts: [],
    });
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it('provides high-priority suggestion for unmatched high-priority targets', () => {
    const result = matchTargets({
      scoredConnections: [],
      targetAccounts: [makeTargetAccount({ companyName: 'ImportantCo', priority: 9 })],
    });
    expect(result.unmatched[0].suggestion).toContain('High-priority');
  });
});
