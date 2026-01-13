/**
 * Groq AI Provider Adapter
 *
 * Uses Groq's ultra-fast inference for recommendations.
 * Compatible with OpenAI SDK via custom base URL.
 *
 * @see https://console.groq.com/docs/quickstart
 */

import type { IAIProvider } from './IAIProvider.js';
import { AIProviderError } from './IAIProvider.js';
import type { AIConfig, AIResponse, WatchHistoryItem } from '../types.js';
import { parseImdbList } from '../utils/imdbParser.js';
import { fetchWithTimeout } from '../utils/http.js';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 30000;

export class GroqAdapter implements IAIProvider {
  readonly name = 'Groq';
  readonly model: string;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
  }

  async validateConfig(config: AIConfig): Promise<boolean> {
    if (!config.apiKey || config.apiKey.trim().length < 10) {
      throw new AIProviderError('Invalid Groq API key', this.name);
    }
    return true;
  }

  async getRecommendations(
    watchHistory: WatchHistoryItem[],
    config: AIConfig
  ): Promise<AIResponse> {
    const count = config.count || 15;
    const excludeIds = config.excludeImdbIds || [];

    const systemPrompt = this.buildSystemPrompt(count, excludeIds);
    const userPrompt = this.buildUserPrompt(watchHistory);

    try {
      const response = await fetchWithTimeout(
        GROQ_BASE_URL,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model || this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: config.temperature || 0.7,
            max_tokens: 2000,
          }),
        },
        TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIProviderError(`Groq API error: ${response.status} - ${errorText}`, this.name);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content || '';
      return this.parseResponse(content);
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError(
        `Groq request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error
      );
    }
  }

  private buildSystemPrompt(count: number, excludeIds: string[]): string {
    const excludeSection = excludeIds.length > 0
      ? `\n\nEXCLUSIONS: Do NOT recommend these IMDB IDs: ${excludeIds.slice(0, 30).join(', ')}`
      : '';

    return `You are an expert film recommendation engine.

## Task
Analyze the user's watch history and recommend ${count} movies or series they would enjoy.

## Output Format
Return ONLY valid JSON:
{
  "recommendations": [
    {
      "imdbId": "tt1234567",
      "title": "Movie Title",
      "reason": "Brief explanation why they'd like this"
    }
  ],
  "analysis": "Summary of their taste preferences"
}

## Rules
- Exactly ${count} recommendations
- Valid IMDB IDs (tt + 7-9 digits)
- Mix popular and hidden gems
- Consider genres, themes, and mood from their history
- Return ONLY JSON, no other text${excludeSection}`;
  }

  private buildUserPrompt(watchHistory: WatchHistoryItem[]): string {
    if (watchHistory.length === 0) {
      return 'No watch history available. Recommend popular, critically acclaimed titles across genres.';
    }

    const historyList = watchHistory
      .slice(0, 30)
      .map((item) => {
        const rating = item.rating ? ` (rated ${item.rating}/10)` : '';
        return `- ${item.title} (${item.year}) - ${item.genres.join(', ')}${rating}`;
      })
      .join('\n');

    return `## Watch History (most recent first)\n${historyList}`;
  }

  private parseResponse(content: string): AIResponse {
    try {
      // Clean markdown code blocks if present
      const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanContent) as {
        recommendations?: Array<{ imdbId?: string; title?: string; reason?: string }>;
        analysis?: string;
      };

      const recommendations = (data.recommendations || [])
        .filter((r) => r.imdbId && r.title)
        .map((r) => ({
          imdbId: r.imdbId!,
          title: r.title!,
          reason: r.reason || 'Recommended based on your watch history',
        }));

      return {
        recommendations,
        analysis: data.analysis,
      };
    } catch {
      // Fallback: try to extract IMDB IDs directly
      const imdbIds = parseImdbList(content);
      return {
        recommendations: imdbIds.map((id) => ({
          imdbId: id,
          title: 'Unknown',
          reason: 'Extracted from AI response',
        })),
      };
    }
  }
}
