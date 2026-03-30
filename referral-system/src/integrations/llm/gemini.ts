import pino from 'pino';
import type { LLMAdapter, LLMOptions } from './interface.js';

const logger = pino({ name: 'llm-gemini' });

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Google Gemini LLM adapter.
 * Uses the generateContent API.
 */
export class GeminiAdapter implements LLMAdapter {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'gemini-2.0-flash') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async generateContent(prompt: string, options?: LLMOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;
    const temperature = options?.temperature ?? 0.3;

    logger.debug({ model, maxTokens, promptLength: prompt.length }, 'Gemini: generating content');

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, 'Gemini API error');
      throw new Error(`Gemini API error (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      candidates: { content: { parts: { text: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned no content');
    }

    logger.debug({ responseLength: text.length }, 'Gemini: content generated');
    return text;
  }
}
