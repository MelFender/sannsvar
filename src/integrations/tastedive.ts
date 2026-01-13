/**
 * TasteDive Integration
 *
 * Expands recommendations by finding similar titles based on user's query and history.
 * This provides "seed" titles to help the AI make better recommendations.
 *
 * @see https://tastedive.com/read/api
 */

import { fetchWithTimeout } from '../utils/http.js';
import { getDatabase } from '../db/database.js';

const TASTEDIVE_BASE = 'https://tastedive.com/api/similar';
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface TasteDiveSeedOptions {
  query: string;
  historyTitles: string[];
  type: 'movie' | 'series';
  apiKey?: string;
}

/**
 * Get similar titles from TasteDive to expand recommendation seeds
 *
 * Takes a query and/or history titles and returns similar titles
 * that can be used to improve AI recommendations.
 */
export async function getTasteDiveSeeds(options: TasteDiveSeedOptions): Promise<string[]> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return [];

  const seeds = buildSeeds(options.query, options.historyTitles);
  if (seeds.length === 0) return [];

  const q = seeds.join(',');
  const cacheKey = `${options.type}:${q}`;

  // Check cache first
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const typeParam = options.type === 'series' ? 'show' : 'movie';
  const url = `${TASTEDIVE_BASE}?q=${encodeURIComponent(q)}&type=${typeParam}&limit=10&k=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, TIMEOUT_MS);

    if (!response.ok) return [];

    const data = (await response.json()) as {
      Similar?: { Results?: Array<{ Name?: string }> };
    };

    const results = data.Similar?.Results ?? [];
    const names = results
      .map((item) => item.Name)
      .filter((name): name is string => Boolean(name));

    writeCache(cacheKey, names);
    return names;
  } catch (error) {
    console.error('[TasteDive] API error:', error);
    return [];
  }
}

/**
 * Build seed list from query and history titles
 * Combines up to 4 items for the TasteDive query
 */
function buildSeeds(query: string, historyTitles: string[]): string[] {
  const cleanedQuery = query.trim();
  const picks: string[] = [];

  if (cleanedQuery) picks.push(cleanedQuery);

  for (const title of historyTitles) {
    if (picks.length >= 4) break;
    if (!title) continue;
    picks.push(title);
  }

  // Remove commas as they're used as separators in the API
  return picks.map((item) => item.replace(/,/g, ' '));
}

// --- Cache Functions ---

function readCache(key: string): string[] | null {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT payload, expires_at FROM tastedive_cache WHERE query = ?')
      .get(key) as { payload: string; expires_at: number } | undefined;

    if (!row) return null;
    if (row.expires_at <= Date.now()) return null;

    const parsed = JSON.parse(row.payload);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: string[]): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO tastedive_cache (query, payload, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(query) DO UPDATE SET
         payload = excluded.payload,
         expires_at = excluded.expires_at`
    ).run(key, JSON.stringify(payload), Date.now() + CACHE_TTL_MS);
  } catch (error) {
    console.error('[TasteDive] Cache write error:', error);
  }
}
