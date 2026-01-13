/**
 * AI Provider Interface
 *
 * Defines the contract for AI recommendation providers.
 * This abstraction allows for future extensibility with different AI backends.
 */

import type { AIConfig, AIResponse, WatchHistoryItem } from '../types.js';

/**
 * Interface for AI recommendation providers
 */
export interface IAIProvider {
  /**
   * The name of the AI provider (e.g., "Gemini", "OpenAI")
   */
  readonly name: string;

  /**
   * The model identifier being used
   */
  readonly model: string;

  /**
   * Generate movie/series recommendations based on watch history
   *
   * @param watchHistory - Array of previously watched items with metadata
   * @param config - AI configuration including API key and temperature
   * @returns Promise resolving to recommendations with IMDB IDs and reasons
   */
  getRecommendations(watchHistory: WatchHistoryItem[], config: AIConfig): Promise<AIResponse>;

  /**
   * Validate that the provider is properly configured
   * (e.g., API key is valid, model is available)
   *
   * @param config - AI configuration to validate
   * @returns Promise resolving to true if valid, throws on error
   */
  validateConfig(config: AIConfig): Promise<boolean>;
}

/**
 * Error thrown when AI provider operations fail
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Error thrown when AI response cannot be parsed
 */
export class AIResponseParseError extends AIProviderError {
  constructor(
    message: string,
    provider: string,
    public readonly rawResponse: string
  ) {
    super(message, provider);
    this.name = 'AIResponseParseError';
  }
}
