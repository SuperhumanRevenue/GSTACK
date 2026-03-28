/**
 * LLM adapter interface — provider-agnostic content generation.
 * Used by the Signal Guide Generator to customize signals per customer.
 */

export interface LLMAdapter {
  /** Generate freeform text content from a prompt */
  generateContent(prompt: string, options?: LLMOptions): Promise<string>;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}
