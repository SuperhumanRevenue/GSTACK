import { describe, it, expect } from 'vitest';
import { scoreTarget, assignPriority, TARGET_WEIGHTS } from '../../src/agents/program-manager/target-scorer.js';

describe('Program Manager: Target Scoring', () => {
  it('scores a perfect target at 100', () => {
    const result = scoreTarget({
      icpFit: 10,
      painAlignment: 10,
      championCredibility: 10,
      timing: 10,
      dealSize: 10,
    });
    expect(result.totalScore).toBe(100);
    expect(result.priority).toBe('high');
  });

  it('scores a zero target at 0', () => {
    const result = scoreTarget({
      icpFit: 0,
      painAlignment: 0,
      championCredibility: 0,
      timing: 0,
      dealSize: 0,
    });
    expect(result.totalScore).toBe(0);
    expect(result.priority).toBe('low');
  });

  it('weights ICP fit highest (30 pts max)', () => {
    const result = scoreTarget({
      icpFit: 10,
      painAlignment: 0,
      championCredibility: 0,
      timing: 0,
      dealSize: 0,
    });
    expect(result.icpFitScore).toBe(30);
    expect(result.totalScore).toBe(30);
  });

  it('weights deal size lowest (10 pts max)', () => {
    const result = scoreTarget({
      icpFit: 0,
      painAlignment: 0,
      championCredibility: 0,
      timing: 0,
      dealSize: 10,
    });
    expect(result.dealSizeScore).toBe(10);
    expect(result.totalScore).toBe(10);
  });

  it('clamps inputs to 0-10 range', () => {
    const result = scoreTarget({
      icpFit: 15,
      painAlignment: -5,
      championCredibility: 10,
      timing: 10,
      dealSize: 10,
    });
    // icpFit clamped to 10 → 30, painAlignment clamped to 0 → 0
    expect(result.icpFitScore).toBe(30);
    expect(result.painAlignmentScore).toBe(0);
  });

  describe('assignPriority', () => {
    it('assigns high at 70+', () => {
      expect(assignPriority(70)).toBe('high');
      expect(assignPriority(100)).toBe('high');
    });

    it('assigns medium at 40-69', () => {
      expect(assignPriority(40)).toBe('medium');
      expect(assignPriority(69)).toBe('medium');
    });

    it('assigns low below 40', () => {
      expect(assignPriority(39)).toBe('low');
      expect(assignPriority(0)).toBe('low');
    });
  });
});
