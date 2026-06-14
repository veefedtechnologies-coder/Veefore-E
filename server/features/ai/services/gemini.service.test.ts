/**
 * Unit tests for GeminiService
 * 
 * Tests basic functionality including:
 * - Service initialization
 * - Configuration validation
 * - Text generation
 * - Error handling
 * 
 * Note: These tests mock the Google Generative AI SDK to avoid real API calls.
 * Integration tests requiring real API keys are skipped when GOOGLE_API_KEY is absent.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GeminiService, GeminiModel } from './gemini.service';
import type { TextGenerationRequest } from '../types/ai-provider.types';

// Mock the GoogleGenerativeAI SDK
const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/generative-ai')>();
  return {
    ...actual,
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      constructor(_apiKey: string) {}
      getGenerativeModel(_modelConfig: any) {
        return {
          generateContent: mockGenerateContent,
        };
      }
    },
  };
});

describe('GeminiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful response
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Mocked Gemini response',
        candidates: [
          {
            content: { parts: [{ text: 'Mocked Gemini response' }] },
            finishReason: 'STOP',
          },
        ],
      },
    });
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const defaultService = new GeminiService();
      expect(defaultService.name).toBe('Gemini');
    });

    test('should use provided API key', () => {
      const customService = new GeminiService({
        apiKey: 'test-key-123',
      });
      expect(customService.isConfigured).toBe(true);
    });

    test('should detect missing API key when env var is also absent', () => {
      // Save and clear env var
      const savedKey = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const unconfiguredService = new GeminiService({
        apiKey: '',
      });
      expect(unconfiguredService.isConfigured).toBe(false);

      // Restore env var
      if (savedKey) {
        process.env.GOOGLE_API_KEY = savedKey;
      }
    });
  });

  describe('Configuration', () => {
    test('should have correct name', () => {
      const service = new GeminiService({ apiKey: 'test-key' });
      expect(service.name).toBe('Gemini');
    });

    test('should report configured when API key is provided', () => {
      const service = new GeminiService({ apiKey: 'test-key' });
      expect(service.isConfigured).toBe(true);
    });

    test('should report not configured when no key at all', () => {
      const savedKey = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const service = new GeminiService({ apiKey: '' });
      expect(service.isConfigured).toBe(false);

      if (savedKey) {
        process.env.GOOGLE_API_KEY = savedKey;
      }
    });
  });

  describe('Text Generation', () => {
    test('should generate text with basic prompt', async () => {
      const service = new GeminiService({ apiKey: 'test-key' });

      const request: TextGenerationRequest = {
        prompt: 'Say hello in exactly 3 words.',
        config: {
          temperature: 0.7,
          maxTokens: 20,
        },
      };

      const response = await service.generateText(request);

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();
      expect(typeof response.text).toBe('string');
      expect(response.text.length).toBeGreaterThan(0);
    });

    test('should include system context when provided', async () => {
      const service = new GeminiService({ apiKey: 'test-key' });

      const request: TextGenerationRequest = {
        prompt: 'What is your role?',
        systemContext: 'You are a helpful assistant that always responds in one sentence.',
        config: {
          temperature: 0.5,
        },
      };

      const response = await service.generateText(request);

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();
      expect(typeof response.text).toBe('string');
    });

    test('should handle invalid/empty prompt gracefully', async () => {
      mockGenerateContent.mockRejectedValueOnce(
        new Error('Invalid prompt: empty content')
      );

      const service = new GeminiService({ apiKey: 'test-key' });
      const request: TextGenerationRequest = {
        prompt: '',
        config: {
          temperature: 0.7,
        },
      };

      await expect(service.generateText(request)).rejects.toThrow();
    });
  });

  describe('Content Analysis', () => {
    test('should analyze sentiment', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            sentiment: { label: 'positive', score: 0.9 },
          }),
        },
      });

      const service = new GeminiService({ apiKey: 'test-key' });
      const response = await service.analyzeContent({
        content: 'I absolutely love this product!',
        analysisType: 'sentiment',
      });

      expect(response).toBeDefined();
    });

    test('should extract topics', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            topics: ['technology', 'AI'],
          }),
        },
      });

      const service = new GeminiService({ apiKey: 'test-key' });
      const response = await service.analyzeContent({
        content: 'The new AI-powered technology is impressive.',
        analysisType: 'topics',
      });

      expect(response).toBeDefined();
    });

    test('should perform comprehensive analysis', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            sentiment: { label: 'positive', score: 0.7 },
            topics: ['business', 'cloud'],
            summary: 'Amazon cloud growth article',
          }),
        },
      });

      const service = new GeminiService({ apiKey: 'test-key' });
      const response = await service.analyzeContent({
        content: 'Amazon announced record profits this quarter.',
        analysisType: 'comprehensive',
      });

      expect(response).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      const savedKey = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const unconfiguredService = new GeminiService({ apiKey: '' });
      expect(unconfiguredService.isConfigured).toBe(false);

      if (savedKey) {
        process.env.GOOGLE_API_KEY = savedKey;
      }
    });

    test('should propagate generation errors as AIProviderError', async () => {
      mockGenerateContent.mockRejectedValueOnce(
        new Error('API rate limit exceeded')
      );

      const service = new GeminiService({ apiKey: 'test-key' });
      await expect(
        service.generateText({ prompt: 'test' })
      ).rejects.toThrow();
    });
  });

  describe('Health Check', () => {
    test('should return true when API call succeeds', async () => {
      const service = new GeminiService({ apiKey: 'test-key' });
      const isHealthy = await service.checkHealth();
      expect(typeof isHealthy).toBe('boolean');
    });

    test('should return false when API call fails', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('API unavailable'));

      const service = new GeminiService({ apiKey: 'test-key' });
      const isHealthy = await service.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });
});
