/**
 * YouTube Channel Repository
 *
 * Handles database operations for YouTube channels (Angela, Wes, Bing Bong).
 * Each channel has its own watch history and AI recommendations.
 */

import { getDatabase } from './database.js';
import type Database from 'better-sqlite3';

// ==================== Interfaces ====================

export interface YouTubeChannel {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  avatar?: string;
  created_at: string;
}

export interface VideoRecord {
  video_id: string;
  title: string;
  channel_name?: string;
  thumbnail?: string;
  duration?: string;
}

export interface WatchHistoryRecord extends VideoRecord {
  watched_at: string;
  watch_progress: number;
}

export interface RecommendationRecord extends VideoRecord {
  reason?: string;
  score: number;
}

// Default channel configurations
const DEFAULT_CHANNELS = [
  { name: 'Angela', avatar: '/static/avatars/angela.jpg', description: 'Your personal Angela channel' },
  { name: 'Wes', avatar: '/static/avatars/wes.png', description: 'Your personal Wes channel' },
  { name: 'Bing Bong', avatar: '/static/avatars/bingbong.webp', description: 'Your personal Bing Bong channel' },
];

// ==================== Channel Repository ====================

export class YouTubeChannelRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create a new YouTube channel
   */
  createChannel(userId: string, name: string, avatar?: string, description?: string): YouTubeChannel {
    const id = `${userId}:${name.toLowerCase().replace(/\s+/g, '-')}`;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO youtube_channels (id, user_id, name, description, avatar)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, userId, name, description || null, avatar || null);

    return this.getChannel(id)!;
  }

  /**
   * Get a channel by ID
   */
  getChannel(id: string): YouTubeChannel | null {
    const stmt = this.db.prepare('SELECT * FROM youtube_channels WHERE id = ?');
    return stmt.get(id) as YouTubeChannel | null;
  }

  /**
   * Get all channels for a user
   */
  getUserChannels(userId: string): YouTubeChannel[] {
    const stmt = this.db.prepare('SELECT * FROM youtube_channels WHERE user_id = ? ORDER BY created_at');
    return stmt.all(userId) as YouTubeChannel[];
  }

  /**
   * Ensure default channels exist (Angela, Wes, Bing Bong)
   */
  ensureDefaultChannels(userId: string): YouTubeChannel[] {
    const existing = this.getUserChannels(userId);

    if (existing.length >= 3) {
      return existing.slice(0, 3);
    }

    const channels: YouTubeChannel[] = [...existing];

    for (let i = existing.length; i < 3; i++) {
      const def = DEFAULT_CHANNELS[i];
      channels.push(this.createChannel(userId, def.name, def.avatar, def.description));
    }

    return channels;
  }

  /**
   * Rename a channel
   */
  renameChannel(channelId: string, newName: string): void {
    const stmt = this.db.prepare('UPDATE youtube_channels SET name = ? WHERE id = ?');
    stmt.run(newName, channelId);
  }

  /**
   * Update channel avatar
   */
  updateAvatar(channelId: string, avatar: string): void {
    const stmt = this.db.prepare('UPDATE youtube_channels SET avatar = ? WHERE id = ?');
    stmt.run(avatar, channelId);
  }
}

// ==================== History Repository ====================

export class YouTubeHistoryRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Add video to watch history
   */
  addToHistory(channelId: string, video: VideoRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO youtube_history
      (channel_id, video_id, title, channel_name, thumbnail, duration, watched_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      channelId,
      video.video_id,
      video.title,
      video.channel_name || null,
      video.thumbnail || null,
      video.duration || null
    );
  }

  /**
   * Get watch history for a channel
   */
  getHistory(channelId: string, limit: number = 50): WatchHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT video_id, title, channel_name, thumbnail, duration, watched_at, watch_progress
      FROM youtube_history
      WHERE channel_id = ?
      ORDER BY watched_at DESC
      LIMIT ?
    `);

    return stmt.all(channelId, limit) as WatchHistoryRecord[];
  }

  /**
   * Clear watch history for a channel
   */
  clearHistory(channelId: string): void {
    const stmt = this.db.prepare('DELETE FROM youtube_history WHERE channel_id = ?');
    stmt.run(channelId);
  }
}

// ==================== Saved Videos Repository ====================

export class YouTubeSavedRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Save a video to favorites
   */
  saveVideo(channelId: string, video: VideoRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO youtube_saved
      (channel_id, video_id, title, channel_name, thumbnail, duration)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      channelId,
      video.video_id,
      video.title,
      video.channel_name || null,
      video.thumbnail || null,
      video.duration || null
    );
  }

  /**
   * Remove video from favorites
   */
  unsaveVideo(channelId: string, videoId: string): void {
    const stmt = this.db.prepare('DELETE FROM youtube_saved WHERE channel_id = ? AND video_id = ?');
    stmt.run(channelId, videoId);
  }

  /**
   * Get saved videos for a channel
   */
  getSavedVideos(channelId: string, limit: number = 100): VideoRecord[] {
    const stmt = this.db.prepare(`
      SELECT video_id, title, channel_name, thumbnail, duration
      FROM youtube_saved
      WHERE channel_id = ?
      ORDER BY saved_at DESC
      LIMIT ?
    `);

    return stmt.all(channelId, limit) as VideoRecord[];
  }

  /**
   * Check if video is saved
   */
  isSaved(channelId: string, videoId: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM youtube_saved WHERE channel_id = ? AND video_id = ?');
    return !!stmt.get(channelId, videoId);
  }
}

// ==================== Recommendations Repository ====================

export class YouTubeRecommendationsRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Set recommendations for a channel (replaces existing)
   */
  setRecommendations(channelId: string, recommendations: RecommendationRecord[]): void {
    // Clear old recommendations
    const clearStmt = this.db.prepare('DELETE FROM youtube_recommendations WHERE channel_id = ?');
    clearStmt.run(channelId);

    // Insert new ones
    const insertStmt = this.db.prepare(`
      INSERT INTO youtube_recommendations
      (channel_id, video_id, title, channel_name, thumbnail, duration, reason, score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rec of recommendations) {
      insertStmt.run(
        channelId,
        rec.video_id,
        rec.title,
        rec.channel_name || null,
        rec.thumbnail || null,
        rec.duration || null,
        rec.reason || null,
        rec.score
      );
    }
  }

  /**
   * Get recommendations for a channel
   */
  getRecommendations(channelId: string, limit: number = 50, offset: number = 0): RecommendationRecord[] {
    const stmt = this.db.prepare(`
      SELECT video_id, title, channel_name, thumbnail, duration, reason, score
      FROM youtube_recommendations
      WHERE channel_id = ?
      ORDER BY score DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(channelId, limit, offset) as RecommendationRecord[];
  }

  /**
   * Check if channel has recommendations
   */
  hasRecommendations(channelId: string): boolean {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM youtube_recommendations WHERE channel_id = ?');
    const result = stmt.get(channelId) as { count: number };
    return result.count > 0;
  }

  /**
   * Clear recommendations for a channel
   */
  clearRecommendations(channelId: string): void {
    const stmt = this.db.prepare('DELETE FROM youtube_recommendations WHERE channel_id = ?');
    stmt.run(channelId);
  }
}
