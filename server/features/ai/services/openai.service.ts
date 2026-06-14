/**
 * OpenAI Service
 * 
 * Dedicated service for OpenAI API interactions.
 * Handles text generation, image generation (DALL-E), content analysis, and rate limiting.
 * 
 * Requirements: 12.1, 12.3, 12.5
 * Task: 16.2 Create OpenAIService
 */

import OpenAI from 'openai';
import {
  IAIProvider,
  TextGenerationRequest,
  TextGenerationResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
  AIGenerationConfig,
  AIProviderError,
  AIProviderRateLimitError,
  AIProviderAuthError,
  AIProviderSafetyError,
} from '../types/ai-provider.types';

/**
 * OpenAI service configuration
 */
export interface OpenAIConfig {
  apiKey?: string;
  defaultModel?: string;
  defaultImageModel?: string;
  organization?: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * OpenAI model names
 */
export enum OpenAIModel {
  GPT_4O = 'gpt-4o',
  GPT_4O_MINI = 'gpt-4o-mini',
  GPT_4_TURBO = 'gpt-4-turbo',
  GPT_4 = 'gpt-4',
  GPT_35_TURBO = 'gpt-3.5-turbo',
}

/**
 * OpenAI image generation models
 */
export enum OpenAIImageModel {
  DALL_E_3 = 'dall-e-3',
  DALL_E_2 = 'dall-e-2',
}

/**
 * Rate limiter for OpenAI API calls
 * Implements token bucket algorithm for rate limiting
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number = 10, refillRate: number = 1) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Attempt to consume a token
   * Returns true if successful, false if rate limit exceeded
   */
  async tryConsume(): Promise<boolean> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    return false;
  }

  /**
   * Wait until a token is available
   */
  async waitForToken(): Promise<void> {
    this.refill();
    
    while (this.tokens < 1) {
      const waitTime = (1 - this.tokens) / this.refillRate * 1000;
      await new Promise(resolve => setTimeout(resolve, Math.max(100, waitTime)));
      this.refill();
    }
    
    this.tokens -= 1;
  }
}

/**
 * OpenAIService implements the IAIProvider interface
 * Provides comprehensive OpenAI API integration with error handling,
 * rate limiting, retry logic, and DALL-E image generation
 */
export class OpenAIService implements IAIProvider {
  public readonly name = 'OpenAI';
  private client: OpenAI;
  private config: OpenAIConfig;
  private defaultModel: string;
  private defaultImageModel: string;
  private rateLimiter: RateLimiter;

  constructor(config?: OpenAIConfig) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.warn('[OpenAIService] No API key provided. Service will not be functional.');
    }

    this.config = {
      defaultModel: OpenAIModel.GPT_4O,
      defaultImageModel: OpenAIImageModel.DALL_E_3,
      maxRetries: 3,
      timeout: 60000, // 60 seconds
      ...config,
    };

    this.client = new OpenAI({
      apiKey: apiKey || '',
      organization: this.config.organization,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
    });

    this.defaultModel = this.config.defaultModel || OpenAIModel.GPT_4O;
    this.defaultImageModel = this.config.defaultImageModel || OpenAIImageModel.DALL_E_3;
    
    // Initialize rate limiter: 10 requests per second with 1 token/sec refill
    this.rateLimiter = new RateLimiter(10, 1);

    console.log('[OpenAIService] Initialized with model:', this.defaultModel);
  }

  /**
   * Check if OpenAI service is configured and available
   */
  public get isConfigured(): boolean {
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    return !!apiKey && apiKey.length > 0;
  }

  /**
   * Health check for OpenAI service
   */
  public async checkHealth(): Promise<boolean> {
    try {
      if (!this.isConfigured) {
        return false;
      }

      // Simple test generation to verify API key and connectivity
      const response = await this.client.chat.completions.create({
        model: OpenAIModel.GPT_35_TURBO,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });

      return !!response.choices[0]?.message?.content;
    } catch (error) {
      console.error('[OpenAIService] Health check failed:', error);
      return false;
    }
  }

  /**
   * Generate text using OpenAI
   * Supports GPT-4, GPT-4 Turbo, and GPT-3.5 Turbo models
   */
  public async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const { prompt, systemContext, config } = request;

    try {
      console.log('[OpenAIService] Generating text with model:', this.defaultModel);

      // Apply rate limiting
      await this.rateLimiter.waitForToken();

      // Build messages array
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (systemContext) {
        messages.push({
          role: 'system',
          content: systemContext,
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt,
      });

      // Build request options
      const options: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model: this.defaultModel,
        messages,
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens,
        top_p: config?.topP,
        frequency_penalty: config?.frequencyPenalty,
        presence_penalty: config?.presencePenalty,
        stop: config?.stopSequences,
      };

      // Make API call with retry logic
      const response = await this.retryWithBackoff(async () => {
        return await this.client.chat.completions.create(options);
      });

      const choice = response.choices[0];
      const text = choice?.message?.content || '';
      
      console.log('[OpenAIService] Text generated successfully:', {
        length: text.length,
        finishReason: choice?.finish_reason,
      });

      // Extract usage metadata
      const usage = response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined;

      return {
        text,
        finishReason: choice?.finish_reason,
        usage,
      };
    } catch (error: any) {
      return this.handleError(error, 'generateText');
    }
  }

  /**
   * Generate image using DALL-E
   * Supports DALL-E 3 and DALL-E 2 models
   */
  public async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const { prompt, size = '1024x1024', quality = 'standard', style, n = 1 } = request;

    try {
      console.log('[OpenAIService] Generating image with DALL-E:', this.defaultImageModel);

      // Apply rate limiting
      await this.rateLimiter.waitForToken();

      // Build request options
      const options: any = {
        model: this.defaultImageModel,
        prompt,
        n,
        size,
      };

      // DALL-E 3 specific options
      if (this.defaultImageModel === OpenAIImageModel.DALL_E_3) {
        options.quality = quality;
        if (style) {
          options.style = style; // 'vivid' or 'natural'
        }
      }

      // Make API call with retry logic
      const response = await this.retryWithBackoff(async () => {
        return await this.client.images.generate(options);
      });

      const image = response.data?.[0];
      
      if (!image?.url) {
        throw new AIProviderError(
          'No image URL returned from OpenAI',
          this.name,
          'NO_IMAGE_DATA'
        );
      }

      console.log('[OpenAIService] Image generated successfully');

      return {
        imageUrl: image.url,
        revisedPrompt: image.revised_prompt,
        format: 'url',
      };
    } catch (error: any) {
      return this.handleError(error, 'generateImage');
    }
  }

  /**
   * Analyze content using OpenAI
   * Uses GPT-4 for comprehensive content analysis including sentiment, topics, entities, and safety
   */
  public async analyzeContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResponse> {
    const { content, analysisType, context } = request;

    try {
      console.log('[OpenAIService] Analyzing content:', { 
        type: analysisType, 
        contentLength: content.length 
      });

      // Apply rate limiting
      await this.rateLimiter.waitForToken();

      let analysisPrompt = '';

      switch (analysisType) {
        case 'sentiment':
          analysisPrompt = this.buildSentimentAnalysisPrompt(content, context);
          break;
        case 'topics':
          analysisPrompt = this.buildTopicAnalysisPrompt(content, context);
          break;
        case 'entities':
          analysisPrompt = this.buildEntityAnalysisPrompt(content, context);
          break;
        case 'safety':
          analysisPrompt = this.buildSafetyAnalysisPrompt(content, context);
          break;
        case 'comprehensive':
          analysisPrompt = this.buildComprehensiveAnalysisPrompt(content, context);
          break;
      }

      // Use GPT-4 for analysis with JSON mode
      const response = await this.retryWithBackoff(async () => {
        return await this.client.chat.completions.create({
          model: this.defaultModel,
          messages: [
            {
              role: 'system',
              content: 'You are an expert content analyst. Provide analysis in valid JSON format.',
            },
            {
              role: 'user',
              content: analysisPrompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3, // Lower temperature for more consistent analysis
        });
      });

      const responseText = response.choices[0]?.message?.content || '{}';

      // Parse the structured response
      const analysis = this.parseAnalysisResponse(responseText, analysisType);

      console.log('[OpenAIService] Content analysis completed:', { type: analysisType });

      return analysis;
    } catch (error: any) {
      return this.handleError(error, 'analyzeContent');
    }
  }

  /**
   * Analyze caption for optimization
   * Specialized method for caption analysis (legacy compatibility)
   */
  public async analyzeCaption(caption: string): Promise<{
    sentiment: string;
    readability: string;
    engagementPotential: string;
    suggestions: string[];
  }> {
    try {
      console.log('[OpenAIService] Analyzing caption');

      const prompt = `Analyze the following social media caption and provide insights:

Caption: "${caption}"

Provide your analysis in the following JSON format:
{
  "sentiment": "positive/negative/neutral",
  "readability": "easy/moderate/difficult",
  "engagementPotential": "high/medium/low",
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"]
}`;

      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are a social media marketing expert. Analyze captions for effectiveness.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const responseText = response.choices[0]?.message?.content || '{}';
      const analysis = JSON.parse(responseText);

      console.log('[OpenAIService] Caption analysis completed');

      return {
        sentiment: analysis.sentiment || 'neutral',
        readability: analysis.readability || 'moderate',
        engagementPotential: analysis.engagementPotential || 'medium',
        suggestions: analysis.suggestions || [],
      };
    } catch (error: any) {
      console.error('[OpenAIService] Caption analysis failed:', error);
      throw this.handleError(error, 'analyzeCaption');
    }
  }

  /**
   * Retry mechanism with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on authentication errors
        if (error.status === 401 || error.code === 'invalid_api_key') {
          throw error;
        }
        
        // Don't retry on safety/content policy errors
        if (error.status === 400 && error.message?.includes('content_policy')) {
          throw error;
        }
        
        // Retry on rate limit and server errors
        if (error.status === 429 || error.status >= 500) {
          const delay = initialDelay * Math.pow(2, attempt);
          const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
          const waitTime = delay + jitter;
          
          console.log(`[OpenAIService] Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(waitTime)}ms`);
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // Don't retry on other errors
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * Build sentiment analysis prompt
   */
  private buildSentimentAnalysisPrompt(content: string, context?: string): string {
    return `Analyze the sentiment of the following ${context || 'content'}.
    
Content: ${content}

Provide your analysis in the following JSON format:
{
  "sentiment": {
    "score": <number between -1 and 1, where -1 is very negative, 0 is neutral, 1 is very positive>,
    "magnitude": <number representing the strength of the sentiment>,
    "label": "<positive|negative|neutral|mixed>"
  }
}`;
  }

  /**
   * Build topic analysis prompt
   */
  private buildTopicAnalysisPrompt(content: string, context?: string): string {
    return `Extract the main topics from the following ${context || 'content'}.

Content: ${content}

Provide your analysis in the following JSON format:
{
  "topics": ["topic1", "topic2", "topic3"]
}`;
  }

  /**
   * Build entity analysis prompt
   */
  private buildEntityAnalysisPrompt(content: string, context?: string): string {
    return `Extract named entities from the following ${context || 'content'}.

Content: ${content}

Provide your analysis in the following JSON format:
{
  "entities": [
    {
      "name": "entity name",
      "type": "PERSON|ORGANIZATION|LOCATION|EVENT|PRODUCT|OTHER",
      "salience": <number 0-1 representing importance>
    }
  ]
}`;
  }

  /**
   * Build safety analysis prompt
   */
  private buildSafetyAnalysisPrompt(content: string, context?: string): string {
    return `Analyze the safety and appropriateness of the following ${context || 'content'}.
Check for hate speech, harassment, explicit content, dangerous content, or spam.

Content: ${content}

Provide your analysis in the following JSON format:
{
  "safety": {
    "isSafe": <boolean>,
    "categories": [
      {
        "category": "HATE_SPEECH|HARASSMENT|EXPLICIT|DANGEROUS|SPAM",
        "severity": "NONE|LOW|MEDIUM|HIGH"
      }
    ]
  }
}`;
  }

  /**
   * Build comprehensive analysis prompt
   */
  private buildComprehensiveAnalysisPrompt(content: string, context?: string): string {
    return `Provide a comprehensive analysis of the following ${context || 'content'}.
Include sentiment, topics, key entities, safety assessment, and a brief summary.

Content: ${content}

Provide your analysis in the following JSON format:
{
  "sentiment": {
    "score": <number between -1 and 1>,
    "magnitude": <number>,
    "label": "<positive|negative|neutral|mixed>"
  },
  "topics": ["topic1", "topic2"],
  "entities": [
    {
      "name": "entity name",
      "type": "entity type",
      "salience": <number 0-1>
    }
  ],
  "safety": {
    "isSafe": <boolean>,
    "categories": [
      {
        "category": "category name",
        "severity": "severity level"
      }
    ]
  },
  "summary": "brief summary of the content"
}`;
  }

  /**
   * Parse analysis response from OpenAI
   */
  private parseAnalysisResponse(
    responseText: string,
    analysisType: string
  ): ContentAnalysisResponse {
    try {
      const parsed = JSON.parse(responseText);
      return parsed;
    } catch (error) {
      console.warn('[OpenAIService] Failed to parse analysis response:', error);
      return {
        summary: responseText,
      };
    }
  }

  /**
   * Handle errors and convert to appropriate error types
   */
  private handleError(error: any, operation: string): never {
    console.error(`[OpenAIService] Error in ${operation}:`, error);

    // Check for rate limit errors
    if (error.status === 429 || error.message?.includes('rate limit')) {
      const retryAfter = error.headers?.['retry-after'];
      throw new AIProviderRateLimitError(this.name, retryAfter);
    }

    // Check for authentication errors
    if (error.status === 401 || error.code === 'invalid_api_key') {
      throw new AIProviderAuthError(this.name);
    }

    // Check for safety/content policy errors
    if (error.status === 400 && error.message?.includes('content_policy')) {
      throw new AIProviderSafetyError(this.name, 'Content violates OpenAI usage policies');
    }

    // Generic error
    throw new AIProviderError(
      `${operation} failed: ${error.message}`,
      this.name,
      error.code || error.status?.toString(),
      error
    );
  }
}

/**
 * Export singleton instance
 */
export const openaiService = new OpenAIService();
