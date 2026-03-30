import pino from 'pino';
import type { LLMAdapter, LLMOptions } from './interface.js';

const logger = pino({ name: 'llm-openai' });

const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * OpenAI GPT LLM adapter.
 * Uses the Chat Completions API for content generation.
 */
export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'gpt-4o') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async generateContent(prompt: string, options?: LLMOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;
    const temperature = options?.temperature ?? 0.3;

    logger.debug({ model, maxTokens, promptLength: prompt.length }, 'OpenAI: generating content');

    const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
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
      logger.error({ status: res.status, body: text }, 'OpenAI API error');
      throw new Error(`OpenAI API error (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('OpenAI returned no content');
    }

    const content = data.choices[0].message.content;
    logger.debug({ responseLength: content.length }, 'OpenAI: content generated');
    return content;
  }
}
