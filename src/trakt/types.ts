/**
 * Trakt.tv API Type Definitions
 *
 * Types for Trakt API responses and OAuth flow.
 */

/**
 * Trakt OAuth device code response
 */
export interface TraktDeviceCode {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

/**
 * Trakt OAuth token response
 */
export interface TraktToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

/**
 * Trakt movie IDs
 */
export interface TraktMovieIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
}

/**
 * Trakt show IDs
 */
export interface TraktShowIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

/**
 * Trakt movie object
 */
export interface TraktMovie {
  title: string;
  year: number;
  ids: TraktMovieIds;
  tagline?: string;
  overview?: string;
  released?: string;
  runtime?: number;
  certification?: string;
  genres?: string[];
  rating?: number;
}

/**
 * Trakt show object
 */
export interface TraktShow {
  title: string;
  year: number;
  ids: TraktShowIds;
  overview?: string;
  first_aired?: string;
  runtime?: number;
  certification?: string;
  genres?: string[];
  rating?: number;
  status?: string;
}

/**
 * Trakt watched history item (movie)
 */
export interface TraktWatchedMovie {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  movie: TraktMovie;
}

/**
 * Trakt watched history item (show)
 */
export interface TraktWatchedShow {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  show: TraktShow;
}

/**
 * Trakt rating item (movie)
 */
export interface TraktRatedMovie {
  rated_at: string;
  rating: number;
  movie: TraktMovie;
}

/**
 * Trakt rating item (show)
 */
export interface TraktRatedShow {
  rated_at: string;
  rating: number;
  show: TraktShow;
}

/**
 * Combined watch history with optional ratings
 */
export interface TraktHistoryItem {
  type: 'movie' | 'show';
  title: string;
  year: number;
  imdbId: string | null;
  tmdbId: number | null;
  genres: string[];
  rating?: number; // User's rating
  watchedAt: Date;
  plays: number;
  runtime?: number;
  certification?: string;
}

/**
 * Trakt API error response
 */
export interface TraktError {
  error: string;
  error_description?: string;
}
