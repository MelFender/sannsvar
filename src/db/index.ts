/**
 * Database Module
 *
 * Exports all database-related functionality.
 */

export { getDatabase, closeDatabase, isDatabaseConnected } from './database.js';
export { CacheRepository } from './CacheRepository.js';
export { SCHEMA, CACHE_TTL, type HistoryCacheRow, type RecommendationCacheRow } from './schema.js';
