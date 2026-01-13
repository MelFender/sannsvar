/**
 * YouTube Service
 *
 * Fetches videos from YouTube Data API v3
 * Handles search, related videos, and video details
 */

import type { VideoRecord } from '../db/YouTubeRepository.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  publishedAt: string;
  viewCount?: string;
  description?: string;
}

interface YouTubeSearchResult {
  items?: Array<{
    id: { videoId?: string; kind: string };
    snippet: {
      title: string;
      channelTitle: string;
      description: string;
      publishedAt: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
      };
    };
  }>;
}

interface YouTubeVideoDetails {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
      description: string;
      publishedAt: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
      };
    };
    contentDetails?: {
      duration: string;
    };
    statistics?: {
      viewCount: string;
    };
  }>;
}

/**
 * Parse ISO 8601 duration to human-readable format
 */
function parseDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';

  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const seconds = match[3] ? parseInt(match[3]) : 0;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export class YouTubeService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || YOUTUBE_API_KEY;
  }

  /**
   * Search YouTube for videos
   */
  async search(query: string, maxResults: number = 20): Promise<YouTubeVideo[]> {
    if (!this.apiKey) {
      console.warn('[YouTube] No API key configured, using mock data');
      return this.getMockVideos(query);
    }

    try {
      const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: maxResults.toString(),
        key: this.apiKey,
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json() as YouTubeSearchResult;

      const videoIds = data.items
        ?.filter(item => item.id.videoId)
        .map(item => item.id.videoId!)
        .join(',');

      if (!videoIds) return [];

      // Fetch full details including duration
      return this.getVideoDetails(videoIds);
    } catch (error) {
      console.error('[YouTube] Search error:', error);
      return this.getMockVideos(query);
    }
  }

  /**
   * Get related videos based on a video ID
   */
  async getRelatedVideos(videoId: string, maxResults: number = 20): Promise<YouTubeVideo[]> {
    if (!this.apiKey) {
      return this.getMockVideos('related');
    }

    try {
      const params = new URLSearchParams({
        part: 'snippet',
        relatedToVideoId: videoId,
        type: 'video',
        maxResults: maxResults.toString(),
        key: this.apiKey,
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json() as YouTubeSearchResult;

      const videoIds = data.items
        ?.filter(item => item.id.videoId)
        .map(item => item.id.videoId!)
        .join(',');

      if (!videoIds) return [];

      return this.getVideoDetails(videoIds);
    } catch (error) {
      console.error('[YouTube] Related videos error:', error);
      return [];
    }
  }

  /**
   * Get detailed video information
   */
  async getVideoDetails(videoIds: string): Promise<YouTubeVideo[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: videoIds,
        key: this.apiKey,
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json() as YouTubeVideoDetails;

      return (data.items || []).map(item => ({
        id: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        duration: item.contentDetails?.duration ? parseDuration(item.contentDetails.duration) : undefined,
        publishedAt: item.snippet.publishedAt,
        viewCount: item.statistics?.viewCount,
        description: item.snippet.description,
      }));
    } catch (error) {
      console.error('[YouTube] Video details error:', error);
      return [];
    }
  }

  /**
   * Search based on watch history keywords
   */
  async searchFromHistory(historyTitles: string[], maxResults: number = 30): Promise<YouTubeVideo[]> {
    if (historyTitles.length === 0) {
      return this.search('trending videos', maxResults);
    }

    // Extract keywords from history titles
    const keywords = this.extractKeywords(historyTitles);
    const query = keywords.slice(0, 5).join(' ');

    console.log(`[YouTube] Searching based on history keywords: "${query}"`);

    return this.search(query, maxResults);
  }

  /**
   * Extract meaningful keywords from titles
   */
  private extractKeywords(titles: string[]): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'how', 'what', 'why', 'when', 'where', 'who', 'which', 'this', 'that',
      'official', 'video', 'full', 'hd', '4k', 'new', 'best', 'top',
    ]);

    const wordCount = new Map<string, number>();

    for (const title of titles) {
      const words = title.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      for (const word of words) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    }

    // Sort by frequency
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  /**
   * Convert YouTubeVideo to VideoRecord for database storage
   */
  toVideoRecord(video: YouTubeVideo): VideoRecord {
    return {
      video_id: video.id,
      title: video.title,
      channel_name: video.channelTitle,
      thumbnail: video.thumbnail,
      duration: video.duration,
    };
  }

  /**
   * Mock videos for testing without API key
   */
  private getMockVideos(query: string): YouTubeVideo[] {
    const mockVideos: YouTubeVideo[] = [
      { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', channelTitle: 'Rick Astley', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', duration: '3:33', publishedAt: '2009-10-25' },
      { id: 'jNQXAC9IVRw', title: 'Me at the zoo', channelTitle: 'jawed', thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', duration: '0:19', publishedAt: '2005-04-23' },
      { id: '9bZkp7q19f0', title: 'PSY - GANGNAM STYLE', channelTitle: 'officialpsy', thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg', duration: '4:13', publishedAt: '2012-07-15' },
      { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', channelTitle: 'Luis Fonsi', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg', duration: '4:42', publishedAt: '2017-01-12' },
      { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You', channelTitle: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg', duration: '4:24', publishedAt: '2017-01-30' },
    ];

    console.log(`[YouTube] Returning mock videos for query: "${query}"`);
    return mockVideos;
  }
}

export const youtubeService = new YouTubeService();
