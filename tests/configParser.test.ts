/**
 * Config Parser Tests
 */

import { describe, it, expect } from '@jest/globals';
import { encodeConfig, decodeConfig, extractUserId } from '../src/utils/configParser.js';
import type { UserConfig } from '../src/types.js';

describe('configParser', () => {
  const validConfig: UserConfig = {
    geminiApiKey: 'AIzaSyTest123',
    temperature: 0.7,
    traktAccessToken: 'trakt_access_token_abc123',
    traktRefreshToken: 'trakt_refresh_token_xyz789',
  };

  describe('encodeConfig', () => {
    it('should encode a valid config to URL-safe Base64', () => {
      const encoded = encodeConfig(validConfig);

      // Should be URL-safe (no +, /, or =)
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');

      // Should be decodable
      const decoded = decodeConfig(encoded);
      expect(decoded).toEqual(validConfig);
    });

    it('should produce consistent output', () => {
      const encoded1 = encodeConfig(validConfig);
      const encoded2 = encodeConfig(validConfig);
      expect(encoded1).toBe(encoded2);
    });
  });

  describe('decodeConfig', () => {
    it('should decode a valid encoded config', () => {
      const encoded = encodeConfig(validConfig);
      const decoded = decodeConfig(encoded);

      expect(decoded.geminiApiKey).toBe(validConfig.geminiApiKey);
      expect(decoded.temperature).toBe(validConfig.temperature);
      expect(decoded.traktAccessToken).toBe(validConfig.traktAccessToken);
      expect(decoded.traktRefreshToken).toBe(validConfig.traktRefreshToken);
    });

    it('should handle URL-safe Base64 characters', () => {
      // Create a config that when encoded might have + or /
      const config: UserConfig = {
        geminiApiKey: 'test+key/with=special',
        temperature: 0.5,
        traktAccessToken: 'token+with/special=chars',
        traktRefreshToken: 'refresh+token/test=123',
      };

      const encoded = encodeConfig(config);
      const decoded = decodeConfig(encoded);

      expect(decoded).toEqual(config);
    });

    it('should throw on invalid Base64', () => {
      expect(() => decodeConfig('not-valid-base64!!!')).toThrow('Failed to decode config');
    });

    it('should throw on invalid JSON', () => {
      // Valid Base64 but not JSON
      const notJson = Buffer.from('not json at all').toString('base64');
      expect(() => decodeConfig(notJson)).toThrow('Failed to decode config');
    });

    it('should throw on missing required fields', () => {
      const incomplete = Buffer.from(JSON.stringify({ geminiApiKey: 'test' })).toString('base64');
      expect(() => decodeConfig(incomplete)).toThrow('Invalid config structure');
    });

    it('should throw on invalid temperature range', () => {
      const invalidTemp = Buffer.from(
        JSON.stringify({
          geminiApiKey: 'test',
          temperature: 5, // Invalid: should be 0-2
          traktAccessToken: 'token',
          traktRefreshToken: 'refresh',
        })
      ).toString('base64');

      expect(() => decodeConfig(invalidTemp)).toThrow('Invalid config structure');
    });
  });

  describe('extractUserId', () => {
    it('should extract a consistent user ID from config', () => {
      const userId = extractUserId(validConfig);

      // Should be a string
      expect(typeof userId).toBe('string');

      // Should be consistent
      expect(extractUserId(validConfig)).toBe(userId);

      // Should be 16 characters (first 16 of token)
      expect(userId.length).toBe(16);
    });

    it('should produce different IDs for different tokens', () => {
      const config1 = { ...validConfig, traktAccessToken: 'token_aaaaaaaaaaaaaaaa' };
      const config2 = { ...validConfig, traktAccessToken: 'token_bbbbbbbbbbbbbbbb' };

      const id1 = extractUserId(config1);
      const id2 = extractUserId(config2);

      expect(id1).not.toBe(id2);
    });
  });
});
