/**
 * PerplexityService Unit Tests
 * 
 * Tests for the Perplexity API integration service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerplexityService, TextGenerationRequest, WebSearchRequest } from './perplexity.service';

describe('PerplexityService', () => {
  let service: PerplexityService;

  beforeEach(() => {
    // Create service with test API key
    service = new PerplexityService('test-api-key');
  });

  describe('isConfigured', () => {
    it('should return true when API key is provided', () => {
      expect(service.isConfigured).toBe(true);
    });

    it('should return false when API key is empty AND no env var', () => {
      const savedKey = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;

      const emptyService = new PerplexityService('');
      expect(emptyService.isConfigured).toBe(false);

      if (savedKey) process.env.PERPLEXITY_API_KEY = savedKey;
    });

    it('should return false when API key is undefined AND no env var', () => {
      const savedKey = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;

      const undefinedService = new PerplexityService(undefined);
      expect(undefinedService.isConfigured).toBe(false);

      if (savedKey) process.env.PERPLEXITY_API_KEY = savedKey;
    });
  });

  describe('generateText', () => {
    it('should throw error when not configured', async () => {
      const unconfiguredService = new PerplexityService('');
      
      // When API key is empty/unconfigured, the service should throw an auth-related error
      await expect(
        unconfiguredService.generateText({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should have correct method signature', () => {
      expect(typeof service.generateText).toBe('function');
      expect(service.generateText.length).toBe(1);
    });
  });

  describe('searchWeb', () => {
    it('should throw error when not configured', async () => {
      const unconfiguredService = new PerplexityService('');
      
      // When API key is empty/unconfigured, the service should throw an auth-related error
      await expect(
        unconfiguredService.searchWeb({ query: 'test' })
      ).rejects.toThrow();
    });

    it('should have correct method signature', () => {
      expect(typeof service.searchWeb).toBe('function');
      expect(service.searchWeb.length).toBe(1);
    });
  });

  describe('Interface Compliance', () => {
    it('should implement IPerplexityProvider interface', () => {
      expect(service).toHaveProperty('generateText');
      expect(service).toHaveProperty('searchWeb');
      expect(service).toHaveProperty('isConfigured');
    });

    it('should have all required methods and properties', () => {
      const requiredMethods = ['generateText', 'searchWeb'];
      
      requiredMethods.forEach(method => {
        expect(service).toHaveProperty(method);
        expect(typeof (service as any)[method]).toBe('function');
      });

      // isConfigured is a getter property (boolean), not a method
      expect(typeof service.isConfigured).toBe('boolean');
    });
  });
});
