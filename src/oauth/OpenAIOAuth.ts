/**
 * OpenAI OAuth Service
 *
 * Handles OAuth 2.0 authentication for OpenAI/ChatGPT.
 * Uses the user's ChatGPT Plus/Pro subscription for API access.
 *
 * Note: OpenAI's OAuth is designed for their Codex CLI.
 * This implementation attempts to use the same flow.
 */

// OpenAI OAuth endpoints (from Codex CLI)
const OPENAI_AUTH_URL = 'https://auth.openai.com/authorize';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';

// OAuth client ID (from Codex CLI - public client)
const OPENAI_CLIENT_ID = 'pdlLIX2Y72MIl2rhLhTE9VV9bN905kBh';

// Scopes for ChatGPT access
const OPENAI_SCOPES = 'openid profile email offline_access';

export interface OpenAIOAuthConfig {
  redirectUri: string;
}

export interface OpenAITokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { verifier: string; challenge: string } {
  // Generate random verifier
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = Buffer.from(array).toString('base64url');

  // For simplicity, using plain verifier as challenge
  // In production with S256, implement proper SHA-256 hashing
  const challenge = verifier;

  return { verifier, challenge };
}

// Store PKCE verifiers temporarily (in production, use secure storage)
const pkceStore = new Map<string, string>();

/**
 * Generate the OpenAI OAuth authorization URL
 */
export function getOpenAIAuthUrl(config: OpenAIOAuthConfig, state?: string): { url: string; verifier: string } {
  const { verifier, challenge } = generatePKCE();
  const stateValue = state || crypto.randomUUID();

  // Store verifier for later use
  pkceStore.set(stateValue, verifier);

  const params = new URLSearchParams({
    client_id: OPENAI_CLIENT_ID,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: OPENAI_SCOPES,
    state: stateValue,
    code_challenge: challenge,
    code_challenge_method: 'plain', // Use 'S256' in production with proper hashing
    prompt: 'consent',
  });

  return {
    url: `${OPENAI_AUTH_URL}?${params.toString()}`,
    verifier,
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeOpenAICodeForTokens(
  config: OpenAIOAuthConfig,
  code: string,
  state: string
): Promise<OpenAITokens> {
  const verifier = pkceStore.get(state);
  if (!verifier) {
    throw new Error('Invalid state - PKCE verifier not found');
  }

  // Clean up stored verifier
  pkceStore.delete(state);

  const response = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: OPENAI_CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
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
export async function refreshOpenAIAccessToken(
  refreshToken: string
): Promise<OpenAITokens> {
  const response = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: OPENAI_CLIENT_ID,
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
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
