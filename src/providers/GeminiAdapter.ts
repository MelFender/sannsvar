/**
 * Gemini AI Provider Adapter
 *
 * Uses Google's Gemini 3 Flash for psychographic analysis and recommendations.
 * Implements Verbalized Sampling for diverse, high-quality recommendations.
 * @see https://www.verbalized-sampling.com/
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IAIProvider } from './IAIProvider.js';
import { AIProviderError, AIResponseParseError } from './IAIProvider.js';
import type { AIConfig, AIResponse, Recommendation, WatchHistoryItem } from '../types.js';
import { getCategoryById, type Category } from '../categories.js';

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_COUNT = 15;

/**
 * Build system prompt using Verbalized Sampling technique
 * This encourages diverse recommendations by explicitly sampling from probability distributions
 */
function buildSystemPrompt(
  count: number,
  excludeIds: string[],
  category?: Category,
  similarTo?: { imdbId: string; title: string; type: 'movie' | 'series' }
): string {
  const excludeSection = excludeIds.length > 0
    ? `\n\n**EXCLUSIONS**: Do NOT recommend these IMDB IDs (already shown): ${excludeIds.slice(0, 50).join(', ')}${excludeIds.length > 50 ? '...' : ''}`
    : '';

  // Special handling for "Similar to X" recommendations
  if (similarTo) {
    return `You are a film recommendation expert using VERBALIZED SAMPLING.

## Your Task: Find Similar Content
Find ${count} ${similarTo.type === 'series' ? 'TV shows' : 'movies'} similar to:
**"${similarTo.title}"** (${similarTo.imdbId})

## Similarity Factors
Consider these when finding similar content:
- Genre and subgenre alignment
- Thematic resonance (similar themes, messages, tone)
- Stylistic similarities (pacing, cinematography, narrative structure)
- Target audience overlap
- Quality and acclaim level

## Verbalized Sampling Distribution
- 50% very similar (obvious connections fans would expect)
- 30% thematically similar (deeper connections requiring insight)
- 20% surprising but defensible (unexpected picks that work)${excludeSection}

## Output Format
Return ONLY valid JSON:
{
  "recommendations": [
    {
      "imdbId": "tt1234567",
      "title": "Movie Title",
      "reason": "Why this is similar to ${similarTo.title}"
    }
  ],
  "analysis": "What makes content similar to ${similarTo.title}"
}

## Rules
- Exactly ${count} recommendations
- Valid IMDB IDs (tt + 7-8 digits)
- Do NOT include "${similarTo.title}" itself (${similarTo.imdbId})
- Mix well-known and lesser-known titles
- Return ONLY JSON`;
  }

  // Standard category-based recommendations
  const categoryFocus = category?.promptFocus ||
    'Analyze the user\'s complete viewing patterns and recommend titles that match their psychological profile.';

  const yearConstraint = category?.yearRange
    ? `\n- Year constraint: ${category.yearRange.min ? `Released ${category.yearRange.min} or later` : ''}${category.yearRange.max ? `Released ${category.yearRange.max} or earlier` : ''}`
    : '';

  const genreConstraint = category?.genres?.length
    ? `\n- Genre focus: Prioritize ${category.genres.join(', ')} content`
    : '';

  return `You are an expert film recommendation engine using VERBALIZED SAMPLING to provide diverse, high-quality recommendations.

## Your Task: ${category?.name || 'Personalized Recommendations'}
${categoryFocus}

## Verbalized Sampling Method
Instead of recommending the most obvious choices, sample from across the probability distribution:
- Include 40% high-probability matches (well-known titles that clearly fit)
- Include 40% medium-probability matches (quality titles that require insight to connect)
- Include 20% low-probability discoveries (unexpected but defensible choices)

This creates a mix of satisfying obvious picks AND delightful surprises.

## Psychographic Analysis Framework
When matching to user taste, consider:
1. **Thematic resonance** - What deeper themes connect their favorites?
2. **Emotional patterns** - What feelings do they seek from content?
3. **Pacing preferences** - Slow burn vs. action-packed?
4. **Visual/atmospheric style** - What worlds do they gravitate toward?
5. **Rating patterns** - What earns high ratings? What disappoints?

## Constraints${yearConstraint}${genreConstraint}${excludeSection}

## Output Format
Return ONLY valid JSON:
{
  "recommendations": [
    {
      "imdbId": "tt1234567",
      "title": "Movie Title",
      "reason": "1-2 sentence explanation connecting to their viewing patterns"
    }
  ],
  "analysis": "2-3 sentence summary of the user's psychographic profile for this category"
}

## Rules
- Provide exactly ${count} recommendations
- Use valid IMDB IDs (format: tt followed by 7-8 digits)
- Each reason must reference specific patterns from their history
- Avoid recommending items already in their watch history
- Mix well-known and lesser-known titles per the sampling distribution
- Return ONLY valid JSON, no markdown code blocks`;
}

// REST API base URL for OAuth-based access
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Extended config type that may include OAuth token
interface ExtendedAIConfig extends AIConfig {
  accessToken?: string;
}

export class GeminiAdapter implements IAIProvider {
  readonly name = 'Gemini';
  readonly model: string;

  constructor(model?: string) {
    this.model = model ?? DEFAULT_MODEL;
  }

  async getRecommendations(watchHistory: WatchHistoryItem[], config: AIConfig): Promise<AIResponse> {
    const extConfig = config as ExtendedAIConfig;

    // Support pagination and category-based recommendations
    const count = config.count ?? DEFAULT_COUNT;
    const excludeIds = config.excludeImdbIds ?? [];
    const category = config.categoryId ? getCategoryById(config.categoryId) : undefined;
    const systemPrompt = buildSystemPrompt(count, excludeIds, category, config.similarTo);

    if (category) {
      console.log(`[Gemini] Category: ${category.name} - ${category.description}`);
    }

    const userPrompt = this.formatWatchHistory(watchHistory, excludeIds);

    // Use OAuth if access token is present, otherwise use API key
    if (extConfig.accessToken) {
      return this.getRecommendationsWithOAuth(systemPrompt, userPrompt, count, extConfig);
    }

    return this.getRecommendationsWithApiKey(systemPrompt, userPrompt, count, config);
  }

  /**
   * Get recommendations using OAuth access token (subscription-based)
   */
  private async getRecommendationsWithOAuth(
    systemPrompt: string,
    userPrompt: string,
    count: number,
    config: ExtendedAIConfig
  ): Promise<AIResponse> {
    const modelId = config.model ?? this.model;
    console.log(`[Gemini OAuth] Using subscription access with model: ${modelId}`);

    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: systemPrompt },
                  { text: userPrompt },
                ],
              },
            ],
            generationConfig: {
              temperature: config.temperature ?? 0.7,
              topP: 0.95,
              topK: 40,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API request failed: ${response.status} - ${error}`);
      }

      const data = await response.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('No content in response');
      }

      return this.parseResponse(text, count);
    } catch (error) {
      throw new AIProviderError(
        `Failed to get recommendations with OAuth: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error
      );
    }
  }

  /**
   * Get recommendations using API key
   */
  private async getRecommendationsWithApiKey(
    systemPrompt: string,
    userPrompt: string,
    count: number,
    config: AIConfig
  ): Promise<AIResponse> {
    console.log(`[Gemini API Key] Using API key access`);

    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.model ?? this.model,
      generationConfig: {
        temperature: config.temperature,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    try {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);

      const response = result.response;
      const text = response.text();

      return this.parseResponse(text, count);
    } catch (error) {
      throw new AIProviderError(
        `Failed to get recommendations from Gemini: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error
      );
    }
  }

  async validateConfig(config: AIConfig): Promise<boolean> {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ model: config.model ?? this.model });

    try {
      // Simple validation request
      const result = await model.generateContent('Respond with just the word "valid"');
      const text = result.response.text().toLowerCase();
      return text.includes('valid');
    } catch (error) {
      throw new AIProviderError(
        `Invalid Gemini configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error
      );
    }
  }

  /**
   * Format watch history into a prompt-friendly string
   */
  private formatWatchHistory(history: WatchHistoryItem[], excludeIds: string[] = []): string {
    const items = history.slice(0, 50); // Limit to last 50 items

    const formattedItems = items.map((item, index) => {
      const parts = [
        `${index + 1}. "${item.title}" (${item.year})`,
        `   Type: ${item.type}`,
        `   Genres: ${item.genres.join(', ') || 'Unknown'}`,
      ];

      if (item.rating !== undefined) {
        parts.push(`   User Rating: ${item.rating}/10`);
      }

      if (item.runtime) {
        parts.push(`   Runtime: ${item.runtime} min`);
      }

      if (item.certification) {
        parts.push(`   Certification: ${item.certification}`);
      }

      const watchedDate = new Date(item.watchedAt);
      parts.push(`   Watched: ${watchedDate.toLocaleDateString()}`);

      return parts.join('\n');
    });

    const excludeNote = excludeIds.length > 0
      ? `\n\nNote: The user has already been shown ${excludeIds.length} recommendations. Suggest NEW titles they haven't seen in this session.`
      : '';

    return `## User's Watch History (${items.length} items)

${formattedItems.join('\n\n')}

Based on this watch history, provide psychographic recommendations that match their viewing patterns.${excludeNote}`;
  }

  /**
   * Parse the AI response into structured recommendations
   */
  private parseResponse(text: string, maxCount: number = DEFAULT_COUNT): AIResponse {
    try {
      // Try to extract JSON from the response
      let jsonText = text.trim();

      // Handle potential markdown code blocks
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText) as unknown;

      if (!this.isValidAIResponse(parsed)) {
        throw new Error('Response does not match expected structure');
      }

      // Validate and clean recommendations (limit to requested count)
      const recommendations = parsed.recommendations
        .filter((rec): rec is Recommendation => this.isValidRecommendation(rec))
        .slice(0, maxCount);

      return {
        recommendations,
        analysis: typeof parsed.analysis === 'string' ? parsed.analysis : undefined,
      };
    } catch (error) {
      throw new AIResponseParseError(
        `Failed to parse Gemini response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        text
      );
    }
  }

  /**
   * Type guard for AI response structure
   */
  private isValidAIResponse(obj: unknown): obj is { recommendations: unknown[]; analysis?: string } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'recommendations' in obj &&
      Array.isArray((obj as { recommendations: unknown }).recommendations)
    );
  }

  /**
   * Type guard for recommendation structure
   */
  private isValidRecommendation(obj: unknown): obj is Recommendation {
    if (typeof obj !== 'object' || obj === null) return false;

    const rec = obj as Record<string, unknown>;
    return (
      typeof rec.imdbId === 'string' &&
      /^tt\d{7,8}$/.test(rec.imdbId) &&
      typeof rec.title === 'string' &&
      typeof rec.reason === 'string'
    );
  }
}
