/**
 * Google OAuth Service
 *
 * Handles OAuth 2.0 authentication for Google Gemini API.
 * Uses the user's Google account (with Gemini Advanced/AI Pro subscription)
 * to access the Generative Language API without pay-per-use charges.
 */

// Google OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Scopes for Gemini AI + YouTube Data API (unified access)
const GOOGLE_SCOPES = [
  // Gemini AI scopes
  'https://www.googleapis.com/auth/generative-language.retriever',
  'https://www.googleapis.com/auth/generative-language.tuning',
  'https://www.googleapis.com/auth/cloud-platform',
  // YouTube Data API scopes
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  // User info
  'openid',
  'email',
  'profile',
].join(' ');

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  email?: string;
}

/**
 * Generate the Google OAuth authorization URL
 */
export function getGoogleAuthUrl(config: GoogleOAuthConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline', // Request refresh token
    prompt: 'consent', // Force consent to get refresh token
    ...(state && { state }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string
): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  // Decode email from ID token if present
  let email: string | undefined;
  if (data.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(data.id_token.split('.')[1], 'base64').toString()
      ) as { email?: string };
      email = payload.email;
    } catch {
      // Ignore decode errors
    }
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
    email,
  };
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string
): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken, // Refresh token stays the same
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Check if tokens need refresh (with 5 minute buffer)
 */
export function needsRefresh(tokens: GoogleTokens): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= tokens.expiresAt - bufferMs;
}

/**
 * Get valid access token, refreshing if needed
 */
export async function getValidAccessToken(
  config: GoogleOAuthConfig,
  tokens: GoogleTokens
): Promise<GoogleTokens> {
  if (!needsRefresh(tokens)) {
    return tokens;
  }

  if (!tokens.refreshToken) {
    throw new Error('No refresh token available');
  }

  return refreshAccessToken(config, tokens.refreshToken);
}
