/**
 * Meta Handler
 *
 * Handles Stremio meta requests for movie/series details.
 * Returns minimal metadata with AI-powered similar content links.
 */

import type { UserConfig, StremioMeta, StremioMetaLink } from '../types.js';
import { getSimilar } from './similar.js';

/**
 * Get metadata for a specific movie or series with similar content links
 *
 * Note: Full metadata (poster, cast, etc.) comes from Stremio's Cinemeta.
 * We add AI-powered "Similar" recommendations as links.
 */
export async function getMeta(
  config: UserConfig,
  contentType: 'movie' | 'series',
  imdbId: string,
  title?: string // Optional title for better AI context
): Promise<StremioMeta | null> {
  // Validate IMDB ID format
  if (!/^tt\d{7,8}$/.test(imdbId)) {
    return null;
  }

  // Get similar content recommendations
  const links: StremioMetaLink[] = [];

  try {
    // Use provided title or generate a placeholder
    const sourceTitle = title || `Content ${imdbId}`;
    const similarItems = await getSimilar(config, imdbId, sourceTitle, contentType);

    // Convert similar items to Stremio links
    for (const item of similarItems) {
      links.push({
        name: item.name,
        category: 'Similar',
        url: `stremio:///detail/${item.type}/${item.id}`,
      });
    }

    console.log(`[Meta] Added ${links.length} similar items for ${imdbId}`);
  } catch (error) {
    console.error(`[Meta] Failed to get similar content for ${imdbId}:`, error);
    // Continue without similar links - better than failing entirely
  }

  // Return minimal meta with similar links
  // Stremio will fetch full details from IMDB/Cinemeta
  return {
    id: imdbId,
    type: contentType,
    name: title || `Loading... (${imdbId})`,
    links: links.length > 0 ? links : undefined,
  };
}
