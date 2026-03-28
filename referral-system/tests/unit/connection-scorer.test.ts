import { describe, it, expect } from 'vitest';
import { scoreConnection, generateFraming, inferConnectionType } from '../../src/agents/relationship-mapper/connection-scorer.js';
import type { ConnectionScoringInput } from '../../src/agents/relationship-mapper/types.js';

function makeInput(overrides?: Partial<ConnectionScoringInput>): ConnectionScoringInput {
  return {
    connectionType: 'linkedin',
    connectionStrength: 5,
    targetAccountPriority: 5,
    buyerTitleMatch: false,
    painAlignment: 0.5,
    hasTimingSignal: false,
    ...overrides,
  };
}

describe('scoreConnection', () => {
  // ─── Connection type bonuses ───

  it('gives former colleagues a +2 bonus to connection strength', () => {
    const formerColleague = scoreConnection(makeInput({
      connectionType: 'former_colleague',
      connectionStrength: 5,
    }));
    const linkedIn = scoreConnection(makeInput({
      connectionType: 'linkedin',
      connectionStrength: 5,
    }));
    expect(formerColleague.connectionStrengthScore).toBe(7);
    expect(linkedIn.connectionStrengthScore).toBe(5);
  });

  it('gives community connections a +1 bonus', () => {
    const community = scoreConnection(makeInput({
      connectionType: 'community',
      connectionStrength: 5,
    }));
    expect(community.connectionStrengthScore).toBe(6);
  });

  it('caps connection strength at 10', () => {
    const result = scoreConnection(makeInput({
      connectionType: 'former_colleague',
      connectionStrength: 9,
    }));
    expect(result.connectionStrengthScore).toBe(10);
  });

  // ─── Role match ───

  it('scores buyer title match as 9', () => {
    const result = scoreConnection(makeInput({ buyerTitleMatch: true }));
    expect(result.roleMatchScore).toBe(9);
  });

  it('scores non-buyer title as 4', () => {
    const result = scoreConnection(makeInput({ buyerTitleMatch: false }));
    expect(result.roleMatchScore).toBe(4);
  });

  // ─── Timing signals ───

  it('scores high-intensity timing signal as 10', () => {
    const result = scoreConnection(makeInput({
      hasTimingSignal: true,
      intentIntensity: 'high',
    }));
    expect(result.timingSignalScore).toBe(10);
  });

  it('scores no timing signal as 3', () => {
    const result = scoreConnection(makeInput({ hasTimingSignal: false }));
    expect(result.timingSignalScore).toBe(3);
  });

  // ─── Composite score ───

  it('produces composite between 1 and 10', () => {
    const result = scoreConnection(makeInput());
    expect(result.compositeScore).toBeGreaterThanOrEqual(1);
    expect(result.compositeScore).toBeLessThanOrEqual(10);
  });

  it('scores a strong connection higher than a weak one', () => {
    const strong = scoreConnection(makeInput({
      connectionType: 'former_colleague',
      connectionStrength: 9,
      targetAccountPriority: 9,
      buyerTitleMatch: true,
      painAlignment: 0.9,
      hasTimingSignal: true,
      intentIntensity: 'high',
    }));
    const weak = scoreConnection(makeInput({
      connectionType: 'other',
      connectionStrength: 2,
      targetAccountPriority: 3,
      buyerTitleMatch: false,
      painAlignment: 0.2,
      hasTimingSignal: false,
    }));
    expect(strong.compositeScore).toBeGreaterThan(weak.compositeScore);
  });

  it('all factors contribute to composite (weighted sum)', () => {
    const allMax = scoreConnection(makeInput({
      connectionType: 'former_colleague',
      connectionStrength: 10,
      targetAccountPriority: 10,
      buyerTitleMatch: true,
      painAlignment: 1.0,
      hasTimingSignal: true,
      intentIntensity: 'high',
    }));
    expect(allMax.compositeScore).toBe(10);
  });

  // ─── Pain alignment scaling ───

  it('scales pain alignment from 0-1 to 1-10', () => {
    const high = scoreConnection(makeInput({ painAlignment: 0.9 }));
    const low = scoreConnection(makeInput({ painAlignment: 0.1 }));
    expect(high.painAlignmentScore).toBeGreaterThan(low.painAlignmentScore);
  });

  // ─── Boundary values ───

  it('clamps target account priority to 1-10', () => {
    const tooHigh = scoreConnection(makeInput({ targetAccountPriority: 15 }));
    const tooLow = scoreConnection(makeInput({ targetAccountPriority: -1 }));
    expect(tooHigh.targetAccountPriority).toBe(10);
    expect(tooLow.targetAccountPriority).toBe(1);
  });
});

describe('generateFraming', () => {
  it('generates framing for former colleagues', () => {
    const framing = generateFraming('Sarah', 'Jane', 'TargetCo', 'former_colleague', 'CTO');
    expect(framing).toContain('worked with');
    expect(framing).toContain('Sarah');
    expect(framing).toContain('Jane');
  });

  it('generates framing for community connections', () => {
    const framing = generateFraming('Sarah', 'Bob', 'TargetCo', 'community', 'VP');
    expect(framing).toContain('community');
  });

  it('generates framing for LinkedIn connections', () => {
    const framing = generateFraming('Sarah', 'Carol', 'TargetCo', 'linkedin', 'Director');
    expect(framing).toContain('LinkedIn');
    expect(framing).toContain('TargetCo');
  });
});

describe('inferConnectionType', () => {
  it('identifies former colleague when champion worked at target company', () => {
    const type = inferConnectionType(['TargetCo', 'OtherCo'], [], 'TargetCo');
    expect(type).toBe('former_colleague');
  });

  it('identifies community connection when champion has communities', () => {
    const type = inferConnectionType([], ['SaaStr', 'Pavilion'], 'SomeCo');
    expect(type).toBe('community');
  });

  it('defaults to linkedin when no other signal', () => {
    const type = inferConnectionType([], [], 'SomeCo');
    expect(type).toBe('linkedin');
  });

  it('uses enrichment data when available', () => {
    const type = inferConnectionType([], [], 'SomeCo', {
      id: '1', name: 'Test', title: 'CTO', company: 'SomeCo',
      connectionType: 'former_colleague', connectionStrength: 8,
    });
    expect(type).toBe('former_colleague');
  });
});
