/**
 * Gemini OAuth Provider Adapter
 *
 * Uses Google OAuth tokens (from user's subscription) instead of API keys.
 * This leverages the user's Gemini Advanced/AI Pro subscription limits.
 */

import type { IAIProvider } from './IAIProvider.js';
import { AIProviderError, AIResponseParseError } from './IAIProvider.js';
import type { AIConfig, AIResponse, Recommendation, WatchHistoryItem } from '../types.js';
import { getCategoryById, type Category } from '../categories.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash'; // Using stable model for OAuth
const DEFAULT_COUNT = 15;

/**
 * Extended config for OAuth-based access
 */
export interface GeminiOAuthConfig extends AIConfig {
  accessToken: string; // OAuth access token instead of apiKey
}

/**
 * Build system prompt (same as API key version)
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

  if (similarTo) {
    return `You are a film recommendation expert using VERBALIZED SAMPLING.

## Your Task: Find Similar Content
Find ${count} ${similarTo.type === 'series' ? 'TV shows' : 'movies'} similar to:
**"${similarTo.title}"** (${similarTo.imdbId})

## Similarity Factors
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

  const categoryFocus = category?.promptFocus ||
    'Analyze the user\'s complete viewing patterns and recommend titles that match their psychological profile.';

  const yearConstraint = category?.yearRange
    ? `\n- Year constraint: ${category.yearRange.min ? `Released ${category.yearRange.min} or later` : ''}${category.yearRange.max ? `Released ${category.yearRange.max} or earlier` : ''}`
    : '';

  const genreConstraint = category?.genres?.length
    ? `\n- Genre focus: Prioritize ${category.genres.join(', ')} content`
    : '';

  return `You are an expert film recommendation engine using VERBALIZED SAMPLING.

## Your Task: ${category?.name || 'Personalized Recommendations'}
${categoryFocus}

## Verbalized Sampling Method
- Include 40% high-probability matches (well-known titles that clearly fit)
- Include 40% medium-probability matches (quality titles that require insight)
- Include 20% low-probability discoveries (unexpected but defensible choices)

## Psychographic Analysis Framework
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
      "reason": "1-2 sentence explanation"
    }
  ],
  "analysis": "2-3 sentence summary of user's profile"
}

## Rules
- Provide exactly ${count} recommendations
- Use valid IMDB IDs (format: tt followed by 7-8 digits)
- Return ONLY valid JSON, no markdown code blocks`;
}

export class GeminiOAuthAdapter implements IAIProvider {
  readonly name = 'Gemini (OAuth)';
  readonly model: string;

  constructor(model?: string) {
    this.model = model ?? DEFAULT_MODEL;
  }

  async getRecommendations(
    watchHistory: WatchHistoryItem[],
    config: AIConfig
  ): Promise<AIResponse> {
    const oauthConfig = config as GeminiOAuthConfig;

    if (!oauthConfig.accessToken) {
      throw new AIProviderError('No OAuth access token provided', this.name);
    }

    const count = config.count ?? DEFAULT_COUNT;
    const excludeIds = config.excludeImdbIds ?? [];
    const category = config.categoryId ? getCategoryById(config.categoryId) : undefined;
    const systemPrompt = buildSystemPrompt(count, excludeIds, category, config.similarTo);

    if (category) {
      console.log(`[Gemini OAuth] Category: ${category.name}`);
    }

    const userPrompt = this.formatWatchHistory(watchHistory, excludeIds);
    const modelId = config.model ?? this.model;

    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${oauthConfig.accessToken}`,
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
        `Failed to get recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error
      );
    }
  }

  async validateConfig(config: AIConfig): Promise<boolean> {
    const oauthConfig = config as GeminiOAuthConfig;

    if (!oauthConfig.accessToken) {
      return false;
    }

    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models`,
        {
          headers: {
            'Authorization': `Bearer ${oauthConfig.accessToken}`,
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private formatWatchHistory(history: WatchHistoryItem[], excludeIds: string[] = []): string {
    const items = history.slice(0, 50);

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

      const watchedDate = new Date(item.watchedAt);
      parts.push(`   Watched: ${watchedDate.toLocaleDateString()}`);

      return parts.join('\n');
    });

    const excludeNote = excludeIds.length > 0
      ? `\n\nNote: Already shown ${excludeIds.length} recommendations. Suggest NEW titles.`
      : '';

    return `## User's Watch History (${items.length} items)

${formattedItems.join('\n\n')}

Based on this, provide psychographic recommendations.${excludeNote}`;
  }

  private parseResponse(text: string, maxCount: number = DEFAULT_COUNT): AIResponse {
    try {
      let jsonText = text.trim();

      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText) as unknown;

      if (!this.isValidAIResponse(parsed)) {
        throw new Error('Response does not match expected structure');
      }

      const recommendations = parsed.recommendations
        .filter((rec): rec is Recommendation => this.isValidRecommendation(rec))
        .slice(0, maxCount);

      return {
        recommendations,
        analysis: typeof parsed.analysis === 'string' ? parsed.analysis : undefined,
      };
    } catch (error) {
      throw new AIResponseParseError(
        `Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        text
      );
    }
  }

  private isValidAIResponse(obj: unknown): obj is { recommendations: unknown[]; analysis?: string } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'recommendations' in obj &&
      Array.isArray((obj as { recommendations: unknown }).recommendations)
    );
  }

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
