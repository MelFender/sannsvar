/**
 * TraktService Tests
 *
 * Tests Trakt service functionality and data transformation.
 * Note: Full integration tests require real Trakt credentials.
 */

import { describe, it, expect } from '@jest/globals';
import { TraktService, TraktServiceError } from '../src/trakt/TraktService.js';

describe('TraktService', () => {
  describe('constructor', () => {
    it('should create service with credentials', () => {
      const service = new TraktService({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });

      expect(service).toBeInstanceOf(TraktService);
    });
  });

  describe('TraktServiceError', () => {
    it('should create error with message', () => {
      const error = new TraktServiceError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('TraktServiceError');
    });

    it('should create error with status code', () => {
      const error = new TraktServiceError('Unauthorized', 401);
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
    });
  });
});

describe('TraktAuth', () => {
  // Import the auth functions
  const { isTokenExpired } = require('../src/trakt/TraktAuth.js');

  describe('isTokenExpired', () => {
    it('should return false for fresh token', () => {
      const token = {
        access_token: 'test',
        token_type: 'Bearer',
        expires_in: 7776000, // 90 days
        refresh_token: 'refresh',
        scope: 'public',
        created_at: Math.floor(Date.now() / 1000), // Now
      };

      expect(isTokenExpired(token)).toBe(false);
    });

    it('should return true for expired token', () => {
      const token = {
        access_token: 'test',
        token_type: 'Bearer',
        expires_in: 7776000,
        refresh_token: 'refresh',
        scope: 'public',
        created_at: Math.floor(Date.now() / 1000) - 8000000, // Way in the past
      };

      expect(isTokenExpired(token)).toBe(true);
    });

    it('should return true for token expiring within buffer', () => {
      const token = {
        access_token: 'test',
        token_type: 'Bearer',
        expires_in: 100, // Expires in 100 seconds
        refresh_token: 'refresh',
        scope: 'public',
        created_at: Math.floor(Date.now() / 1000),
      };

      // With 300 second buffer, should be considered expired
      expect(isTokenExpired(token, 300)).toBe(true);
    });
  });
});
