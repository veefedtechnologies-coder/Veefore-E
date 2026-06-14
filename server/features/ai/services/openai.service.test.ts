/**
 * OpenAI Service Unit Tests
 * 
 * Tests for OpenAIService implementation including text generation,
 * image generation, content analysis, rate limiting, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIService, OpenAIModel, OpenAIImageModel } from './openai.service';
import {
  AIProviderError,
  AIProviderRateLimitError,
  AIProviderAuthError,
  AIProviderSafetyError,
} from '../types/ai-provider.types';

// Mock OpenAI SDK
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  const mockGenerate = vi.fn();
  
  return {
    default: class MockOpenAI {
      constructor() {
        this.chat = {
          completions: {
            create: mockCreate,
          },
        };
        this.images = {
          generate: mockGenerate,
        };
      }
      chat: any;
      images: any;
    },
    mockCreate,
    mockGenerate,
  };
});

describe('OpenAIService', () => {
  let service: OpenAIService;
  let mockCreate: any;
  let mockGenerate: any;

  beforeEach(async () => {
    // Reset environment variables
    process.env.OPENAI_API_KEY = 'test-api-key';
    
    // Clear all mocks
    vi.clearAllMocks();
    
    // Get mock functions by importing the mocked module
    const openaiModule = await import('openai');
    mockCreate = (openaiModule as any).mockCreate;
    mockGenerate = (openaiModule as any).mockGenerate;
    
    // Create service instance
    service = new OpenAIService({
      apiKey: 'test-api-key',
      defaultModel: OpenAIModel.GPT_4O,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration and Health', () => {
    it('should initialize with configuration', () => {
      expect(service.name).toBe('OpenAI');
      expect(service.isConfigured).toBe(true);
    });

    it('should detect missing API key', () => {
      // Temporarily clear env var
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      
      const unconfiguredService = new OpenAIService({ apiKey: '' });
      expect(unconfiguredService.isConfigured).toBe(false);
      
      // Restore env var
      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should perform health check successfully', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Hello!' } }],
      });

      const isHealthy = await service.checkHealth();
      expect(isHealthy).toBe(true);
    });

    it('should return false on health check failure', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API error'));

      const isHealthy = await service.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Text Generation', () => {
    it('should generate text successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Generated text response' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await service.generateText({
        prompt: 'Test prompt',
        systemContext: 'You are a helpful assistant',
      });

      expect(result.text).toBe('Generated text response');
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });

    it('should handle text generation with config', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await service.generateText({
        prompt: 'Test prompt',
        config: {
          temperature: 0.9,
          maxTokens: 100,
          topP: 0.95,
          frequencyPenalty: 0.5,
          presencePenalty: 0.5,
          stopSequences: ['END'],
        },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.9,
          max_tokens: 100,
          top_p: 0.95,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
          stop: ['END'],
        })
      );
    });

    it('should throw AIProviderAuthError on authentication failure', async () => {
      mockCreate.mockRejectedValueOnce({
        status: 401,
        code: 'invalid_api_key',
        message: 'Invalid API key',
      });

      await expect(
        service.generateText({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderAuthError);
    });

    it('should throw AIProviderRateLimitError on rate limit', async () => {
      // Mock all retry attempts to fail with 429
      mockCreate
        .mockRejectedValueOnce({
          status: 429,
          message: 'Rate limit exceeded',
          headers: { 'retry-after': '60' },
        })
        .mockRejectedValueOnce({
          status: 429,
          message: 'Rate limit exceeded',
          headers: { 'retry-after': '60' },
        })
        .mockRejectedValueOnce({
          status: 429,
          message: 'Rate limit exceeded',
          headers: { 'retry-after': '60' },
        });

      await expect(
        service.generateText({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderRateLimitError);
    });

    it('should throw AIProviderSafetyError on content policy violation', async () => {
      mockCreate.mockRejectedValueOnce({
        status: 400,
        message: 'Your request was rejected due to content_policy',
      });

      await expect(
        service.generateText({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderSafetyError);
    });
  });

  describe('Image Generation', () => {
    it('should generate image successfully with DALL-E 3', async () => {
      const mockResponse = {
        data: [
          {
            url: 'https://example.com/image.png',
            revised_prompt: 'Enhanced prompt',
          },
        ],
      };

      mockGenerate.mockResolvedValueOnce(mockResponse);

      const result = await service.generateImage({
        prompt: 'A beautiful sunset',
        size: '1024x1024',
        quality: 'hd',
        style: 'vivid',
      });

      expect(result.imageUrl).toBe('https://example.com/image.png');
      expect(result.revisedPrompt).toBe('Enhanced prompt');
      expect(result.format).toBe('url');
    });

    it('should handle image generation with default parameters', async () => {
      mockGenerate.mockResolvedValueOnce({
        data: [{ url: 'https://example.com/image.png' }],
      });

      await service.generateImage({
        prompt: 'Test image',
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: OpenAIImageModel.DALL_E_3,
          prompt: 'Test image',
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        })
      );
    });

    it('should throw error when no image URL returned', async () => {
      mockGenerate.mockResolvedValueOnce({
        data: [{}], // No URL
      });

      await expect(
        service.generateImage({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderError);
    });

    it('should handle rate limiting for image generation', async () => {
      // Mock all retry attempts to fail with 429
      mockGenerate
        .mockRejectedValueOnce({
          status: 429,
          message: 'Rate limit exceeded',
        })
        .mockRejectedValueOnce({
          status: 429,
          message: 'Rate limit exceeded',
        })
        .mockRejectedValueOnce({
          status: 429,
          message: 'Rate limit exceeded',
        });

      await expect(
        service.generateImage({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderRateLimitError);
    });
  });

  describe('Content Analysis', () => {
    it('should analyze sentiment successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentiment: {
                  score: 0.8,
                  magnitude: 0.9,
                  label: 'positive',
                },
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await service.analyzeContent({
        content: 'I love this product!',
        analysisType: 'sentiment',
      });

      expect(result.sentiment).toEqual({
        score: 0.8,
        magnitude: 0.9,
        label: 'positive',
      });
    });

    it('should extract topics successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                topics: ['AI', 'Machine Learning', 'Technology'],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await service.analyzeContent({
        content: 'Article about AI and ML',
        analysisType: 'topics',
      });

      expect(result.topics).toEqual(['AI', 'Machine Learning', 'Technology']);
    });

    it('should extract entities successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                entities: [
                  { name: 'OpenAI', type: 'ORGANIZATION', salience: 0.9 },
                  { name: 'GPT-4', type: 'PRODUCT', salience: 0.8 },
                ],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await service.analyzeContent({
        content: 'OpenAI released GPT-4',
        analysisType: 'entities',
      });

      expect(result.entities).toHaveLength(2);
      expect(result.entities?.[0].name).toBe('OpenAI');
    });

    it('should perform safety analysis', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                safety: {
                  isSafe: true,
                  categories: [
                    { category: 'HATE_SPEECH', severity: 'NONE' },
                    { category: 'HARASSMENT', severity: 'NONE' },
                  ],
                },
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await service.analyzeContent({
        content: 'Safe content',
        analysisType: 'safety',
      });

      expect(result.safety?.isSafe).toBe(true);
      expect(result.safety?.categories).toHaveLength(2);
    });

    it('should perform comprehensive analysis', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentiment: { score: 0.5, magnitude: 0.6, label: 'neutral' },
                topics: ['Business', 'Technology'],
                entities: [{ name: 'Company', type: 'ORGANIZATION', salience: 0.7 }],
                safety: { isSafe: true, categories: [] },
                summary: 'Business article about technology',
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await service.analyzeContent({
        content: 'Article content',
        analysisType: 'comprehensive',
      });

      expect(result.sentiment).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.safety).toBeDefined();
      expect(result.summary).toBe('Business article about technology');
    });
  });

  describe('Caption Analysis', () => {
    it('should analyze caption successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentiment: 'positive',
                readability: 'easy',
                engagementPotential: 'high',
                suggestions: ['Add emojis', 'Include hashtags', 'Ask a question'],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await service.analyzeCaption('Great product! 🚀');

      expect(result.sentiment).toBe('positive');
      expect(result.readability).toBe('easy');
      expect(result.engagementPotential).toBe('high');
      expect(result.suggestions).toHaveLength(3);
    });

    it('should handle caption analysis errors', async () => {
      mockCreate.mockRejectedValueOnce({
        status: 500,
        message: 'Server error',
      });

      await expect(
        service.analyzeCaption('Test caption')
      ).rejects.toThrow(AIProviderError);
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry on server errors', async () => {
      // First two calls fail with 500, third succeeds
      mockCreate
        .mockRejectedValueOnce({ status: 500, message: 'Server error' })
        .mockRejectedValueOnce({ status: 503, message: 'Service unavailable' })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
        });

      const result = await service.generateText({ prompt: 'Test' });
      expect(result.text).toBe('Success');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication errors', async () => {
      mockCreate.mockRejectedValueOnce({
        status: 401,
        code: 'invalid_api_key',
        message: 'Invalid API key',
      });

      await expect(
        service.generateText({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderAuthError);

      // Should only be called once (no retries)
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should not retry on safety errors', async () => {
      mockCreate.mockRejectedValueOnce({
        status: 400,
        message: 'Content violates content_policy',
      });

      await expect(
        service.generateText({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderSafetyError);

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should handle generic errors', async () => {
      mockCreate.mockRejectedValueOnce({
        status: 400,
        message: 'Bad request',
      });

      await expect(
        service.generateText({ prompt: 'Test' })
      ).rejects.toThrow(AIProviderError);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to requests', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      const start = Date.now();
      
      // Make multiple requests that should be rate limited
      await Promise.all([
        service.generateText({ prompt: 'Test 1' }),
        service.generateText({ prompt: 'Test 2' }),
        service.generateText({ prompt: 'Test 3' }),
      ]);

      const duration = Date.now() - start;
      
      // Should have been called 3 times
      expect(mockCreate).toHaveBeenCalledTimes(3);
      
      // Duration should be minimal since we have 10 tokens initially
      expect(duration).toBeLessThan(1000);
    });
  });
});
