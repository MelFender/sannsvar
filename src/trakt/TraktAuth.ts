/**
 * Trakt.tv OAuth Authentication
 *
 * Implements the device code flow for Trakt.tv OAuth.
 * This flow is ideal for Stremio addons as it doesn't require redirect URLs.
 */

import type { TraktDeviceCode, TraktToken, TraktError } from './types.js';

const TRAKT_API_URL = 'https://api.trakt.tv';
const TRAKT_API_VERSION = '2';

/**
 * Error thrown when Trakt authentication fails
 */
export class TraktAuthError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'TraktAuthError';
  }
}

/**
 * Get Trakt API headers
 */
function getHeaders(clientId: string, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-key': clientId,
    'trakt-api-version': TRAKT_API_VERSION,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return headers;
}

/**
 * Request a device code for OAuth
 *
 * This starts the device code flow. The user must visit the verification_url
 * and enter the user_code to authorize the application.
 */
export async function requestDeviceCode(clientId: string): Promise<TraktDeviceCode> {
  const response = await fetch(`${TRAKT_API_URL}/oauth/device/code`, {
    method: 'POST',
    headers: getHeaders(clientId),
    body: JSON.stringify({ client_id: clientId }),
  });

  if (!response.ok) {
    const error = (await response.json()) as TraktError;
    throw new TraktAuthError(
      error.error_description ?? error.error ?? 'Failed to request device code',
      error.error
    );
  }

  return (await response.json()) as TraktDeviceCode;
}

/**
 * Poll for device authorization token
 *
 * After requesting a device code, poll this endpoint until the user authorizes
 * or the code expires.
 *
 * @returns Token if authorized, null if pending, throws on error
 */
export async function pollForToken(
  clientId: string,
  clientSecret: string,
  deviceCode: string
): Promise<TraktToken | null> {
  const response = await fetch(`${TRAKT_API_URL}/oauth/device/token`, {
    method: 'POST',
    headers: getHeaders(clientId),
    body: JSON.stringify({
      code: deviceCode,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  // 400 = pending authorization (user hasn't entered code yet)
  if (response.status === 400) {
    const error = (await response.json()) as TraktError;
    if (error.error === 'authorization_pending') {
      return null; // Still waiting for user
    }
    throw new TraktAuthError(
      error.error_description ?? error.error ?? 'Authorization failed',
      error.error
    );
  }

  // 404 = invalid device code
  if (response.status === 404) {
    throw new TraktAuthError('Invalid device code', 'invalid_code');
  }

  // 409 = code already used
  if (response.status === 409) {
    throw new TraktAuthError('Device code already used', 'code_used');
  }

  // 410 = code expired
  if (response.status === 410) {
    throw new TraktAuthError('Device code expired', 'code_expired');
  }

  // 418 = user denied access
  if (response.status === 418) {
    throw new TraktAuthError('User denied access', 'access_denied');
  }

  // 429 = polling too fast
  if (response.status === 429) {
    throw new TraktAuthError('Polling too fast, slow down', 'slow_down');
  }

  if (!response.ok) {
    throw new TraktAuthError(`Unexpected error: ${response.status}`, 'unknown');
  }

  return (await response.json()) as TraktToken;
}

/**
 * Refresh an expired access token
 */
export async function refreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<TraktToken> {
  const response = await fetch(`${TRAKT_API_URL}/oauth/token`, {
    method: 'POST',
    headers: getHeaders(clientId),
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as TraktError;
    throw new TraktAuthError(
      error.error_description ?? error.error ?? 'Failed to refresh token',
      error.error
    );
  }

  return (await response.json()) as TraktToken;
}

/**
 * Check if a token is expired or about to expire
 *
 * @param token - The token to check
 * @param bufferSeconds - Consider expired if within this many seconds of expiration
 */
export function isTokenExpired(token: TraktToken, bufferSeconds = 300): boolean {
  const expiresAt = token.created_at + token.expires_in;
  const now = Math.floor(Date.now() / 1000);
  return now >= expiresAt - bufferSeconds;
}

/**
 * Revoke an access token
 */
export async function revokeToken(
  clientId: string,
  clientSecret: string,
  accessToken: string
): Promise<void> {
  const response = await fetch(`${TRAKT_API_URL}/oauth/revoke`, {
    method: 'POST',
    headers: getHeaders(clientId),
    body: JSON.stringify({
      token: accessToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as TraktError;
    throw new TraktAuthError(
      error.error_description ?? error.error ?? 'Failed to revoke token',
      error.error
    );
  }
}
