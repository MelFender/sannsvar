/**
 * External Service Integrations
 *
 * These integrations enhance recommendations by:
 * - TasteDive: Finding similar titles to expand AI seeds
 * - Watchmode: Filtering by streaming availability
 * - TVDB: Getting rich series metadata
 */

export { getTasteDiveSeeds, type TasteDiveSeedOptions } from './tastedive.js';
export { filterByWatchmodeAvailability, type WatchmodeSource } from './watchmode.js';
export { getSeriesMetaFromTvdb, tvdbConfigured, type TvdbMetaPreview } from './tvdb.js';
