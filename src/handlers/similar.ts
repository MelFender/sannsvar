/**
 * Similar Content Handler
 *
 * Generates AI-powered "similar to X" recommendations.
 * Used by the meta handler to show related content.
 */

import { createProvider, type IAIProvider } from '../providers/index.js';
import type { ProviderType } from '../providers/providerFactory.js';
import { CacheRepository } from '../db/index.js';
import type { UserConfig, StremioMeta, Recommendation, AIConfig } from '../types.js';

/**
 * Provider info with OAuth token
 */
interface ProviderInfo {
  type: ProviderType;
  accessToken: string;
}

/**
 * Get all available providers from user config
 */
function getAvailableProviders(config: UserConfig): ProviderInfo[] {
  const providers: ProviderInfo[] = [];

  if (config.googleOAuth?.accessToken) {
    providers.push({ type: 'gemini', accessToken: config.googleOAuth.accessToken });
  }
  if (config.openaiOAuth?.accessToken) {
    providers.push({ type: 'openai', accessToken: config.openaiOAuth.accessToken });
  }
  if (config.claudeOAuth?.accessToken) {
    providers.push({ type: 'claude', accessToken: config.claudeOAuth.accessToken });
  }

  return providers;
}

/**
 * Round-robin counter for provider selection
 */
let providerCounter = 0;

/**
 * Select a provider using round-robin across available providers
 */
function selectProvider(config: UserConfig): { provider: IAIProvider; aiConfig: AIConfig & { accessToken?: string } } {
  const providers = getAvailableProviders(config);

  // If we have OAuth providers, use round-robin
  if (providers.length > 0) {
    const selectedIndex = providerCounter % providers.length;
    providerCounter++;

    const selected = providers[selectedIndex];
    console.log(`[Similar:MultiProvider] Selected: ${selected.type}`);

    return {
      provider: createProvider(selected.type),
      aiConfig: {
        apiKey: '',
        accessToken: selected.accessToken,
        temperature: config.temperature,
      },
    };
  }

  // Fall back to API key with Gemini
  if (!config.geminiApiKey) {
    throw new Error('No AI credentials configured');
  }

  return {
    provider: createProvider('gemini'),
    aiConfig: {
      apiKey: config.geminiApiKey,
      temperature: config.temperature,
    },
  };
}

// Number of similar items to return
const SIMILAR_COUNT = 10;

/**
 * Get similar recommendations for a specific title
 *
 * @param config - User configuration
 * @param sourceImdbId - IMDB ID of the source title
 * @param sourceTitle - Title of the source (for better AI context)
 * @param contentType - 'movie' or 'series'
 */
export async function getSimilar(
  config: UserConfig,
  sourceImdbId: string,
  sourceTitle: string,
  contentType: 'movie' | 'series'
): Promise<StremioMeta[]> {
  const cache = new CacheRepository();
  const cacheKey = `similar:${sourceImdbId}`;

  try {
    // Check cache first
    const cached = cache.getRecommendations(cacheKey, []);
    if (cached && cached.length > 0) {
      console.log(`[Similar] Using cached results for ${sourceImdbId}`);
      return recommendationsToMetas(cached, contentType);
    }

    console.log(`[Similar] Generating recommendations similar to "${sourceTitle}" (${sourceImdbId})`);

    // Use multi-provider selection
    const { provider, aiConfig } = selectProvider(config);

    // Use similarTo config option - adapters handle the special prompt
    const response = await provider.getRecommendations(
      [], // No watch history needed - we're matching to a specific title
      {
        ...aiConfig,
        count: SIMILAR_COUNT,
        categoryId: 'similar',
        similarTo: {
          imdbId: sourceImdbId,
          title: sourceTitle,
          type: contentType,
        },
      }
    );

    // Cache the results
    cache.setRecommendations(cacheKey, response.recommendations, []);

    console.log(`[Similar] Generated ${response.recommendations.length} similar titles`);

    return recommendationsToMetas(response.recommendations, contentType);
  } catch (error) {
    console.error(`[Similar] Error generating similar content for ${sourceImdbId}:`, error);
    return [];
  }
}

/**
 * Convert recommendations to Stremio meta format
 */
function recommendationsToMetas(
  recommendations: Recommendation[],
  contentType: 'movie' | 'series'
): StremioMeta[] {
  return recommendations.map((rec) => ({
    id: rec.imdbId,
    type: contentType,
    name: rec.title,
    description: rec.reason,
  }));
}
