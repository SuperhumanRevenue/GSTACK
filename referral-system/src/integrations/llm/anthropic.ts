import pino from 'pino';
import type { LLMAdapter, LLMOptions } from './interface.js';

const logger = pino({ name: 'llm-anthropic' });

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';

/**
 * Anthropic Claude LLM adapter.
 * Uses the Messages API for content generation.
 */
export class AnthropicAdapter implements LLMAdapter {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async generateContent(prompt: string, options?: LLMOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;
    const temperature = options?.temperature ?? 0.3;

    logger.debug({ model, maxTokens, promptLength: prompt.length }, 'Anthropic: generating content');

    const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, 'Anthropic API error');
      throw new Error(`Anthropic API error (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      content: { type: string; text: string }[];
    };

    const textBlock = data.content.find((c) => c.type === 'text');
    if (!textBlock) {
      throw new Error('Anthropic returned no text content');
    }

    logger.debug({ responseLength: textBlock.text.length }, 'Anthropic: content generated');
    return textBlock.text;
  }
}
