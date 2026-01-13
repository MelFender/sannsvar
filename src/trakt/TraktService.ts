/**
 * Trakt.tv Service
 *
 * Fetches user watch history, ratings, and combines them for AI analysis.
 */

import type {
  TraktWatchedMovie,
  TraktWatchedShow,
  TraktRatedMovie,
  TraktRatedShow,
  TraktError,
} from './types.js';
import { refreshToken } from './TraktAuth.js';
import type { WatchHistoryItem } from '../types.js';

const TRAKT_API_URL = 'https://api.trakt.tv';
const TRAKT_API_VERSION = '2';

/**
 * Error thrown when Trakt API calls fail
 */
export class TraktServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'TraktServiceError';
  }
}

interface TraktCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Trakt.tv Service for fetching user data
 */
export class TraktService {
  private credentials: TraktCredentials;

  constructor(credentials: TraktCredentials) {
    this.credentials = credentials;
  }

  /**
   * Get headers for Trakt API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'trakt-api-key': this.credentials.clientId,
      'trakt-api-version': TRAKT_API_VERSION,
      Authorization: `Bearer ${this.credentials.accessToken}`,
    };
  }

  /**
   * Make an authenticated request to Trakt API
   */
  private async request<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${TRAKT_API_URL}${endpoint}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new TraktServiceError('Unauthorized - token may be expired', 401);
      }

      const error = (await response.json().catch(() => ({}))) as TraktError;
      throw new TraktServiceError(
        error.error_description ?? error.error ?? `API error: ${response.status}`,
        response.status
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Refresh the access token if expired
   *
   * @returns The new access token if refreshed, or the current one if still valid
   */
  async ensureValidToken(): Promise<string> {
    // Check if token needs refresh (we don't have the full TraktToken here,
    // so we'll rely on 401 errors to trigger refresh in a real implementation)
    // For now, just return the current token
    return this.credentials.accessToken;
  }

  /**
   * Attempt to refresh token and update credentials
   */
  async refreshAccessToken(): Promise<void> {
    try {
      const newToken = await refreshToken(
        this.credentials.clientId,
        this.credentials.clientSecret,
        this.credentials.refreshToken
      );

      this.credentials.accessToken = newToken.access_token;
      this.credentials.refreshToken = newToken.refresh_token;
    } catch (error) {
      throw new TraktServiceError(
        `Failed to refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Fetch user's watched movies
   */
  async getWatchedMovies(): Promise<TraktWatchedMovie[]> {
    return this.request<TraktWatchedMovie[]>('/users/me/watched/movies?extended=full');
  }

  /**
   * Fetch user's watched shows
   */
  async getWatchedShows(): Promise<TraktWatchedShow[]> {
    return this.request<TraktWatchedShow[]>('/users/me/watched/shows?extended=full');
  }

  /**
   * Fetch user's movie ratings
   */
  async getRatedMovies(): Promise<TraktRatedMovie[]> {
    return this.request<TraktRatedMovie[]>('/users/me/ratings/movies');
  }

  /**
   * Fetch user's show ratings
   */
  async getRatedShows(): Promise<TraktRatedShow[]> {
    return this.request<TraktRatedShow[]>('/users/me/ratings/shows');
  }

  /**
   * Fetch complete watch history with ratings
   *
   * Combines watched items with user ratings for psychographic analysis.
   * Returns items sorted by most recently watched.
   */
  async getWatchHistory(limit = 50): Promise<WatchHistoryItem[]> {
    try {
      // Fetch all data in parallel
      const [watchedMovies, watchedShows, ratedMovies, ratedShows] = await Promise.all([
        this.getWatchedMovies(),
        this.getWatchedShows(),
        this.getRatedMovies(),
        this.getRatedShows(),
      ]);

      // Create rating lookup maps
      const movieRatings = new Map<string, number>();
      const showRatings = new Map<string, number>();

      for (const item of ratedMovies) {
        if (item.movie.ids.imdb) {
          movieRatings.set(item.movie.ids.imdb, item.rating);
        }
      }

      for (const item of ratedShows) {
        if (item.show.ids.imdb) {
          showRatings.set(item.show.ids.imdb, item.rating);
        }
      }

      // Convert to unified format
      const history: WatchHistoryItem[] = [];

      // Add movies
      for (const item of watchedMovies) {
        const imdbId = item.movie.ids.imdb;
        if (!imdbId) continue; // Skip items without IMDB ID

        history.push({
          imdbId,
          title: item.movie.title,
          year: item.movie.year,
          type: 'movie',
          genres: item.movie.genres ?? [],
          rating: movieRatings.get(imdbId),
          watchedAt: new Date(item.last_watched_at),
          runtime: item.movie.runtime,
          certification: item.movie.certification,
        });
      }

      // Add shows
      for (const item of watchedShows) {
        const imdbId = item.show.ids.imdb;
        if (!imdbId) continue; // Skip items without IMDB ID

        history.push({
          imdbId,
          title: item.show.title,
          year: item.show.year,
          type: 'show',
          genres: item.show.genres ?? [],
          rating: showRatings.get(imdbId),
          watchedAt: new Date(item.last_watched_at),
          runtime: item.show.runtime,
          certification: item.show.certification,
        });
      }

      // Sort by watch date (most recent first) and limit
      return history
        .sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime())
        .slice(0, limit);
    } catch (error) {
      // If we get a 401, try to refresh the token and retry once
      if (error instanceof TraktServiceError && error.statusCode === 401) {
        await this.refreshAccessToken();
        return this.getWatchHistory(limit); // Retry with new token
      }
      throw error;
    }
  }

  /**
   * Get user profile info
   */
  async getUserProfile(): Promise<{ username: string; name: string }> {
    const profile = await this.request<{ username: string; name: string }>('/users/me');
    return profile;
  }
}

/**
 * Create a TraktService from user config
 */
export function createTraktService(
  clientId: string,
  clientSecret: string,
  accessToken: string,
  refreshToken: string
): TraktService {
  return new TraktService({
    clientId,
    clientSecret,
    accessToken,
    refreshToken,
  });
}
