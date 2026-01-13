/**
 * Prompt Builder Utility
 *
 * Utilities for building prompts for AI analysis.
 * This is mostly used by GeminiAdapter but can be useful for testing.
 */

import type { WatchHistoryItem } from '../types.js';

/**
 * Format watch history into a prompt-friendly string
 */
export function formatWatchHistory(history: WatchHistoryItem[], limit = 50): string {
  const items = history.slice(0, limit);

  const formattedItems = items.map((item, index) => {
    const parts = [
      `${index + 1}. "${item.title}" (${item.year})`,
      `   Type: ${item.type}`,
      `   Genres: ${item.genres.join(', ') || 'Unknown'}`,
    ];

    if (item.rating !== undefined) {
      parts.push(`   User Rating: ${item.rating}/10`);
    }

    if (item.runtime) {
      parts.push(`   Runtime: ${item.runtime} min`);
    }

    if (item.certification) {
      parts.push(`   Certification: ${item.certification}`);
    }

    const watchedDate = new Date(item.watchedAt);
    parts.push(`   Watched: ${watchedDate.toLocaleDateString()}`);

    return parts.join('\n');
  });

  return `## User's Watch History (${items.length} items)

${formattedItems.join('\n\n')}

Based on this watch history, provide psychographic recommendations that match their viewing patterns.`;
}

/**
 * Generate a summary of the watch history for logging
 */
export function summarizeHistory(history: WatchHistoryItem[]): string {
  const movies = history.filter((h) => h.type === 'movie').length;
  const shows = history.filter((h) => h.type === 'show').length;
  const rated = history.filter((h) => h.rating !== undefined).length;

  const genres = new Map<string, number>();
  for (const item of history) {
    for (const genre of item.genres) {
      genres.set(genre, (genres.get(genre) ?? 0) + 1);
    }
  }

  const topGenres = Array.from(genres.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre);

  return `${movies} movies, ${shows} shows, ${rated} rated. Top genres: ${topGenres.join(', ')}`;
}

/**
 * Calculate average rating from history
 */
export function calculateAverageRating(history: WatchHistoryItem[]): number | null {
  const rated = history.filter((h) => h.rating !== undefined);
  if (rated.length === 0) return null;

  const sum = rated.reduce((acc, h) => acc + (h.rating ?? 0), 0);
  return Math.round((sum / rated.length) * 10) / 10;
}
