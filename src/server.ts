/**
 * Express server setup with Stremio addon SDK integration
 *
 * Unified addon supporting:
 * - Movie/Series: AI-powered recommendations from Trakt history
 * - YouTube Channels: Angela, Wes, Bing Bong with personalized recommendations
 */

import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getManifest, YOUTUBE_PAGE_SIZE } from './manifest.js';
import { decodeConfig } from './utils/configParser.js';
import { getCatalog } from './handlers/catalog.js';
import { getMeta } from './handlers/meta.js';
import { pollForToken } from './trakt/TraktAuth.js';
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  type GoogleOAuthConfig,
} from './oauth/GoogleOAuth.js';
import {
  getOpenAIAuthUrl,
  exchangeOpenAICodeForTokens,
  type OpenAIOAuthConfig,
} from './oauth/OpenAIOAuth.js';
import {
  getClaudeAuthUrl,
  exchangeClaudeCodeForTokens,
  type ClaudeOAuthConfig,
} from './oauth/ClaudeOAuth.js';
// YouTube channel imports
import {
  YouTubeChannelRepository,
  YouTubeHistoryRepository,
  YouTubeRecommendationsRepository,
  type VideoRecord,
} from './db/YouTubeRepository.js';
import { YouTubeService } from './youtube/YouTubeService.js';
import { AIRecommender } from './youtube/AIRecommender.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment variables for Trakt app credentials
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID ?? '';
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET ?? '';

// Environment variables for Google OAuth (Gemini subscription access)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

// Note: OpenAI and Claude use public client IDs, no secrets needed

/**
 * Helper to safely get a route parameter as string
 * Express ParamsDictionary can have string | string[] values
 */
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  throw new Error(`Missing parameter: ${key}`);
}

export async function createServer(): Promise<Express> {
  const app = express();

  // Enable CORS for Stremio requests
  app.use(cors());
  app.use(express.json());

  // HTTP Cache Control Middleware
  // Reduces load by allowing clients/CDNs to cache responses
  app.use((req, res, next) => {
    // Manifests: Short cache, mostly revalidate
    if (req.url.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    // Catalogs (the expensive AI part): Cache for 1 day
    // stale-while-revalidate allows showing old data while fetching new in background
    else if (req.url.includes('/catalog/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    }
    // Meta endpoints: Cache for 1 week (metadata rarely changes)
    else if (req.url.includes('/meta/')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
    next();
  });

  // Serve static files (config page, avatars)
  app.use('/static', express.static(path.join(__dirname, '../static')));

  // Configuration page redirect
  app.get('/configure', (_req: Request, res: Response) => {
    res.redirect('/static/config.html');
  });

  // ==================== Initialize YouTube Services ====================
  const ytChannelRepo = new YouTubeChannelRepository();
  const ytHistoryRepo = new YouTubeHistoryRepository();
  const ytRecsRepo = new YouTubeRecommendationsRepository();
  const youtubeService = new YouTubeService();
  const ytAIRecommender = new AIRecommender();

  // ==================== API Endpoints (MUST be before /:config routes) ====================

  // Get Trakt client ID for config page
  app.get('/api/trakt-config', (_req: Request, res: Response) => {
    if (!TRAKT_CLIENT_ID) {
      res.status(500).json({ error: 'Trakt credentials not configured' });
      return;
    }
    res.json({ clientId: TRAKT_CLIENT_ID });
  });

  // Exchange Trakt device code for token
  app.post('/api/trakt-token', async (req: Request, res: Response) => {
    if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
      res.status(500).json({ error: 'Trakt credentials not configured' });
      return;
    }

    const { device_code } = req.body as { device_code?: string };
    if (!device_code) {
      res.status(400).json({ error: 'device_code required' });
      return;
    }

    try {
      const token = await pollForToken(TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, device_code);

      if (!token) {
        res.status(400).json({ error: 'authorization_pending' });
        return;
      }

      // Fetch username
      let username = '';
      try {
        const profileResponse = await fetch('https://api.trakt.tv/users/me', {
          headers: {
            'Content-Type': 'application/json',
            'trakt-api-key': TRAKT_CLIENT_ID,
            'trakt-api-version': '2',
            'Authorization': `Bearer ${token.access_token}`,
          },
        });
        if (profileResponse.ok) {
          const profile = await profileResponse.json() as { username?: string };
          username = profile.username ?? '';
        }
      } catch {
        // Ignore profile fetch errors
      }

      res.json({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        username,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ==================== Google OAuth Endpoints ====================

  // Get Google OAuth config for config page
  app.get('/api/google-config', (_req: Request, res: Response) => {
    if (!GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: 'Google OAuth not configured' });
      return;
    }
    res.json({ clientId: GOOGLE_CLIENT_ID });
  });

  // Start Google OAuth flow - returns authorization URL
  app.get('/api/google-auth-url', (req: Request, res: Response) => {
    if (!GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: 'Google OAuth not configured' });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const config: GoogleOAuthConfig = {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: `${baseUrl}/api/google-callback`,
    };

    const authUrl = getGoogleAuthUrl(config);
    res.json({ authUrl });
  });

  // Google OAuth callback - exchanges code for tokens
  app.get('/api/google-callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;

    if (!code) {
      res.status(400).send('Missing authorization code');
      return;
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.status(500).send('Google OAuth not configured');
      return;
    }

    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const config: GoogleOAuthConfig = {
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        redirectUri: `${baseUrl}/api/google-callback`,
      };

      const tokens = await exchangeCodeForTokens(config, code);

      // Return tokens to the config page via postMessage
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Complete</title></head>
        <body>
          <h2>Google Connected!</h2>
          <p>You can close this window.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'google-oauth-success',
                tokens: ${JSON.stringify(tokens)}
              }, '*');
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h2>Authorization Failed</h2>
          <p>${message}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'google-oauth-error',
                error: '${message}'
              }, '*');
            }
          </script>
        </body>
        </html>
      `);
    }
  });

  // ==================== OpenAI OAuth Endpoints ====================

  // Start OpenAI OAuth flow
  app.get('/api/openai-auth-url', (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const config: OpenAIOAuthConfig = {
      redirectUri: `${baseUrl}/api/openai-callback`,
    };

    const { url } = getOpenAIAuthUrl(config);
    res.json({ authUrl: url });
  });

  // OpenAI OAuth callback
  app.get('/api/openai-callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      res.status(400).send('Missing authorization code or state');
      return;
    }

    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const config: OpenAIOAuthConfig = {
        redirectUri: `${baseUrl}/api/openai-callback`,
      };

      const tokens = await exchangeOpenAICodeForTokens(config, code, state);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Complete</title></head>
        <body>
          <h2>OpenAI Connected!</h2>
          <p>You can close this window.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'openai-oauth-success',
                tokens: ${JSON.stringify(tokens)}
              }, '*');
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h2>OpenAI Authorization Failed</h2>
          <p>${message}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'openai-oauth-error',
                error: '${message}'
              }, '*');
            }
          </script>
        </body>
        </html>
      `);
    }
  });

  // ==================== Claude OAuth Endpoints ====================

  // Start Claude OAuth flow
  app.get('/api/claude-auth-url', async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const config: ClaudeOAuthConfig = {
        redirectUri: `${baseUrl}/api/claude-callback`,
      };

      const { url } = await getClaudeAuthUrl(config);
      res.json({ authUrl: url });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Claude OAuth callback
  app.get('/api/claude-callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      res.status(400).send('Missing authorization code or state');
      return;
    }

    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const config: ClaudeOAuthConfig = {
        redirectUri: `${baseUrl}/api/claude-callback`,
      };

      const tokens = await exchangeClaudeCodeForTokens(config, code, state);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Complete</title></head>
        <body>
          <h2>Claude Connected!</h2>
          <p>You can close this window.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'claude-oauth-success',
                tokens: ${JSON.stringify(tokens)}
              }, '*');
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h2>Claude Authorization Failed</h2>
          <p>${message}</p>
          <p class="hint">Note: Anthropic may restrict third-party OAuth access.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'claude-oauth-error',
                error: '${message}'
              }, '*');
            }
          </script>
        </body>
        </html>
      `);
    }
  });

  // ==================== Stremio Addon Routes ====================

  /**
   * Extract user ID from config for YouTube channel personalization
   */
  function extractUserId(configStr: string): string {
    try {
      const config = decodeConfig(configStr);
      // Use Trakt username or generate a hash from config
      if (config.traktAccessToken) {
        return `user-${config.traktAccessToken.slice(0, 8)}`;
      }
      return 'default-user';
    } catch {
      return 'default-user';
    }
  }

  // Base manifest (unconfigured)
  app.get('/manifest.json', (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const channels = ytChannelRepo.ensureDefaultChannels('default-user');
    res.json(getManifest(undefined, channels, baseUrl));
  });

  // Configured manifest
  app.get('/:config/manifest.json', (req: Request, res: Response) => {
    try {
      const configStr = getParam(req.params, 'config');
      const config = decodeConfig(configStr);
      const userId = extractUserId(configStr);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const channels = ytChannelRepo.ensureDefaultChannels(userId);
      res.json(getManifest(config, channels, baseUrl));
    } catch (error) {
      console.error('Failed to decode config:', error);
      res.status(400).json({ error: 'Invalid configuration' });
    }
  });

  /**
   * Parse Stremio extra parameters from URL segment
   * Format: "skip=20" or "genre=Action&skip=10"
   */
  function parseExtras(extraStr?: string): Record<string, string> {
    if (!extraStr) return {};
    const extras: Record<string, string> = {};
    for (const part of extraStr.split('&')) {
      const [key, value] = part.split('=');
      if (key && value !== undefined) {
        extras[key] = decodeURIComponent(value);
      }
    }
    return extras;
  }

  /**
   * Shared catalog handler logic for movie/series
   */
  async function handleMovieCatalog(
    configStr: string,
    type: string,
    catalogId: string,
    extraStr: string | undefined,
    res: Response
  ): Promise<void> {
    try {
      const config = decodeConfig(configStr);
      const extras = parseExtras(extraStr);
      const skip = parseInt(extras.skip ?? '0', 10) || 0;

      const contentType = type === 'series' ? 'series' : 'movie';
      // catalogId is the category (e.g., 'for-you', 'action-thrillers', 'hidden-gems')
      const metas = await getCatalog(config, contentType, catalogId, skip);
      res.json({ metas });
    } catch (error) {
      console.error('Catalog error:', error);
      res.json({ metas: [] });
    }
  }

  /**
   * YouTube channel catalog handler
   */
  async function handleYouTubeCatalog(
    configStr: string,
    catalogId: string,
    extraStr: string | undefined,
    res: Response
  ): Promise<void> {
    try {
      const userId = extractUserId(configStr);
      const extras = parseExtras(extraStr);
      const skip = parseInt(extras.skip ?? '0', 10) || 0;
      const search = extras.search;

      // Map catalog ID to channel (yt-angela -> angela)
      const channelName = catalogId.replace('yt-', '');
      const channels = ytChannelRepo.ensureDefaultChannels(userId);
      const channel = channels.find(
        ch => ch.name.toLowerCase().replace(/\s+/g, '-') === channelName
      );

      if (!channel) {
        console.log(`[YouTube] Channel not found: ${channelName}`);
        res.json({ metas: [] });
        return;
      }

      interface YouTubeMeta {
        id: string;
        type: 'channel';
        name: string;
        poster?: string;
        background?: string;
        description?: string;
      }

      let metas: YouTubeMeta[];

      if (search) {
        // Search mode
        const videos = await youtubeService.search(search, YOUTUBE_PAGE_SIZE);
        metas = videos.map(v => ({
          id: `yt:${v.id}`,
          type: 'channel' as const,
          name: v.title,
          poster: v.thumbnail,
          background: v.thumbnail,
          description: `From ${v.channelTitle}`,
        }));
      } else {
        // Recommendation mode - based on channel's history
        let recs = ytRecsRepo.getRecommendations(channel.id, YOUTUBE_PAGE_SIZE, skip);

        // If no cached recs, generate new ones
        if (recs.length === 0 && skip === 0) {
          console.log(`[YouTube:${channel.name}] Generating recommendations...`);
          const history = ytHistoryRepo.getHistory(channel.id, 50);
          const newRecs = await ytAIRecommender.generateRecommendations(channel.id, history, 50);
          ytRecsRepo.setRecommendations(channel.id, newRecs);
          recs = newRecs.slice(0, YOUTUBE_PAGE_SIZE);
        }

        metas = recs.map(r => ({
          id: `yt:${r.video_id}`,
          type: 'channel' as const,
          name: r.title,
          poster: r.thumbnail,
          background: r.thumbnail,
          description: r.reason || (r.channel_name ? `From ${r.channel_name}` : undefined),
        }));
      }

      res.json({ metas });
    } catch (error) {
      console.error('[YouTube] Catalog error:', error);
      res.json({ metas: [] });
    }
  }

  /**
   * Combined catalog handler - routes to movie/series or YouTube
   */
  async function handleCatalog(
    configStr: string,
    type: string,
    catalogId: string,
    extraStr: string | undefined,
    res: Response
  ): Promise<void> {
    // YouTube channels have catalog IDs starting with "yt-"
    if (type === 'channel' || catalogId.startsWith('yt-')) {
      await handleYouTubeCatalog(configStr, catalogId, extraStr, res);
    } else if (type === 'movie' || type === 'series') {
      await handleMovieCatalog(configStr, type, catalogId, extraStr, res);
    } else {
      res.json({ metas: [] });
    }
  }

  // Catalog handler - with extra parameters (for pagination: /catalog/movie/id/skip=10.json)
  app.get('/:config/catalog/:type/:id/:extra.json', async (req: Request, res: Response) => {
    const configStr = getParam(req.params, 'config');
    const type = getParam(req.params, 'type');
    const id = getParam(req.params, 'id');
    const extra = getParam(req.params, 'extra');
    await handleCatalog(configStr, type, id, extra, res);
  });

  // Catalog handler - without extra parameters (default: /catalog/movie/id.json)
  app.get('/:config/catalog/:type/:id.json', async (req: Request, res: Response) => {
    const configStr = getParam(req.params, 'config');
    const type = getParam(req.params, 'type');
    const id = getParam(req.params, 'id');
    await handleCatalog(configStr, type, id, undefined, res);
  });

  // Meta handler - Movie/Series/YouTube details
  app.get('/:config/meta/:type/:id.json', async (req: Request, res: Response) => {
    try {
      const configStr = getParam(req.params, 'config');
      const type = getParam(req.params, 'type');
      const id = getParam(req.params, 'id');

      // YouTube video meta
      if (type === 'channel' || id.startsWith('yt:')) {
        const videoId = id.replace('yt:', '');
        const details = await youtubeService.getVideoDetails(videoId);

        if (details.length === 0) {
          res.status(404).json({ error: 'Video not found' });
          return;
        }

        const video = details[0];
        res.json({
          meta: {
            id: `yt:${video.id}`,
            type: 'channel',
            name: video.title,
            poster: video.thumbnail,
            background: video.thumbnail,
            description: video.description,
            runtime: video.duration,
            year: video.publishedAt ? new Date(video.publishedAt).getFullYear() : undefined,
          },
        });
        return;
      }

      // Movie/Series meta
      if (type !== 'movie' && type !== 'series') {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const config = decodeConfig(configStr);
      const contentType = type === 'series' ? 'series' : 'movie';
      const meta = await getMeta(config, contentType, id);
      if (meta) {
        res.json({ meta });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (error) {
      console.error('Meta error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Stream handler - YouTube videos only (movies/series don't have streams from this addon)
  app.get('/:config/stream/:type/:id.json', async (req: Request, res: Response) => {
    try {
      const configStr = getParam(req.params, 'config');
      const type = getParam(req.params, 'type');
      const id = getParam(req.params, 'id');

      // Only YouTube has streams
      if (type !== 'channel' && !id.startsWith('yt:')) {
        res.json({ streams: [] });
        return;
      }

      const videoId = id.replace('yt:', '');

      // Track watch for the user's channels
      // Note: In a full implementation, you'd track which specific channel is being used
      const userId = extractUserId(configStr);
      const channels = ytChannelRepo.ensureDefaultChannels(userId);

      // Try to get video details for history tracking
      try {
        const details = await youtubeService.getVideoDetails(videoId);
        if (details.length > 0) {
          const video = details[0];
          // Add to first channel's history (simplified - could be improved with session tracking)
          ytHistoryRepo.addToHistory(channels[0].id, {
            video_id: videoId,
            title: video.title,
            channel_name: video.channelTitle,
            thumbnail: video.thumbnail,
            duration: video.duration,
          });
        }
      } catch {
        // Ignore tracking errors
      }

      res.json({
        streams: [
          {
            title: 'YouTube',
            ytId: videoId,
          },
        ],
      });
    } catch (error) {
      console.error('Stream error:', error);
      res.json({ streams: [] });
    }
  });

  // ==================== YouTube Channel API Endpoints ====================

  // Get user's YouTube channels
  app.get('/api/youtube/channels/:userId', (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const channels = ytChannelRepo.ensureDefaultChannels(userId);
    res.json({ channels });
  });

  // Get channel history
  app.get('/api/youtube/channels/:channelId/history', (req: Request, res: Response) => {
    const channelId = req.params.channelId as string;
    const history = ytHistoryRepo.getHistory(channelId, 100);
    res.json({ history });
  });

  // Add to channel history
  app.post('/api/youtube/channels/:channelId/history', (req: Request, res: Response) => {
    const channelId = req.params.channelId as string;
    const video = req.body as VideoRecord;

    if (!video.video_id || !video.title) {
      res.status(400).json({ error: 'video_id and title required' });
      return;
    }

    ytHistoryRepo.addToHistory(channelId, video);
    res.json({ success: true });
  });

  // Clear channel history
  app.delete('/api/youtube/channels/:channelId/history', (req: Request, res: Response) => {
    const channelId = req.params.channelId as string;
    ytHistoryRepo.clearHistory(channelId);
    // Also clear recommendations since they're based on history
    ytRecsRepo.clearRecommendations(channelId);
    res.json({ success: true });
  });

  return app;
}
