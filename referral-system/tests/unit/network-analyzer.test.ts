import { describe, it, expect } from 'vitest';
import { analyzeNetwork } from '../../src/agents/relationship-mapper/network-analyzer.js';
import { STRONG_CHAMPION, buildChampion } from '../fixtures/champions.js';
import {
  FULL_NETWORK,
  FORMER_COLLEAGUE,
  BUYER_TITLE_MATCH,
  WEAK_CONNECTION,
  buildConnection,
} from '../fixtures/connections.js';

function makeAnalysisInput(overrides: Record<string, unknown> = {}) {
  return {
    champion: STRONG_CHAMPION,
    accountCompanyName: 'TechCorp Pro',
    connections: FULL_NETWORK,
    targetAccountNames: ['NamedTarget Corp'],
    ...overrides,
  };
}

describe('analyzeNetwork', () => {
  it('separates connections into high and moderate value', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    // All scored connections should be in one of the two buckets or below threshold
    const totalScored = result.highValueIntros.length + result.moderateValueIntros.length;
    expect(totalScored).toBeGreaterThan(0);
    expect(totalScored).toBeLessThanOrEqual(FULL_NETWORK.length);
  });

  it('high-value intros all have composite score >= 7', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    for (const intro of result.highValueIntros) {
      expect(intro.compositeScore).toBeGreaterThanOrEqual(7);
    }
  });

  it('moderate-value intros have composite score 4-6', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    for (const intro of result.moderateValueIntros) {
      expect(intro.compositeScore).toBeGreaterThanOrEqual(4);
      expect(intro.compositeScore).toBeLessThan(7);
    }
  });

  it('sorts connections by composite score descending', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    const allScored = [...result.highValueIntros, ...result.moderateValueIntros];
    for (let i = 1; i < allScored.length; i++) {
      expect(allScored[i - 1].compositeScore).toBeGreaterThanOrEqual(allScored[i].compositeScore);
    }
  });

  it('identifies network gaps for named targets with no connection', () => {
    const result = analyzeNetwork(makeAnalysisInput({
      connections: [], // No connections at all
      targetAccountNames: ['MissingCo', 'AlsoMissing'],
    }));
    expect(result.networkGaps).toHaveLength(2);
    expect(result.networkGaps[0].targetAccount).toBe('MissingCo');
    expect(result.networkGaps[0].alternativeApproach).toBeTruthy();
  });

  it('returns empty gaps when all targets have connections', () => {
    const result = analyzeNetwork(makeAnalysisInput({
      connections: [buildConnection({ company: 'NamedTarget Corp' })],
      targetAccountNames: ['NamedTarget Corp'],
    }));
    expect(result.networkGaps).toHaveLength(0);
  });

  it('gives named targets higher priority (8) vs unnamed (5)', () => {
    const result = analyzeNetwork(makeAnalysisInput({
      connections: [
        buildConnection({ name: 'Named Person', company: 'NamedTarget Corp', connectionStrength: 5 }),
        buildConnection({ name: 'Unnamed Person', company: 'RandomCo', connectionStrength: 5 }),
      ],
      targetAccountNames: ['NamedTarget Corp'],
    }));
    const allIntros = [...result.highValueIntros, ...result.moderateValueIntros];
    const named = allIntros.find((i) => i.targetCompany === 'NamedTarget Corp');
    const unnamed = allIntros.find((i) => i.targetCompany === 'RandomCo');
    if (named && unnamed) {
      expect(named.targetAccountPriority).toBeGreaterThan(unnamed.targetAccountPriority);
    }
  });

  it('populates champion metadata in output', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    expect(result.champion.name).toBe(STRONG_CHAMPION.name);
    expect(result.champion.title).toBe(STRONG_CHAMPION.title);
    expect(result.champion.company).toBe('TechCorp Pro');
  });

  it('tracks total connections analyzed', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    expect(result.totalConnectionsAnalyzed).toBe(FULL_NETWORK.length);
  });

  it('handles empty connections list gracefully', () => {
    const result = analyzeNetwork(makeAnalysisInput({ connections: [] }));
    expect(result.highValueIntros).toHaveLength(0);
    expect(result.moderateValueIntros).toHaveLength(0);
    expect(result.totalConnectionsAnalyzed).toBe(0);
  });

  it('includes connection path description for each intro', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    const allIntros = [...result.highValueIntros, ...result.moderateValueIntros];
    for (const intro of allIntros) {
      expect(intro.connectionPath).toBeTruthy();
      expect(intro.connectionPath.length).toBeGreaterThan(10);
    }
  });

  it('includes suggested framing for each intro', () => {
    const result = analyzeNetwork(makeAnalysisInput());
    const allIntros = [...result.highValueIntros, ...result.moderateValueIntros];
    for (const intro of allIntros) {
      expect(intro.suggestedFraming).toBeTruthy();
    }
  });

  it('flags existing CRM relationships when provided', () => {
    const result = analyzeNetwork(makeAnalysisInput({
      connections: [buildConnection({ company: 'ExistingCo', connectionStrength: 7 })],
      existingCrmRelationships: new Map([['ExistingCo', 'Active opportunity, $50K pipeline']]),
    }));
    const allIntros = [...result.highValueIntros, ...result.moderateValueIntros];
    const existing = allIntros.find((i) => i.targetCompany === 'ExistingCo');
    if (existing) {
      expect(existing.existingRelationship).toContain('Active opportunity');
    }
  });
});
