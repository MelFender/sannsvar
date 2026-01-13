import type { UserConfig } from '../types.js';

/**
 * Decodes a Base64 URL-encoded config string into a UserConfig object
 */
export function decodeConfig(encoded: string): UserConfig {
  try {
    // Handle URL-safe Base64 (replace - with + and _ with /)
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    const config = JSON.parse(json) as unknown;

    if (!isValidConfig(config)) {
      throw new Error('Invalid config structure');
    }

    return config;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to decode config: ${message}`);
  }
}

/**
 * Encodes a UserConfig object into a Base64 URL-safe string
 */
export function encodeConfig(config: UserConfig): string {
  const json = JSON.stringify(config);
  const base64 = Buffer.from(json, 'utf-8').toString('base64');
  // Make URL-safe (replace + with - and / with _)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Type guard to validate config structure
 */
function isValidConfig(obj: unknown): obj is UserConfig {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const config = obj as Record<string, unknown>;

  return (
    typeof config.geminiApiKey === 'string' &&
    typeof config.temperature === 'number' &&
    typeof config.traktAccessToken === 'string' &&
    typeof config.traktRefreshToken === 'string' &&
    config.temperature >= 0 &&
    config.temperature <= 2
  );
}

/**
 * Extracts a unique user ID from the config for caching purposes
 * Uses a hash of the Trakt access token to avoid storing the actual token
 */
export function extractUserId(config: UserConfig): string {
  // Simple hash function - uses first 16 chars of token as identifier
  // This is enough for cache keying without exposing the full token
  return config.traktAccessToken.slice(0, 16);
}
