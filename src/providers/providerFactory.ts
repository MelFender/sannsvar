/**
 * AI Provider Factory
 *
 * Creates and manages AI provider instances.
 * Supports multiple AI backends:
 * - Gemini (Google AI)
 * - OpenAI (GPT)
 * - Claude (Anthropic)
 * - Groq (fast Llama inference)
 * - DeepSeek (reasoning models)
 * - OpenRouter (unified access to many models)
 */

import type { IAIProvider } from './IAIProvider.js';
import { GeminiAdapter } from './GeminiAdapter.js';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { ClaudeAdapter } from './ClaudeAdapter.js';
import { GroqAdapter } from './GroqAdapter.js';
import { DeepSeekAdapter } from './DeepSeekAdapter.js';
import { OpenRouterAdapter } from './OpenRouterAdapter.js';

export type ProviderType = 'gemini' | 'openai' | 'claude' | 'groq' | 'deepseek' | 'openrouter';

const PROVIDERS: Record<ProviderType, () => IAIProvider> = {
  gemini: () => new GeminiAdapter(),
  openai: () => new OpenAIAdapter(),
  claude: () => new ClaudeAdapter(),
  groq: () => new GroqAdapter(),
  deepseek: () => new DeepSeekAdapter(),
  openrouter: () => new OpenRouterAdapter(),
};

/**
 * Create an AI provider instance
 *
 * @param type - The type of provider to create
 * @returns An instance of the requested AI provider
 */
export function createProvider(type: ProviderType = 'gemini'): IAIProvider {
  const factory = PROVIDERS[type];

  if (!factory) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  return factory();
}

/**
 * Get the default provider instance
 */
export function getDefaultProvider(): IAIProvider {
  return createProvider('gemini');
}

/**
 * List available provider types
 */
export function getAvailableProviders(): ProviderType[] {
  return Object.keys(PROVIDERS) as ProviderType[];
}
