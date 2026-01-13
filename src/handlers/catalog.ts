/**
 * Catalog Handler
 *
 * Handles Stremio catalog requests for AI recommendations.
 * Orchestrates Trakt, AI, and caching to generate personalized recommendations.
 * Supports infinite scroll with background pre-fetching.
 */

import { createTraktService, TraktServiceError } from '../trakt/index.js';
import { createProvider, AIProviderError, type IAIProvider } from '../providers/index.js';
import type { ProviderType } from '../providers/providerFactory.js';
import { CacheRepository } from '../db/index.js';
import { extractUserId } from '../utils/configParser.js';
import { PAGE_SIZE } from '../manifest.js';
import type { UserConfig, StremioMeta, Recommendation, WatchHistoryItem, AIConfig } from '../types.js';

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
 * This distributes load and allows parallel fetching across providers
 */
function selectProvider(config: UserConfig): { provider: IAIProvider; aiConfig: AIConfig & { accessToken?: string } } {
  const providers = getAvailableProviders(config);

  // If we have OAuth providers, use round-robin
  if (providers.length > 0) {
    const selectedIndex = providerCounter % providers.length;
    providerCounter++;

    const selected = providers[selectedIndex];
    console.log(`[MultiProvider] Selected: ${selected.type} (${selectedIndex + 1}/${providers.length})`);

    return {
      provider: createProvider(selected.type),
      aiConfig: {
        apiKey: '', // Not used for OAuth
        accessToken: selected.accessToken,
        temperature: config.temperature,
      },
    };
  }

  // Fall back to API key with Gemini
  if (!config.geminiApiKey) {
    throw new Error('No AI credentials configured. Please connect an AI provider or add an API key.');
  }

  return {
    provider: createProvider('gemini'),
    aiConfig: {
      apiKey: config.geminiApiKey,
      temperature: config.temperature,
    },
  };
}

// Environment variables for Trakt app credentials
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID ?? '';
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET ?? '';

// Loading strategy: 15 → 45 (background) → 100 (as needed)
// First batch: fastest possible initial load (matches Stremio viewport)
const FIRST_BATCH_SIZE = 15;

// Second batch: immediately fetched in background while user browses first 15
const SECOND_BATCH_SIZE = 45;

// Subsequent batches: maximum efficient size (100 is Gemini's reliable limit)
const BATCH_SIZE = 100;

// Pre-fetch when this many items remain in cache
const PREFETCH_THRESHOLD = 30;

/**
 * Error thrown when catalog generation fails
 */
export class CatalogError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

// Track in-flight generation to avoid duplicate requests
const generationInProgress = new Map<string, Promise<Recommendation[]>>();

/**
 * Get AI-powered recommendations for the catalog with pagination
 *
 * @param config - User configuration
 * @param contentType - 'movie' or 'series'
 * @param categoryId - Category for focused recommendations
 * @param skip - Number of items to skip (for pagination)
 */
export async function getCatalog(
  config: UserConfig,
  contentType: 'movie' | 'series',
  categoryId: string,
  skip: number = 0
): Promise<StremioMeta[]> {
  // Validate Trakt credentials are configured
  if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
    console.error('Trakt credentials not configured');
    return createFallbackCatalog('Trakt credentials not configured');
  }

  const userId = extractUserId(config);
  const cache = new CacheRepository();
  const page = Math.floor(skip / PAGE_SIZE);
  // Cache key includes category so each category has separate recommendations
  const cacheKey = `${userId}:${categoryId}`;

  try {
    // Step 1: Get watch history (from cache or Trakt)
    const history = await getWatchHistory(userId, config, cache);

    if (history.length === 0) {
      return createFallbackCatalog('No watch history found. Watch some content on Trakt first!');
    }

    // Step 2: Get all cached recommendations for this category
    let allRecommendations = cache.getRecommendations(cacheKey, history) ?? [];

    // Calculate what we need for this page
    const startIndex = skip;
    const endIndex = skip + PAGE_SIZE;

    // Generate more if we don't have enough for this page
    if (endIndex > allRecommendations.length) {
      console.log(`[${userId.slice(0, 8)}:${categoryId}] Need more recommendations (have ${allRecommendations.length}, need ${endIndex})`);

      const newRecs = await generateBatch(
        userId,
        config,
        history,
        allRecommendations,
        cache,
        categoryId
      );

      allRecommendations = [...allRecommendations, ...newRecs];
      // Update cache with new recommendations
      cache.setRecommendations(cacheKey, allRecommendations, history);
    }

    // Step 3: Pre-fetch next batch if approaching the end
    const remainingAfterThisPage = allRecommendations.length - endIndex;
    if (remainingAfterThisPage < PREFETCH_THRESHOLD) {
      // Trigger background generation for next batch
      triggerPrefetch(userId, config, history, allRecommendations, cache, categoryId);
    }

    // Step 4: Return paginated results
    const pageRecommendations = allRecommendations.slice(startIndex, endIndex);

    console.log(`[${userId.slice(0, 8)}:${categoryId}] Returning page ${page} (items ${startIndex}-${endIndex - 1} of ${allRecommendations.length} total)`);

    return recommendationsToMetas(pageRecommendations, contentType);
  } catch (error) {
    console.error(`[${userId.slice(0, 8)}:${categoryId}] Catalog error:`, error);

    if (error instanceof TraktServiceError) {
      return createFallbackCatalog(`Trakt error: ${error.message}`);
    }

    if (error instanceof AIProviderError) {
      return createFallbackCatalog(`AI error: ${error.message}`);
    }

    return createFallbackCatalog('Failed to generate recommendations');
  }
}

/**
 * Get watch history from cache or Trakt
 */
async function getWatchHistory(
  userId: string,
  config: UserConfig,
  cache: CacheRepository
): Promise<WatchHistoryItem[]> {
  let history = cache.getHistory(userId);

  if (!history) {
    console.log(`[${userId.slice(0, 8)}] Fetching watch history from Trakt...`);

    const traktService = createTraktService(
      TRAKT_CLIENT_ID,
      TRAKT_CLIENT_SECRET,
      config.traktAccessToken,
      config.traktRefreshToken
    );

    history = await traktService.getWatchHistory(50);
    const profile = await traktService.getUserProfile().catch(() => null);
    cache.setHistory(userId, history, profile?.username);

    console.log(`[${userId.slice(0, 8)}] Cached ${history.length} history items`);
  } else {
    console.log(`[${userId.slice(0, 8)}] Using cached history (${history.length} items)`);
  }

  return history;
}

/**
 * Determine batch size based on loading stage
 * Strategy: 15 (first) → 45 (second, background) → 100 (subsequent)
 */
function getBatchSize(existingCount: number): { size: number; label: string } {
  if (existingCount === 0) {
    return { size: FIRST_BATCH_SIZE, label: 'initial (15)' };
  } else if (existingCount <= FIRST_BATCH_SIZE) {
    return { size: SECOND_BATCH_SIZE, label: 'second (45)' };
  } else {
    return { size: BATCH_SIZE, label: 'standard (100)' };
  }
}

/**
 * Generate a new batch of recommendations
 * Loading strategy: 15 → 45 (background) → 100 (as needed)
 */
async function generateBatch(
  userId: string,
  config: UserConfig,
  history: WatchHistoryItem[],
  existingRecs: Recommendation[],
  cache: CacheRepository,
  categoryId: string
): Promise<Recommendation[]> {
  const cacheKey = `${userId}:${categoryId}:generate`;

  // Check if generation is already in progress
  const existing = generationInProgress.get(cacheKey);
  if (existing) {
    console.log(`[${userId.slice(0, 8)}] Waiting for in-flight generation...`);
    return existing;
  }

  const { size: batchSize, label } = getBatchSize(existingRecs.length);
  const isFirstBatch = existingRecs.length === 0;

  const generatePromise = (async () => {
    console.log(`[${userId.slice(0, 8)}] Generating ${label} batch...`);

    // Use multi-provider selection (round-robin across connected providers)
    const { provider, aiConfig } = selectProvider(config);

    // Pass existing recommendations to avoid duplicates
    const excludeIds = existingRecs.map((r) => r.imdbId);

    const response = await provider.getRecommendations(history, {
      ...aiConfig,
      excludeImdbIds: excludeIds,
      count: batchSize,
      categoryId,
    });

    // Filter out any duplicates that might have slipped through
    const newRecs = response.recommendations.filter(
      (r) => !excludeIds.includes(r.imdbId)
    );

    // Update cache with all recommendations
    const allRecs = [...existingRecs, ...newRecs];
    cache.setRecommendations(userId, allRecs, history);

    console.log(`[${userId.slice(0, 8)}] Generated ${newRecs.length} recommendations (${allRecs.length} total cached)`);

    if (response.analysis) {
      console.log(`[${userId.slice(0, 8)}] Analysis: ${response.analysis}`);
    }

    // After first batch (15), immediately trigger background fetch of second batch (45)
    if (isFirstBatch && newRecs.length >= FIRST_BATCH_SIZE * 0.8) {
      console.log(`[${userId.slice(0, 8)}] Triggering background fetch of ${SECOND_BATCH_SIZE} more...`);
      // Don't await - fire and forget
      generateBatch(userId, config, history, allRecs, cache, categoryId).catch((err) => {
        console.error(`[${userId.slice(0, 8)}] Background fetch failed:`, err);
      });
    }

    return newRecs;
  })();

  generationInProgress.set(cacheKey, generatePromise);

  try {
    return await generatePromise;
  } finally {
    generationInProgress.delete(cacheKey);
  }
}

/**
 * Trigger background pre-fetch of next batch
 */
function triggerPrefetch(
  userId: string,
  config: UserConfig,
  history: WatchHistoryItem[],
  existingRecs: Recommendation[],
  cache: CacheRepository,
  categoryId: string
): void {
  const cacheKey = `${userId}:${categoryId}:generate`;

  // Don't prefetch if already generating
  if (generationInProgress.has(cacheKey)) {
    return;
  }

  console.log(`[${userId.slice(0, 8)}:${categoryId}] Pre-fetching next batch in background...`);

  // Fire and forget - don't await
  generateBatch(userId, config, history, existingRecs, cache, categoryId).catch((error) => {
    console.error(`[${userId.slice(0, 8)}:${categoryId}] Background prefetch failed:`, error);
  });
}

/**
 * Convert AI recommendations to Stremio meta format
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
    // Note: Poster, background, etc. would come from TMDB/OMDB API
    // For now, Stremio will fetch these from its own metadata sources
  }));
}

/**
 * Create a fallback catalog with an error message
 */
function createFallbackCatalog(message: string): StremioMeta[] {
  return [
    {
      id: 'error',
      type: 'movie',
      name: 'Configuration Required',
      description: message,
    },
  ];
}
