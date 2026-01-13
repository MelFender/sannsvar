/**
 * DeepSeek AI Provider Adapter
 *
 * Uses DeepSeek's reasoning models for recommendations.
 * Compatible with OpenAI SDK via custom base URL.
 *
 * @see https://platform.deepseek.com/docs
 */

import type { IAIProvider } from './IAIProvider.js';
import { AIProviderError } from './IAIProvider.js';
import type { AIConfig, AIResponse, WatchHistoryItem } from '../types.js';
import { parseImdbList } from '../utils/imdbParser.js';
import { fetchWithTimeout } from '../utils/http.js';

const DEFAULT_MODEL = 'deepseek-chat';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 60000; // DeepSeek can be slower due to reasoning

export class DeepSeekAdapter implements IAIProvider {
  readonly name = 'DeepSeek';
  readonly model: string;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
  }

  async validateConfig(config: AIConfig): Promise<boolean> {
    if (!config.apiKey || config.apiKey.trim().length < 10) {
      throw new AIProviderError('Invalid DeepSeek API key', this.name);
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
        DEEPSEEK_BASE_URL,
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
            max_tokens: 4000,
          }),
        },
        TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIProviderError(`DeepSeek API error: ${response.status} - ${errorText}`, this.name);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content || '';
      return this.parseResponse(content);
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError(
        `DeepSeek request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error
      );
    }
  }

  private buildSystemPrompt(count: number, excludeIds: string[]): string {
    const excludeSection = excludeIds.length > 0
      ? `\n\nEXCLUSIONS: Do NOT recommend these IMDB IDs: ${excludeIds.slice(0, 30).join(', ')}`
      : '';

    return `You are an expert film recommendation engine with deep reasoning capabilities.

## Task
Analyze the user's watch history patterns and recommend ${count} movies or series they would enjoy.

## Output Format
Return ONLY valid JSON:
{
  "recommendations": [
    {
      "imdbId": "tt1234567",
      "title": "Movie Title",
      "reason": "Why they would enjoy this based on their patterns"
    }
  ],
  "analysis": "Deep analysis of their viewing preferences and psychological profile"
}

## Rules
- Exactly ${count} recommendations
- Valid IMDB IDs (tt + 7-9 digits)
- Look for deeper patterns: themes, character arcs, emotional beats, visual style
- Mix obvious matches with surprising discoveries
- Return ONLY JSON, no other text${excludeSection}`;
  }

  private buildUserPrompt(watchHistory: WatchHistoryItem[]): string {
    if (watchHistory.length === 0) {
      return 'No watch history available. Recommend critically acclaimed titles that appeal to diverse tastes.';
    }

    const historyList = watchHistory
      .slice(0, 30)
      .map((item) => {
        const rating = item.rating ? ` (rated ${item.rating}/10)` : '';
        const cert = item.certification ? ` [${item.certification}]` : '';
        return `- ${item.title} (${item.year}) - ${item.genres.join(', ')}${rating}${cert}`;
      })
      .join('\n');

    return `## Watch History (analyze for patterns)\n${historyList}`;
  }

  private parseResponse(content: string): AIResponse {
    try {
      // Clean markdown and thinking tags that DeepSeek might add
      let cleanContent = content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
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
