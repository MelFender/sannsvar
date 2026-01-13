/**
 * OpenRouter AI Provider Adapter
 *
 * Uses OpenRouter to access many AI models through a unified API.
 * Supports Claude, GPT-4, Llama, DeepSeek R1, and many more.
 *
 * @see https://openrouter.ai/docs
 */

import type { IAIProvider } from './IAIProvider.js';
import { AIProviderError } from './IAIProvider.js';
import type { AIConfig, AIResponse, WatchHistoryItem } from '../types.js';
import { parseImdbList } from '../utils/imdbParser.js';
import { fetchWithTimeout } from '../utils/http.js';

// Default to DeepSeek R1 for best reasoning at low cost
const DEFAULT_MODEL = 'deepseek/deepseek-r1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 90000; // Reasoning models can be slow

export class OpenRouterAdapter implements IAIProvider {
  readonly name = 'OpenRouter';
  readonly model: string;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
  }

  async validateConfig(config: AIConfig): Promise<boolean> {
    if (!config.apiKey || !config.apiKey.startsWith('sk-or-')) {
      throw new AIProviderError('Invalid OpenRouter API key (should start with sk-or-)', this.name);
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
        OPENROUTER_BASE_URL,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/stremio/stremio-addon-sdk',
            'X-Title': 'UltraThink Stremio Addon',
          },
          body: JSON.stringify({
            model: config.model || this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: config.temperature || 0.7,
            max_tokens: 4000,
          }),
        },
        TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIProviderError(`OpenRouter API error: ${response.status} - ${errorText}`, this.name);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content || '';
      return this.parseResponse(content);
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError(
        `OpenRouter request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
Return ONLY valid JSON (no markdown, no explanation):
{
  "recommendations": [
    {
      "imdbId": "tt1234567",
      "title": "Movie Title",
      "reason": "Brief explanation"
    }
  ],
  "analysis": "Summary of their taste"
}

## Rules
- Exactly ${count} recommendations
- Valid IMDB IDs (tt + 7-9 digits)
- Mix mainstream and hidden gems
- Return ONLY JSON${excludeSection}`;
  }

  private buildUserPrompt(watchHistory: WatchHistoryItem[]): string {
    if (watchHistory.length === 0) {
      return 'No watch history. Recommend popular, critically acclaimed titles.';
    }

    const historyList = watchHistory
      .slice(0, 25)
      .map((item) => {
        const rating = item.rating ? ` (${item.rating}/10)` : '';
        return `- ${item.title} (${item.year}) [${item.genres.join(', ')}]${rating}`;
      })
      .join('\n');

    return `## Watch History\n${historyList}`;
  }

  private parseResponse(content: string): AIResponse {
    try {
      // Clean various artifacts that models might add
      let cleanContent = content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')  // DeepSeek R1 thinking
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '')
        .trim();

      // Find the JSON object
      const jsonStart = cleanContent.indexOf('{');
      const jsonEnd = cleanContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        cleanContent = cleanContent.slice(jsonStart, jsonEnd + 1);
      }

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
