/**
 * AI-Powered Video Recommendations
 *
 * Analyzes a channel's watch history and generates personalized recommendations.
 * Each channel gets its own unique recommendations based on its history only.
 */

import type { WatchHistoryRecord, RecommendationRecord } from '../db/YouTubeRepository.js';
import { YouTubeService } from './YouTubeService.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// Use Gemini 3 as per global rules
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

interface AIRecommendation {
  searchQuery: string;
  reason: string;
  score: number;
}

export class AIRecommender {
  private youtube: YouTubeService;

  constructor() {
    this.youtube = new YouTubeService();
  }

  /**
   * Generate recommendations for a channel based on its watch history
   */
  async generateRecommendations(
    channelId: string,
    history: WatchHistoryRecord[],
    count: number = 30
  ): Promise<RecommendationRecord[]> {
    if (history.length === 0) {
      console.log(`[AI:${channelId}] No history, returning trending content`);
      return this.getTrendingAsRecommendations();
    }

    console.log(`[AI:${channelId}] Analyzing ${history.length} history items...`);

    // Get AI-suggested search queries based on history
    const suggestions = await this.getAISuggestions(history);

    // Search YouTube for each suggestion
    const allVideos: RecommendationRecord[] = [];
    const seenIds = new Set(history.map(h => h.video_id));

    for (const suggestion of suggestions) {
      const videos = await this.youtube.search(suggestion.searchQuery, 10);

      for (const video of videos) {
        if (seenIds.has(video.id)) continue;
        seenIds.add(video.id);

        allVideos.push({
          video_id: video.id,
          title: video.title,
          channel_name: video.channelTitle,
          thumbnail: video.thumbnail,
          duration: video.duration,
          reason: suggestion.reason,
          score: suggestion.score,
        });
      }

      if (allVideos.length >= count) break;
    }

    console.log(`[AI:${channelId}] Generated ${allVideos.length} recommendations`);

    return allVideos.slice(0, count);
  }

  /**
   * Use Gemini to analyze history and suggest search queries
   */
  private async getAISuggestions(history: WatchHistoryRecord[]): Promise<AIRecommendation[]> {
    if (!GEMINI_API_KEY) {
      console.warn('[AI] No Gemini API key, using keyword extraction fallback');
      return this.getFallbackSuggestions(history);
    }

    const historyText = history.slice(0, 30).map((h, i) =>
      `${i + 1}. "${h.title}" by ${h.channel_name || 'Unknown'}`
    ).join('\n');

    const prompt = `Analyze this YouTube watch history and suggest 5 search queries to find similar content the user would enjoy.

## Watch History
${historyText}

## Task
Based on this viewing pattern, suggest 5 YouTube search queries that would find content this person would love. Consider:
- Topics and themes they're interested in
- Content style preferences (tutorials, entertainment, reviews, etc.)
- Channels or creators in similar niches

## Output Format
Return ONLY valid JSON:
{
  "analysis": "Brief analysis of viewing patterns",
  "suggestions": [
    {
      "searchQuery": "specific youtube search query",
      "reason": "Why this matches their interests",
      "score": 0.95
    }
  ]
}

Rules:
- Exactly 5 suggestions
- Search queries should be specific and YouTube-friendly
- Score from 0.0 to 1.0 indicating confidence
- Return ONLY JSON, no markdown`;

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[AI] Gemini error:', error);
        return this.getFallbackSuggestions(history);
      }

      const data = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return this.getFallbackSuggestions(history);
      }

      const result = JSON.parse(text) as {
        analysis: string;
        suggestions: AIRecommendation[];
      };

      console.log(`[AI] Analysis: ${result.analysis}`);

      return result.suggestions;
    } catch (error) {
      console.error('[AI] Error:', error);
      return this.getFallbackSuggestions(history);
    }
  }

  /**
   * Fallback: Extract keywords from history titles
   */
  private getFallbackSuggestions(history: WatchHistoryRecord[]): AIRecommendation[] {
    const channelCounts = new Map<string, number>();
    const wordCounts = new Map<string, number>();

    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'official', 'video', 'full',
    ]);

    for (const item of history) {
      // Count channels
      if (item.channel_name) {
        channelCounts.set(item.channel_name, (channelCounts.get(item.channel_name) || 0) + 1);
      }

      // Count words
      const words = item.title.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Top channels
    const topChannels = Array.from(channelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    // Top keywords
    const topWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    const suggestions: AIRecommendation[] = [];

    // Add channel-based searches
    for (const [channel, count] of topChannels) {
      suggestions.push({
        searchQuery: channel,
        reason: `You've watched ${count} videos from this channel`,
        score: 0.9,
      });
    }

    // Add keyword-based searches
    if (topWords.length >= 2) {
      suggestions.push({
        searchQuery: topWords.slice(0, 3).join(' '),
        reason: 'Based on common themes in your history',
        score: 0.8,
      });
    }

    // Add generic related search
    suggestions.push({
      searchQuery: `${topWords[0] || 'trending'} videos 2024`,
      reason: 'Fresh content in your interest areas',
      score: 0.7,
    });

    return suggestions;
  }

  /**
   * Get trending videos as recommendations for empty history
   */
  private async getTrendingAsRecommendations(): Promise<RecommendationRecord[]> {
    const trendingQueries = [
      'trending videos today',
      'most popular videos this week',
      'viral videos 2024',
    ];

    const videos: RecommendationRecord[] = [];
    const seenIds = new Set<string>();

    for (const query of trendingQueries) {
      const results = await this.youtube.search(query, 10);

      for (const video of results) {
        if (seenIds.has(video.id)) continue;
        seenIds.add(video.id);

        videos.push({
          video_id: video.id,
          title: video.title,
          channel_name: video.channelTitle,
          thumbnail: video.thumbnail,
          duration: video.duration,
          reason: 'Trending content to get you started',
          score: 0.5,
        });
      }
    }

    return videos;
  }
}

export const aiRecommender = new AIRecommender();
