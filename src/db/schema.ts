/**
 * SQLite Database Schema
 *
 * Defines the schema for caching Trakt data and recommendations.
 * This reduces API calls and improves response times.
 */

/**
 * SQL statements to create the database tables
 */
export const SCHEMA = `
-- Cache for user watch history from Trakt
-- Stores JSON-stringified history to avoid re-fetching from Trakt
CREATE TABLE IF NOT EXISTS history_cache (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,           -- JSON array of WatchHistoryItem
  trakt_username TEXT,          -- Trakt username for reference
  item_count INTEGER DEFAULT 0, -- Number of items cached
  created_at INTEGER NOT NULL,  -- Unix timestamp
  updated_at INTEGER NOT NULL   -- Unix timestamp
);

-- Cache for AI-generated recommendations
-- Prevents redundant AI calls for the same history
CREATE TABLE IF NOT EXISTS recommendation_cache (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,           -- JSON array of Recommendation
  history_hash TEXT NOT NULL,   -- Hash of watch history used to generate
  created_at INTEGER NOT NULL,  -- Unix timestamp
  updated_at INTEGER NOT NULL   -- Unix timestamp
);

-- Cache for TasteDive similar title results
-- Reduces API calls for the same query
CREATE TABLE IF NOT EXISTS tastedive_cache (
  query TEXT PRIMARY KEY,       -- The search query (type:titles)
  payload TEXT NOT NULL,        -- JSON array of similar titles
  expires_at INTEGER NOT NULL   -- Unix timestamp for cache expiry
);

-- Cache for Watchmode streaming sources
-- Stores streaming availability by region
CREATE TABLE IF NOT EXISTS watchmode_sources (
  imdb_id TEXT NOT NULL,
  region TEXT NOT NULL,
  payload TEXT NOT NULL,        -- JSON array of sources
  expires_at INTEGER NOT NULL,  -- Unix timestamp for cache expiry
  PRIMARY KEY (imdb_id, region)
);

-- Cache for TVDB series metadata
-- Stores rich series data from TheTVDB
CREATE TABLE IF NOT EXISTS tvdb_cache (
  imdb_id TEXT PRIMARY KEY,
  tvdb_id INTEGER,              -- TVDB internal ID
  payload TEXT NOT NULL,        -- JSON MetaPreview object
  updated_at INTEGER NOT NULL,  -- When the cache was updated
  expires_at INTEGER NOT NULL   -- Unix timestamp for cache expiry
);

-- Index for faster cache invalidation queries
CREATE INDEX IF NOT EXISTS idx_history_updated
  ON history_cache(updated_at);

CREATE INDEX IF NOT EXISTS idx_recommendation_updated
  ON recommendation_cache(updated_at);

CREATE INDEX IF NOT EXISTS idx_tastedive_expires
  ON tastedive_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_watchmode_expires
  ON watchmode_sources(expires_at);

CREATE INDEX IF NOT EXISTS idx_tvdb_expires
  ON tvdb_cache(expires_at);

-- =====================================================
-- YouTube Channel Profiles (Angela, Wes, Bing Bong)
-- Each channel has its own watch history and recommendations
-- =====================================================

-- Channel profiles (3 channels per user)
CREATE TABLE IF NOT EXISTS youtube_channels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  avatar TEXT,                   -- Path to avatar image
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);

-- Watch history per YouTube channel
CREATE TABLE IF NOT EXISTS youtube_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_name TEXT,
  thumbnail TEXT,
  duration TEXT,
  watched_at TEXT DEFAULT CURRENT_TIMESTAMP,
  watch_progress INTEGER DEFAULT 0,
  FOREIGN KEY (channel_id) REFERENCES youtube_channels(id),
  UNIQUE(channel_id, video_id)
);

-- Saved/favorited videos per YouTube channel
CREATE TABLE IF NOT EXISTS youtube_saved (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_name TEXT,
  thumbnail TEXT,
  duration TEXT,
  saved_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES youtube_channels(id),
  UNIQUE(channel_id, video_id)
);

-- AI recommendation cache per YouTube channel
CREATE TABLE IF NOT EXISTS youtube_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_name TEXT,
  thumbnail TEXT,
  duration TEXT,
  reason TEXT,
  score REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES youtube_channels(id)
);

-- Indexes for YouTube tables
CREATE INDEX IF NOT EXISTS idx_yt_history_channel ON youtube_history(channel_id);
CREATE INDEX IF NOT EXISTS idx_yt_saved_channel ON youtube_saved(channel_id);
CREATE INDEX IF NOT EXISTS idx_yt_recs_channel ON youtube_recommendations(channel_id);
`;

/**
 * Configuration for cache TTLs (in seconds)
 */
export const CACHE_TTL = {
  // Watch history cache: 1 hour
  // Users don't watch things that frequently
  history: 60 * 60,

  // Recommendation cache: 4 hours
  // Recommendations based on same history shouldn't change
  recommendations: 60 * 60 * 4,
} as const;

/**
 * Schema for the history cache data
 */
export interface HistoryCacheRow {
  user_id: string;
  data: string; // JSON
  trakt_username: string | null;
  item_count: number;
  created_at: number;
  updated_at: number;
}

/**
 * Schema for the recommendation cache data
 */
export interface RecommendationCacheRow {
  user_id: string;
  data: string; // JSON
  history_hash: string;
  created_at: number;
  updated_at: number;
}
