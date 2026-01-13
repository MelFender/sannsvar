/**
 * TVDB Integration
 *
 * Fetches series metadata from TheTVDB.com for better series information.
 * Useful when Cinemeta doesn't have complete series data.
 *
 * @see https://thetvdb.github.io/v4-api/
 */

import { fetchWithTimeout } from '../utils/http.js';
import { getDatabase } from '../db/database.js';

const TVDB_BASE = 'https://api4.thetvdb.com/v4';
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const defaultApiKey = process.env.TVDB_API_KEY || '';
const defaultPin = process.env.TVDB_PIN || '';

type TvdbCredentials = { apiKey: string; pin: string };

// In-memory token cache (tokens are short-lived)
const tokenCache = new Map<string, { token: string; fetchedAt: number }>();

export interface TvdbMetaPreview {
  id: string;
  type: 'series';
  name: string;
  description?: string;
  poster?: string;
  background?: string;
  releaseInfo?: string;
  genres?: string[];
  imdbRating?: string;
}

/**
 * Check if TVDB is configured (has API key)
 */
export function tvdbConfigured(override?: { apiKey?: string; pin?: string }): boolean {
  return Boolean(resolveCredentials(override));
}

/**
 * Get series metadata from TVDB by IMDB ID
 */
export async function getSeriesMetaFromTvdb(
  imdbId: string,
  override?: { apiKey?: string; pin?: string }
): Promise<TvdbMetaPreview | null> {
  const credentials = resolveCredentials(override);
  if (!credentials) return null;

  // Check cache first
  const cached = readCache(imdbId);
  if (cached) return cached;

  // Search TVDB by IMDB ID
  const tvdbId = await searchByRemoteId(imdbId, credentials);
  if (!tvdbId) return null;

  // Fetch series details
  const seriesData = await tvdbRequest(`/series/${tvdbId}`, credentials);
  if (!seriesData || typeof seriesData !== 'object') return null;

  const meta = mapSeriesToMeta(imdbId, seriesData as Record<string, unknown>);
  if (!meta) return null;

  writeCache(imdbId, tvdbId, meta);
  return meta;
}

/**
 * Search TVDB by IMDB remote ID
 */
async function searchByRemoteId(
  imdbId: string,
  credentials: TvdbCredentials
): Promise<number | null> {
  const data = await tvdbRequest(`/search/remoteid/${imdbId}`, credentials);
  if (!Array.isArray(data)) return null;

  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { tvdb_id?: number; type?: string };
    const isSeries = record.type?.includes('series') ?? false;
    if (record.tvdb_id && isSeries) return record.tvdb_id;
  }

  return null;
}

/**
 * Make authenticated request to TVDB API
 */
async function tvdbRequest(
  path: string,
  credentials: TvdbCredentials
): Promise<unknown> {
  const token = await getToken(credentials);
  if (!token) return null;

  try {
    const response = await fetchWithTimeout(
      `${TVDB_BASE}${path}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      TIMEOUT_MS
    );

    // Handle token expiry
    if (response.status === 401) {
      tokenCache.delete(cacheKey(credentials));
      const refreshed = await getToken(credentials);
      if (!refreshed) return null;

      const retry = await fetchWithTimeout(
        `${TVDB_BASE}${path}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${refreshed}`,
            'Content-Type': 'application/json',
          },
        },
        TIMEOUT_MS
      );

      if (!retry.ok) return null;
      return extractData(await retry.json());
    }

    if (!response.ok) return null;
    return extractData(await response.json());
  } catch (error) {
    console.error('[TVDB] API error:', error);
    return null;
  }
}

/**
 * Get authentication token (cached for 6 hours)
 */
async function getToken(credentials: TvdbCredentials): Promise<string | null> {
  const key = cacheKey(credentials);
  const cached = tokenCache.get(key);

  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) {
    return cached.token;
  }

  try {
    const response = await fetchWithTimeout(
      `${TVDB_BASE}/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: credentials.apiKey,
          ...(credentials.pin ? { pin: credentials.pin } : {}),
        }),
      },
      TIMEOUT_MS
    );

    if (!response.ok) return null;

    const payload = await response.json();
    const token = (payload as { data?: { token?: string } }).data?.token;
    if (!token) return null;

    tokenCache.set(key, { token, fetchedAt: Date.now() });
    return token;
  } catch (error) {
    console.error('[TVDB] Login error:', error);
    return null;
  }
}

/**
 * Extract data field from TVDB response
 */
function extractData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { data?: unknown };
  return record.data ?? null;
}

/**
 * Map TVDB series data to our MetaPreview format
 */
function mapSeriesToMeta(
  imdbId: string,
  data: Record<string, unknown>
): TvdbMetaPreview | null {
  const name = pickString(data, ['name', 'seriesName', 'title']);
  if (!name) return null;

  const description = pickString(data, ['overview', 'description']);
  const image = pickString(data, ['image', 'image_url', 'poster', 'poster_path']);
  const firstAired = pickString(data, ['firstAired', 'first_air_time', 'year']);
  const genres = pickStringArray(data, ['genres', 'genre']);
  const score = pickNumber(data, ['score', 'siteRating', 'rating']);

  const meta: TvdbMetaPreview = {
    id: imdbId,
    type: 'series',
    name,
    description: description ?? undefined,
    poster: image ?? undefined,
    background: image ?? undefined,
    releaseInfo: firstAired ?? undefined,
    genres: genres.length > 0 ? genres : undefined,
  };

  if (typeof score === 'number' && Number.isFinite(score)) {
    meta.imdbRating = score.toFixed(1);
  }

  return meta;
}

// --- Helper Functions ---

function pickString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function pickStringArray(data: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === 'string');
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function pickNumber(data: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number') return value;
  }
  return null;
}

// --- Cache Functions ---

function readCache(imdbId: string): TvdbMetaPreview | null {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT payload, expires_at FROM tvdb_cache WHERE imdb_id = ?')
      .get(imdbId) as { payload: string; expires_at: number } | undefined;

    if (!row) return null;
    if (row.expires_at <= Date.now()) return null;

    return JSON.parse(row.payload) as TvdbMetaPreview;
  } catch {
    return null;
  }
}

function writeCache(imdbId: string, tvdbId: number, meta: TvdbMetaPreview): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO tvdb_cache (imdb_id, tvdb_id, payload, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(imdb_id) DO UPDATE SET
         tvdb_id = excluded.tvdb_id,
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         expires_at = excluded.expires_at`
    ).run(imdbId, tvdbId, JSON.stringify(meta), Date.now(), Date.now() + CACHE_TTL_MS);
  } catch (error) {
    console.error('[TVDB] Cache write error:', error);
  }
}

function resolveCredentials(override?: { apiKey?: string; pin?: string }): TvdbCredentials | null {
  const apiKey = override?.apiKey?.trim() || defaultApiKey.trim();
  if (!apiKey) return null;
  const pin = (override?.pin ?? defaultPin).trim();
  return { apiKey, pin };
}

function cacheKey(credentials: TvdbCredentials): string {
  return `${credentials.apiKey}|${credentials.pin}`;
}
