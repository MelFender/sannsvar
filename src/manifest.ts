/**
 * Dynamic manifest generator for Stremio addon
 *
 * Supports multiple content types:
 * - movie/series: AI-powered recommendations from Trakt history
 * - channel: YouTube profiles (Angela, Wes, Bing Bong) with personalized recommendations
 */

import type { StremioManifest, UserConfig } from './types.js';
import { CATEGORIES } from './categories.js';
import type { YouTubeChannel } from './db/YouTubeRepository.js';

// Items per page - matches Stremio's viewport width
export const PAGE_SIZE = 15;
export const YOUTUBE_PAGE_SIZE = 20;

/**
 * Generate movie/series catalogs from categories
 */
function generateMovieCatalogs(): StremioManifest['catalogs'] {
  const catalogs: StremioManifest['catalogs'] = [];

  for (const category of CATEGORIES) {
    for (const type of category.types) {
      catalogs.push({
        type,
        id: category.id,
        name: category.name,
        extra: [{ name: 'skip' }],
      });
    }
  }

  return catalogs;
}

/**
 * Generate YouTube channel catalogs
 */
function generateYouTubeCatalogs(channels: YouTubeChannel[]): StremioManifest['catalogs'] {
  return channels.map(channel => ({
    type: 'channel' as const,
    id: `yt-${channel.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: channel.name,
    extra: [
      { name: 'skip', isRequired: false },
      { name: 'search', isRequired: false },
    ],
  }));
}

/**
 * Default YouTube channels when none exist
 */
const DEFAULT_YOUTUBE_CHANNELS: YouTubeChannel[] = [
  { id: 'default:angela', user_id: 'default', name: 'Angela', avatar: '/static/avatars/angela.jpg', created_at: '' },
  { id: 'default:wes', user_id: 'default', name: 'Wes', avatar: '/static/avatars/wes.png', created_at: '' },
  { id: 'default:bing-bong', user_id: 'default', name: 'Bing Bong', avatar: '/static/avatars/bingbong.webp', created_at: '' },
];

/**
 * Returns the addon manifest with all catalogs
 */
export function getManifest(_config?: UserConfig, youtubeChannels?: YouTubeChannel[], baseUrl?: string): StremioManifest {
  const channels = youtubeChannels && youtubeChannels.length > 0 ? youtubeChannels : DEFAULT_YOUTUBE_CHANNELS;
  const url = baseUrl || 'http://localhost:7001';

  const movieCatalogs = generateMovieCatalogs();
  const youtubeCatalogs = generateYouTubeCatalogs(channels);

  // Build manifest with custom youtubeChannels field for avatar UI
  const manifest: StremioManifest & { youtubeChannels?: unknown } = {
    id: 'com.sannsvar',
    name: 'Sannsvar',
    version: '2.0.0',
    description:
      'AI-powered entertainment hub. Movie/TV recommendations from your watch history + 3 personalized YouTube channels (Angela, Wes, Bing Bong).',
    logo: 'https://i.imgur.com/QfWgwAK.png',
    catalogs: [...movieCatalogs, ...youtubeCatalogs],
    resources: [
      'catalog',
      // Movie/series meta with IMDB IDs
      { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] },
      // YouTube meta and streams with yt: prefix
      { name: 'meta', types: ['channel'], idPrefixes: ['yt:'] },
      { name: 'stream', types: ['channel'], idPrefixes: ['yt:'] },
    ],
    types: ['movie', 'series', 'channel'],
    idPrefixes: ['tt', 'yt:'],
    behaviorHints: {
      configurable: true,
      configurationRequired: false, // Allow browsing without config
    },
  };

  // Add custom field for YouTube channel avatars
  manifest.youtubeChannels = channels.map(ch => ({
    id: `yt-${ch.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: ch.name,
    avatar: ch.avatar ? `${url}${ch.avatar}` : null,
  }));

  return manifest as StremioManifest;
}
