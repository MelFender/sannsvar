/**
 * Cache Repository
 *
 * Handles caching of watch history and recommendations in SQLite.
 */

import type Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { getDatabase } from './database.js';
import { CACHE_TTL, type HistoryCacheRow, type RecommendationCacheRow } from './schema.js';
import type { WatchHistoryItem, Recommendation } from '../types.js';

/**
 * Repository for caching data in SQLite
 */
export class CacheRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Generate a hash of watch history for cache invalidation
   */
  private hashHistory(history: WatchHistoryItem[]): string {
    const data = history.map((h) => `${h.imdbId}:${h.watchedAt.getTime()}`).join('|');
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Check if a cached item is still valid
   */
  private isValid(updatedAt: number, ttlSeconds: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now - updatedAt < ttlSeconds;
  }

  // ==================== History Cache ====================

  /**
   * Get cached watch history for a user
   */
  getHistory(userId: string): WatchHistoryItem[] | null {
    const stmt = this.db.prepare<[string], HistoryCacheRow>(
      'SELECT * FROM history_cache WHERE user_id = ?'
    );
    const row = stmt.get(userId);

    if (!row || !this.isValid(row.updated_at, CACHE_TTL.history)) {
      return null;
    }

    try {
      const data = JSON.parse(row.data) as Array<{
        imdbId: string;
        title: string;
        year: number;
        type: 'movie' | 'show';
        genres: string[];
        rating?: number;
        watchedAt: string;
        runtime?: number;
        certification?: string;
      }>;

      // Reconstruct Date objects
      return data.map((item) => ({
        ...item,
        watchedAt: new Date(item.watchedAt),
      }));
    } catch {
      return null;
    }
  }

  /**
   * Cache watch history for a user
   */
  setHistory(userId: string, history: WatchHistoryItem[], traktUsername?: string): void {
    const now = Math.floor(Date.now() / 1000);
    const data = JSON.stringify(history);

    const stmt = this.db.prepare(`
      INSERT INTO history_cache (user_id, data, trakt_username, item_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        data = excluded.data,
        trakt_username = excluded.trakt_username,
        item_count = excluded.item_count,
        updated_at = excluded.updated_at
    `);

    stmt.run(userId, data, traktUsername ?? null, history.length, now, now);
  }

  /**
   * Invalidate history cache for a user
   */
  invalidateHistory(userId: string): void {
    const stmt = this.db.prepare('DELETE FROM history_cache WHERE user_id = ?');
    stmt.run(userId);
  }

  // ==================== Recommendation Cache ====================

  /**
   * Get cached recommendations for a user
   *
   * @param userId - User identifier
   * @param currentHistory - Current watch history (to check if cache is stale)
   */
  getRecommendations(userId: string, currentHistory: WatchHistoryItem[]): Recommendation[] | null {
    const stmt = this.db.prepare<[string], RecommendationCacheRow>(
      'SELECT * FROM recommendation_cache WHERE user_id = ?'
    );
    const row = stmt.get(userId);

    if (!row || !this.isValid(row.updated_at, CACHE_TTL.recommendations)) {
      return null;
    }

    // Check if history has changed since recommendations were generated
    const currentHash = this.hashHistory(currentHistory);
    if (row.history_hash !== currentHash) {
      return null;
    }

    try {
      return JSON.parse(row.data) as Recommendation[];
    } catch {
      return null;
    }
  }

  /**
   * Cache recommendations for a user
   */
  setRecommendations(
    userId: string,
    recommendations: Recommendation[],
    history: WatchHistoryItem[]
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const data = JSON.stringify(recommendations);
    const historyHash = this.hashHistory(history);

    const stmt = this.db.prepare(`
      INSERT INTO recommendation_cache (user_id, data, history_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        data = excluded.data,
        history_hash = excluded.history_hash,
        updated_at = excluded.updated_at
    `);

    stmt.run(userId, data, historyHash, now, now);
  }

  /**
   * Invalidate recommendation cache for a user
   */
  invalidateRecommendations(userId: string): void {
    const stmt = this.db.prepare('DELETE FROM recommendation_cache WHERE user_id = ?');
    stmt.run(userId);
  }

  // ==================== Maintenance ====================

  /**
   * Clean up expired cache entries
   */
  cleanupExpired(): { historyDeleted: number; recommendationsDeleted: number } {
    const now = Math.floor(Date.now() / 1000);

    const historyStmt = this.db.prepare(
      'DELETE FROM history_cache WHERE updated_at < ?'
    );
    const historyResult = historyStmt.run(now - CACHE_TTL.history);

    const recStmt = this.db.prepare(
      'DELETE FROM recommendation_cache WHERE updated_at < ?'
    );
    const recResult = recStmt.run(now - CACHE_TTL.recommendations);

    return {
      historyDeleted: historyResult.changes,
      recommendationsDeleted: recResult.changes,
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): { historyCount: number; recommendationCount: number } {
    const historyCount = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM history_cache')
      .get();

    const recCount = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM recommendation_cache')
      .get();

    return {
      historyCount: historyCount?.count ?? 0,
      recommendationCount: recCount?.count ?? 0,
    };
  }
}
