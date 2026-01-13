/**
 * OAuth tokens for a provider
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  email?: string;
}

/**
 * User configuration decoded from the addon URL
 */
export interface UserConfig {
  // Legacy API key support (optional)
  geminiApiKey?: string;
  temperature: number;

  // Trakt.tv OAuth (required for watch history)
  traktAccessToken: string;
  traktRefreshToken: string;

  // AI Provider OAuth tokens (subscription-based access)
  googleOAuth?: OAuthTokens;   // Gemini via Google account
  openaiOAuth?: OAuthTokens;   // ChatGPT via OpenAI account
  claudeOAuth?: OAuthTokens;   // Claude via Anthropic account
}

/**
 * AI provider configuration
 */
export interface AIConfig {
  apiKey: string;
  temperature: number;
  model?: string;
  /** IMDB IDs to exclude from recommendations (for pagination) */
  excludeImdbIds?: string[];
  /** Number of recommendations to generate */
  count?: number;
  /** Category ID for focused recommendations */
  categoryId?: string;
  /** For "similar to X" - source title info */
  similarTo?: {
    imdbId: string;
    title: string;
    type: 'movie' | 'series';
  };
}

/**
 * A single item from the user's watch history
 */
export interface WatchHistoryItem {
  imdbId: string;
  title: string;
  year: number;
  type: 'movie' | 'show';
  genres: string[];
  rating?: number; // User's rating (1-10)
  watchedAt: Date;
  runtime?: number; // In minutes
  certification?: string; // e.g., "R", "PG-13"
}

/**
 * AI-generated recommendation
 */
export interface Recommendation {
  imdbId: string;
  title: string;
  reason: string;
}

/**
 * Response from the AI provider
 */
export interface AIResponse {
  recommendations: Recommendation[];
  analysis?: string; // Overall analysis of user's preferences
}

/**
 * Stremio meta link (for trailers, similar content, etc.)
 */
export interface StremioMetaLink {
  name: string;
  category: string;
  url: string;
}

/**
 * Stremio meta object for catalog responses
 */
export interface StremioMeta {
  id: string;
  type: 'movie' | 'series';
  name: string;
  poster?: string;
  background?: string;
  description?: string;
  releaseInfo?: string;
  genres?: string[];
  director?: string[];
  cast?: string[];
  imdbRating?: string;
  runtime?: string;
  /** Links to related content */
  links?: StremioMetaLink[];
}

/**
 * Stremio catalog response
 */
export interface StremioCatalog {
  metas: StremioMeta[];
}

/**
 * Stremio resource definition (string or object with filters)
 */
export type StremioResource = string | {
  name: string;
  types?: string[];
  idPrefixes?: string[];
};

/**
 * Stremio manifest types
 */
export interface StremioManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  catalogs: Array<{
    type: string;
    id: string;
    name: string;
    extra?: Array<{
      name: string;
      isRequired?: boolean;
      options?: string[];
    }>;
  }>;
  resources: StremioResource[];
  types: string[];
  idPrefixes: string[];
  logo?: string;
  background?: string;
  behaviorHints?: {
    configurable?: boolean;
    configurationRequired?: boolean;
  };
}
