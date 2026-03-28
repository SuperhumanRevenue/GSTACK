import { describe, it, expect } from 'vitest';
import { isValidTransition, VALID_TRANSITIONS } from '../../src/agents/program-manager/types.js';

describe('Program Manager: Status Transitions', () => {
  describe('VALID_TRANSITIONS map', () => {
    it('defines transitions for all statuses', () => {
      const expectedStatuses = [
        'ask_pending', 'ask_sent', 'intro_pending', 'intro_sent',
        'meeting_booked', 'opportunity_created', 'closed_won',
        'closed_lost', 'deferred', 'expired', 'declined',
      ];
      for (const status of expectedStatuses) {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
      }
    });

    it('terminal states have no transitions', () => {
      expect(VALID_TRANSITIONS['closed_won']).toEqual([]);
      expect(VALID_TRANSITIONS['closed_lost']).toEqual([]);
      expect(VALID_TRANSITIONS['declined']).toEqual([]);
    });

    it('deferred can re-enter pipeline', () => {
      expect(VALID_TRANSITIONS['deferred']).toContain('ask_pending');
      expect(VALID_TRANSITIONS['deferred']).toContain('ask_sent');
    });

    it('expired can restart', () => {
      expect(VALID_TRANSITIONS['expired']).toContain('ask_pending');
    });
  });

  describe('isValidTransition', () => {
    // Valid forward transitions
    it('allows ask_pending → ask_sent', () => {
      expect(isValidTransition('ask_pending', 'ask_sent')).toBe(true);
    });

    it('allows ask_sent → intro_pending', () => {
      expect(isValidTransition('ask_sent', 'intro_pending')).toBe(true);
    });

    it('allows intro_pending → intro_sent', () => {
      expect(isValidTransition('intro_pending', 'intro_sent')).toBe(true);
    });

    it('allows intro_sent → meeting_booked', () => {
      expect(isValidTransition('intro_sent', 'meeting_booked')).toBe(true);
    });

    it('allows meeting_booked → opportunity_created', () => {
      expect(isValidTransition('meeting_booked', 'opportunity_created')).toBe(true);
    });

    it('allows opportunity_created → closed_won', () => {
      expect(isValidTransition('opportunity_created', 'closed_won')).toBe(true);
    });

    it('allows opportunity_created → closed_lost', () => {
      expect(isValidTransition('opportunity_created', 'closed_lost')).toBe(true);
    });

    // Full pipeline path
    it('supports the full happy-path pipeline', () => {
      const happyPath = [
        'ask_pending', 'ask_sent', 'intro_pending', 'intro_sent',
        'meeting_booked', 'opportunity_created', 'closed_won',
      ];
      for (let i = 0; i < happyPath.length - 1; i++) {
        expect(isValidTransition(happyPath[i], happyPath[i + 1])).toBe(true);
      }
    });

    // Deferred transitions
    it('allows deferred from multiple stages', () => {
      expect(isValidTransition('ask_pending', 'deferred')).toBe(true);
      expect(isValidTransition('ask_sent', 'deferred')).toBe(true);
      expect(isValidTransition('intro_pending', 'deferred')).toBe(true);
      expect(isValidTransition('intro_sent', 'deferred')).toBe(true);
      expect(isValidTransition('meeting_booked', 'deferred')).toBe(true);
    });

    // Declined
    it('allows ask_sent → declined', () => {
      expect(isValidTransition('ask_sent', 'declined')).toBe(true);
    });

    // Invalid transitions
    it('rejects backward transitions', () => {
      expect(isValidTransition('intro_sent', 'ask_pending')).toBe(false);
      expect(isValidTransition('meeting_booked', 'intro_pending')).toBe(false);
      expect(isValidTransition('closed_won', 'opportunity_created')).toBe(false);
    });

    it('rejects skipping stages', () => {
      expect(isValidTransition('ask_pending', 'meeting_booked')).toBe(false);
      expect(isValidTransition('ask_sent', 'closed_won')).toBe(false);
    });

    it('rejects transitions from terminal states', () => {
      expect(isValidTransition('closed_won', 'ask_pending')).toBe(false);
      expect(isValidTransition('closed_lost', 'ask_pending')).toBe(false);
      expect(isValidTransition('declined', 'ask_pending')).toBe(false);
    });

    it('rejects unknown statuses', () => {
      expect(isValidTransition('nonexistent', 'ask_pending')).toBe(false);
    });
  });
});
