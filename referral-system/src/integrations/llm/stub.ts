import pino from 'pino';
import type { LLMAdapter, LLMOptions } from './interface.js';

const logger = pino({ name: 'llm-stub' });

/**
 * LLM stub — returns deterministic content for testing.
 * In production, swap for Claude/GPT/Gemini adapter.
 */
export class LLMStub implements LLMAdapter {
  async generateContent(prompt: string, options?: LLMOptions): Promise<string> {
    logger.debug({ promptLength: prompt.length }, 'LLM stub: generating content');

    // Return a structured response that the guide generator can parse
    if (prompt.includes('customize signal')) {
      return JSON.stringify({
        customizedName: 'Customized signal from stub',
        customizedDescription: 'This is a stub-generated customization based on the customer context provided.',
        customizedPlaybook: 'Stub playbook: research the signal, validate with customer data, and take action.',
        relevanceScore: 75,
        exampleTriggers: ['Example trigger 1', 'Example trigger 2'],
      });
    }

    return 'Stub LLM response — replace with real adapter for production use.';
  }
}
