/**
 * Watchmode Integration
 *
 * Filters recommendations by streaming availability in user's region.
 * Only returns titles that are actually available to stream.
 *
 * @see https://api.watchmode.com/docs/
 */

import { fetchWithTimeout } from '../utils/http.js';
import { getDatabase } from '../db/database.js';

const WATCHMODE_BASE = 'https://api.watchmode.com/v1';
const TIMEOUT_MS = 8000;
const SOURCES_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export type WatchmodeSource = {
  source_id?: number;
  name?: string;
  type?: string;
  region?: string;
};

/**
 * Filter IMDB IDs by streaming availability
 *
 * Takes a list of IMDB IDs and returns only those available
 * to stream in the specified region.
 *
 * @param imdbIds - List of IMDB IDs to check
 * @param apiKey - Watchmode API key
 * @param region - Country code (e.g., "US", "GB", "AU")
 * @returns Filtered list of available IMDB IDs
 */
export async function filterByWatchmodeAvailability(
  imdbIds: string[],
  apiKey?: string,
  region?: string
): Promise<string[]> {
  const key = apiKey?.trim();
  if (!key) return imdbIds; // No key = return all (no filtering)

  const normalizedRegion = region?.trim().toUpperCase();
  const results: string[] = [];

  for (const imdbId of imdbIds) {
    const sources = await getSources(imdbId, key, normalizedRegion);

    // If we couldn't check (API error), include it anyway
    if (sources === null) {
      results.push(imdbId);
      continue;
    }

    // Only include if there are streaming sources
    if (sources.length > 0) {
      results.push(imdbId);
    }
  }

  return results;
}

/**
 * Get streaming sources for a title
 */
async function getSources(
  imdbId: string,
  apiKey: string,
  region?: string
): Promise<WatchmodeSource[] | null> {
  const normalizedRegion = region ?? 'all';

  // Check cache first
  const cached = readCache(imdbId, normalizedRegion);
  if (cached) return cached;

  const url = new URL(`${WATCHMODE_BASE}/title/${imdbId}/sources/`);
  url.searchParams.set('apiKey', apiKey);
  if (region) url.searchParams.set('regions', region);

  try {
    const response = await fetchWithTimeout(url.toString(), { method: 'GET' }, TIMEOUT_MS);

    if (!response.ok) return null;

    const data = (await response.json()) as WatchmodeSource[];
    if (!Array.isArray(data)) return null;

    writeCache(imdbId, normalizedRegion, data);
    return data;
  } catch (error) {
    console.error('[Watchmode] API error:', error);
    return null;
  }
}

// --- Cache Functions ---

function readCache(imdbId: string, region: string): WatchmodeSource[] | null {
  try {
    const db = getDatabase();
    const row = db
      .prepare(
        'SELECT payload, expires_at FROM watchmode_sources WHERE imdb_id = ? AND region = ?'
      )
      .get(imdbId, region) as { payload: string; expires_at: number } | undefined;

    if (!row) return null;
    if (row.expires_at <= Date.now()) return null;

    const parsed = JSON.parse(row.payload);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(imdbId: string, region: string, payload: WatchmodeSource[]): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO watchmode_sources (imdb_id, region, payload, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(imdb_id, region) DO UPDATE SET
         payload = excluded.payload,
         expires_at = excluded.expires_at`
    ).run(imdbId, region, JSON.stringify(payload), Date.now() + SOURCES_TTL_MS);
  } catch (error) {
    console.error('[Watchmode] Cache write error:', error);
  }
}
