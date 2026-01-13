/**
 * YouTube OAuth Service
 *
 * Fetches user's YouTube data using OAuth access token:
 * - Subscriptions
 * - Liked videos
 * - Watch history
 * - Playlists
 */

import type { YouTubeVideo } from './YouTubeService.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount?: string;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  thumbnail: string;
  itemCount: number;
}

export class YouTubeOAuthService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Get user's subscribed channels
   */
  async getSubscriptions(maxResults: number = 50): Promise<YouTubeChannel[]> {
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        mine: 'true',
        maxResults: maxResults.toString(),
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/subscriptions?${params}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch subscriptions: ${error}`);
      }

      const data = await response.json() as {
        items?: Array<{
          snippet: {
            resourceId: { channelId: string };
            title: string;
            thumbnails: { high?: { url: string }; medium?: { url: string } };
          };
        }>;
      };

      return (data.items || []).map(item => ({
        id: item.snippet.resourceId.channelId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
      }));
    } catch (error) {
      console.error('[YouTubeOAuth] Subscriptions error:', error);
      return [];
    }
  }

  /**
   * Get videos from a subscribed channel
   */
  async getChannelVideos(channelId: string, maxResults: number = 20): Promise<YouTubeVideo[]> {
    try {
      // First get the uploads playlist ID
      const channelParams = new URLSearchParams({
        part: 'contentDetails',
        id: channelId,
      });

      const channelResponse = await fetch(`${YOUTUBE_API_BASE}/channels?${channelParams}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!channelResponse.ok) {
        return [];
      }

      const channelData = await channelResponse.json() as {
        items?: Array<{
          contentDetails: {
            relatedPlaylists: { uploads: string };
          };
        }>;
      };

      const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) return [];

      // Get videos from uploads playlist
      return this.getPlaylistVideos(uploadsPlaylistId, maxResults);
    } catch (error) {
      console.error('[YouTubeOAuth] Channel videos error:', error);
      return [];
    }
  }

  /**
   * Get user's liked videos
   */
  async getLikedVideos(maxResults: number = 50): Promise<YouTubeVideo[]> {
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        myRating: 'like',
        maxResults: maxResults.toString(),
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch liked videos: ${error}`);
      }

      const data = await response.json() as {
        items?: Array<{
          id: string;
          snippet: {
            title: string;
            channelTitle: string;
            thumbnails: { high?: { url: string }; medium?: { url: string } };
            publishedAt: string;
          };
          contentDetails?: {
            duration: string;
          };
        }>;
      };

      return (data.items || []).map(item => ({
        id: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        publishedAt: item.snippet.publishedAt,
        duration: item.contentDetails?.duration ? this.parseDuration(item.contentDetails.duration) : undefined,
      }));
    } catch (error) {
      console.error('[YouTubeOAuth] Liked videos error:', error);
      return [];
    }
  }

  /**
   * Get user's playlists
   */
  async getPlaylists(maxResults: number = 25): Promise<YouTubePlaylist[]> {
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        mine: 'true',
        maxResults: maxResults.toString(),
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/playlists?${params}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as {
        items?: Array<{
          id: string;
          snippet: {
            title: string;
            thumbnails: { high?: { url: string }; medium?: { url: string } };
          };
          contentDetails: {
            itemCount: number;
          };
        }>;
      };

      return (data.items || []).map(item => ({
        id: item.id,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        itemCount: item.contentDetails.itemCount,
      }));
    } catch (error) {
      console.error('[YouTubeOAuth] Playlists error:', error);
      return [];
    }
  }

  /**
   * Get videos from a playlist
   */
  async getPlaylistVideos(playlistId: string, maxResults: number = 50): Promise<YouTubeVideo[]> {
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: maxResults.toString(),
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as {
        items?: Array<{
          snippet: {
            resourceId: { videoId: string };
            title: string;
            channelTitle: string;
            thumbnails: { high?: { url: string }; medium?: { url: string } };
            publishedAt: string;
          };
        }>;
      };

      return (data.items || []).map(item => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        publishedAt: item.snippet.publishedAt,
      }));
    } catch (error) {
      console.error('[YouTubeOAuth] Playlist videos error:', error);
      return [];
    }
  }

  /**
   * Get latest videos from all subscriptions (subscription feed)
   */
  async getSubscriptionFeed(maxResults: number = 50): Promise<YouTubeVideo[]> {
    try {
      // Get subscriptions
      const subscriptions = await this.getSubscriptions(20);

      if (subscriptions.length === 0) {
        return [];
      }

      // Get recent videos from each subscription (in parallel)
      const videosPerChannel = Math.ceil(maxResults / Math.min(subscriptions.length, 10));
      const videoPromises = subscriptions.slice(0, 10).map(sub =>
        this.getChannelVideos(sub.id, videosPerChannel)
      );

      const results = await Promise.all(videoPromises);
      const allVideos = results.flat();

      // Sort by publish date (newest first)
      allVideos.sort((a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      return allVideos.slice(0, maxResults);
    } catch (error) {
      console.error('[YouTubeOAuth] Subscription feed error:', error);
      return [];
    }
  }

  /**
   * Search within user's subscribed channels
   */
  async searchSubscriptions(query: string, maxResults: number = 20): Promise<YouTubeVideo[]> {
    try {
      const subscriptions = await this.getSubscriptions(50);

      if (subscriptions.length === 0) {
        return [];
      }

      // Search across subscribed channels
      const channelIds = subscriptions.map(s => s.id).join(',');

      const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        channelId: channelIds.split(',')[0], // API only supports one channel at a time
        maxResults: maxResults.toString(),
      });

      const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as {
        items?: Array<{
          id: { videoId: string };
          snippet: {
            title: string;
            channelTitle: string;
            thumbnails: { high?: { url: string }; medium?: { url: string } };
            publishedAt: string;
          };
        }>;
      };

      return (data.items || []).map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        publishedAt: item.snippet.publishedAt,
      }));
    } catch (error) {
      console.error('[YouTubeOAuth] Search subscriptions error:', error);
      return [];
    }
  }

  /**
   * Parse ISO 8601 duration to human-readable format
   */
  private parseDuration(isoDuration: string): string {
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
}
