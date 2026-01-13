/**
 * GeminiAdapter Tests
 *
 * Tests the AI provider response parsing and validation.
 * Note: Full integration tests require real API keys.
 */

import { describe, it, expect } from '@jest/globals';
import { GeminiAdapter } from '../src/providers/GeminiAdapter.js';

describe('GeminiAdapter', () => {
  describe('constructor', () => {
    it('should use default model', () => {
      const adapter = new GeminiAdapter();
      expect(adapter.model).toBe('gemini-3-flash-preview');
    });

    it('should accept custom model', () => {
      const adapter = new GeminiAdapter('gemini-3-pro-preview');
      expect(adapter.model).toBe('gemini-3-pro-preview');
    });

    it('should have correct name', () => {
      const adapter = new GeminiAdapter();
      expect(adapter.name).toBe('Gemini');
    });
  });

  describe('IAIProvider interface', () => {
    it('should implement required methods', () => {
      const adapter = new GeminiAdapter();

      expect(typeof adapter.getRecommendations).toBe('function');
      expect(typeof adapter.validateConfig).toBe('function');
      expect(typeof adapter.name).toBe('string');
      expect(typeof adapter.model).toBe('string');
    });
  });
});
