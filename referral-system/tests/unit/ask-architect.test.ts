import { describe, it, expect } from 'vitest';
import { composeLiveAsk, composeAsyncAsk, composeSoftSeed, recommendVersion } from '../../src/agents/ask-architect/template-engine.js';
import { handleYesResponse, handleMaybeResponse, handleNoResponse, routeResponse } from '../../src/agents/ask-architect/response-router.js';
import type { ComposeInput } from '../../src/agents/ask-architect/types.js';
import type { ResponseHandlerInput } from '../../src/agents/ask-architect/types.js';

// ─── Fixtures ───

function makeComposeInput(overrides?: Partial<ComposeInput>): ComposeInput {
  return {
    championName: 'Sarah Chen',
    championTitle: 'VP Engineering',
    championCompany: 'AcmeCorp',
    targetContact: 'Michael Torres',
    targetTitle: 'CTO',
    targetCompany: 'TargetCo',
    triggerEvent: 'QBR showed 40% efficiency gain',
    resultsToReference: '40% reduction in deployment time',
    acvRange: '75k_250k',
    communicationStyle: 'casual',
    connectionPath: 'former colleague at TechStartup',
    ...overrides,
  };
}

function makeResponseInput(overrides?: Partial<ResponseHandlerInput>): ResponseHandlerInput {
  return {
    response: 'yes',
    championName: 'Sarah Chen',
    championCompany: 'AcmeCorp',
    targetContact: 'Michael Torres',
    targetTitle: 'CTO',
    targetCompany: 'TargetCo',
    triggerEvent: 'QBR showed 40% efficiency gain',
    owningAe: 'Alex Thompson',
    ...overrides,
  };
}

// ─── Template Engine Tests ───

describe('Ask Architect: Template Engine', () => {
  describe('composeLiveAsk', () => {
    it('generates a script with key mechanics', () => {
      const result = composeLiveAsk(makeComposeInput());
      expect(result.script).toContain('Sarah Chen');
      expect(result.script).toContain('Michael Torres');
      expect(result.script).toContain('TargetCo');
      expect(result.script).toContain('40% reduction in deployment time');
      expect(result.keyMechanics.length).toBeGreaterThanOrEqual(3);
    });

    it('never contains "do you know anyone" or "anyone you know"', () => {
      const result = composeLiveAsk(makeComposeInput());
      expect(result.script.toLowerCase()).not.toContain('anyone you know');
      expect(result.script.toLowerCase()).not.toContain('do you know anyone');
    });

    it('names the specific target person', () => {
      const result = composeLiveAsk(makeComposeInput());
      expect(result.script).toContain('Michael Torres');
      expect(result.script).toContain('CTO');
      expect(result.script).toContain('TargetCo');
    });

    it('adapts to formal communication style', () => {
      const casual = composeLiveAsk(makeComposeInput({ communicationStyle: 'casual' }));
      const formal = composeLiveAsk(makeComposeInput({ communicationStyle: 'formal' }));
      expect(casual.script).toContain('Hey');
      expect(formal.script).not.toContain('Hey');
    });

    it('describes former colleague connection naturally', () => {
      const result = composeLiveAsk(makeComposeInput({ connectionPath: 'former colleague at TechStartup' }));
      expect(result.script).toContain('shared history');
    });

    it('describes community connection naturally', () => {
      const result = composeLiveAsk(makeComposeInput({ connectionPath: 'community member at SaaS Leaders' }));
      expect(result.script).toContain('professional circles');
    });
  });

  describe('composeAsyncAsk', () => {
    it('generates subject, body, and key mechanics', () => {
      const result = composeAsyncAsk(makeComposeInput());
      expect(result.subject).toBeTruthy();
      expect(result.body).toBeTruthy();
      expect(result.keyMechanics.length).toBeGreaterThanOrEqual(3);
    });

    it('subject line names the target person', () => {
      const result = composeAsyncAsk(makeComposeInput());
      expect(result.subject).toContain('Michael Torres');
      expect(result.subject).toContain('TargetCo');
    });

    it('body is under 100 words', () => {
      const result = composeAsyncAsk(makeComposeInput());
      const wordCount = result.body.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(100);
    });

    it('never contains "anyone you know"', () => {
      const result = composeAsyncAsk(makeComposeInput());
      expect(result.body.toLowerCase()).not.toContain('anyone you know');
      expect(result.subject.toLowerCase()).not.toContain('anyone you know');
    });

    it('references trigger event and results', () => {
      const result = composeAsyncAsk(makeComposeInput());
      expect(result.body).toContain('QBR');
      expect(result.body).toContain('40% reduction in deployment time');
    });
  });

  describe('composeSoftSeed', () => {
    it('generates a message without a direct ask', () => {
      const result = composeSoftSeed(makeComposeInput());
      expect(result.message).toContain('Michael Torres');
      expect(result.message).toContain('TargetCo');
      expect(result.message).toContain('planting');
    });

    it('references results to establish credibility', () => {
      const result = composeSoftSeed(makeComposeInput());
      expect(result.message).toContain('40% reduction in deployment time');
    });

    it('never contains "anyone you know"', () => {
      const result = composeSoftSeed(makeComposeInput());
      expect(result.message.toLowerCase()).not.toContain('anyone you know');
    });
  });

  describe('recommendVersion', () => {
    it('recommends live for strong+meeting+recent', () => {
      const result = recommendVersion({
        relationshipStrength: 'strong',
        communicationStyle: 'casual',
        triggerRecency: 'recent',
        hasUpcomingMeeting: true,
      });
      expect(result.version).toBe('live');
    });

    it('recommends soft_seed for cold relationship', () => {
      const result = recommendVersion({
        relationshipStrength: 'cold',
        communicationStyle: 'casual',
        triggerRecency: 'recent',
        hasUpcomingMeeting: false,
      });
      expect(result.version).toBe('soft_seed');
    });

    it('recommends soft_seed for old trigger', () => {
      const result = recommendVersion({
        relationshipStrength: 'warm',
        communicationStyle: 'formal',
        triggerRecency: 'old',
        hasUpcomingMeeting: true,
      });
      expect(result.version).toBe('soft_seed');
    });

    it('recommends async as default for warm relationships', () => {
      const result = recommendVersion({
        relationshipStrength: 'warm',
        communicationStyle: 'casual',
        triggerRecency: 'recent',
        hasUpcomingMeeting: false,
      });
      expect(result.version).toBe('async');
    });

    it('always returns a reason', () => {
      const configs = [
        { relationshipStrength: 'strong', communicationStyle: 'casual' as const, triggerRecency: 'recent' as const, hasUpcomingMeeting: true },
        { relationshipStrength: 'cold', communicationStyle: 'formal' as const, triggerRecency: 'old' as const, hasUpcomingMeeting: false },
        { relationshipStrength: 'warm', communicationStyle: 'casual' as const, triggerRecency: 'moderate' as const, hasUpcomingMeeting: false },
      ];
      for (const config of configs) {
        const result = recommendVersion(config);
        expect(result.reason).toBeTruthy();
        expect(result.reason.length).toBeGreaterThan(10);
      }
    });
  });
});

// ─── Response Router Tests ───

describe('Ask Architect: Response Router', () => {
  describe('handleYesResponse', () => {
    it('produces intro email, AE response, and champion thank-you', () => {
      const assets = handleYesResponse(makeResponseInput());
      expect(assets.introEmailTemplate).toContain('Michael Torres');
      expect(assets.aeFirstResponse).toContain('Michael Torres');
      expect(assets.championThankYou).toContain('Sarah Chen');
    });

    it('intro email is from champion perspective', () => {
      const assets = handleYesResponse(makeResponseInput());
      expect(assets.introEmailTemplate).toContain('Sarah Chen');
      expect(assets.introEmailTemplate).toContain('Alex Thompson');
    });

    it('AE response references the champion', () => {
      const assets = handleYesResponse(makeResponseInput());
      expect(assets.aeFirstResponse).toContain('Sarah Chen');
      expect(assets.aeFirstResponse).toContain('TargetCo');
    });

    it('champion thank-you mentions the target', () => {
      const assets = handleYesResponse(makeResponseInput());
      expect(assets.championThankYou).toContain('Michael Torres');
      expect(assets.championThankYou).toContain('TargetCo');
    });
  });

  describe('handleMaybeResponse', () => {
    it('produces day 5 follow-up, day 12 nudge, and friction remover', () => {
      const assets = handleMaybeResponse(makeResponseInput({ response: 'maybe' }));
      expect(assets.day5Followup).toContain('Sarah Chen');
      expect(assets.day12FinalNudge).toContain('Sarah Chen');
      expect(assets.frictionRemover).toContain('Michael Torres');
    });

    it('day 5 follow-up offers pre-drafted intro', () => {
      const assets = handleMaybeResponse(makeResponseInput({ response: 'maybe' }));
      expect(assets.day5Followup.toLowerCase()).toContain('draft');
    });

    it('day 12 nudge is low-pressure', () => {
      const assets = handleMaybeResponse(makeResponseInput({ response: 'maybe' }));
      expect(assets.day12FinalNudge.toLowerCase()).toMatch(/last note|don't want to be a pest|no pressure/);
    });

    it('friction remover is a pre-drafted intro for champion to forward', () => {
      const assets = handleMaybeResponse(makeResponseInput({ response: 'maybe' }));
      expect(assets.frictionRemover).toContain('Michael Torres');
      expect(assets.frictionRemover).toContain('Sarah Chen');
    });
  });

  describe('handleNoResponse', () => {
    it('produces graceful close and alternative ask', () => {
      const assets = handleNoResponse(makeResponseInput({ response: 'no' }));
      expect(assets.gracefulClose).toContain('Sarah Chen');
      expect(assets.alternativeAsk).toContain('Sarah Chen');
    });

    it('graceful close preserves the relationship', () => {
      const assets = handleNoResponse(makeResponseInput({ response: 'no' }));
      expect(assets.gracefulClose.toLowerCase()).toMatch(/understand|appreciate|partnership/);
    });

    it('alternative ask offers case study option', () => {
      const assets = handleNoResponse(makeResponseInput({ response: 'no' }));
      expect(assets.alternativeAsk.toLowerCase()).toContain('case study');
    });
  });

  describe('routeResponse', () => {
    it('routes yes to YesResponseAssets', () => {
      const result = routeResponse(makeResponseInput({ response: 'yes' }));
      expect(result.type).toBe('yes');
      expect('introEmailTemplate' in result.assets).toBe(true);
      expect('aeFirstResponse' in result.assets).toBe(true);
      expect('championThankYou' in result.assets).toBe(true);
    });

    it('routes maybe to MaybeResponseAssets', () => {
      const result = routeResponse(makeResponseInput({ response: 'maybe' }));
      expect(result.type).toBe('maybe');
      expect('day5Followup' in result.assets).toBe(true);
      expect('day12FinalNudge' in result.assets).toBe(true);
      expect('frictionRemover' in result.assets).toBe(true);
    });

    it('routes no to NoResponseAssets', () => {
      const result = routeResponse(makeResponseInput({ response: 'no' }));
      expect(result.type).toBe('no');
      expect('gracefulClose' in result.assets).toBe(true);
      expect('alternativeAsk' in result.assets).toBe(true);
    });
  });
});
