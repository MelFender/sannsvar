/**
 * Claude OAuth Service
 *
 * Handles OAuth 2.0 authentication for Anthropic Claude.
 * Uses the user's Claude Pro/Max subscription for API access.
 *
 * WARNING: Anthropic has implemented restrictions on third-party OAuth usage.
 * This may not work reliably. Falls back gracefully if blocked.
 */

// Anthropic OAuth endpoints (from Claude Code)
const ANTHROPIC_AUTH_URL = 'https://console.anthropic.com/oauth/authorize';
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';

// OAuth client ID (from Claude Code - this is a public identifier)
const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

// Required beta header for OAuth
const ANTHROPIC_BETA_HEADER = 'oauth-2025-04-20';

export interface ClaudeOAuthConfig {
  redirectUri: string;
}

export interface ClaudeTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
}

/**
 * Generate PKCE code verifier and challenge
 */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  // Generate random verifier (43-128 characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = Buffer.from(array).toString('base64url');

  // Generate SHA-256 challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const challenge = Buffer.from(hashBuffer).toString('base64url');

  return { verifier, challenge };
}

// Store PKCE verifiers temporarily
const pkceStore = new Map<string, string>();

/**
 * Generate the Claude OAuth authorization URL
 */
export async function getClaudeAuthUrl(
  config: ClaudeOAuthConfig,
  state?: string
): Promise<{ url: string; verifier: string }> {
  const { verifier, challenge } = await generatePKCE();
  const stateValue = state || crypto.randomUUID();

  // Store verifier for later use
  pkceStore.set(stateValue, verifier);

  const params = new URLSearchParams({
    client_id: ANTHROPIC_CLIENT_ID,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'user:inference',
    state: stateValue,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${ANTHROPIC_AUTH_URL}?${params.toString()}`,
    verifier,
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeClaudeCodeForTokens(
  config: ClaudeOAuthConfig,
  code: string,
  state: string
): Promise<ClaudeTokens> {
  const verifier = pkceStore.get(state);
  if (!verifier) {
    throw new Error('Invalid state - PKCE verifier not found');
  }

  // Clean up stored verifier
  pkceStore.delete(state);

  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-beta': ANTHROPIC_BETA_HEADER,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ANTHROPIC_CLIENT_ID,
      code,
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
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Refresh an expired access token
 */
export async function refreshClaudeAccessToken(
  refreshToken: string
): Promise<ClaudeTokens> {
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-beta': ANTHROPIC_BETA_HEADER,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: ANTHROPIC_CLIENT_ID,
      refresh_token: refreshToken,
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
