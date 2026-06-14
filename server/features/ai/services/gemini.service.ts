/**
 * Gemini AI Service
 * 
 * Dedicated service for Google Gemini API interactions.
 * Handles text generation, image generation, content analysis, and Gemini-specific features.
 * 
 * Requirements: 12.1, 12.3, 12.5
 * Task: 16.3 Create GeminiService
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel,
  SafetySetting,
} from '@google/generative-ai';
import type {
  IGeminiProvider,
  TextGenerationRequest,
  TextGenerationResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
  AIGenerationConfig,
} from '../types/ai-provider.types';
import {
  AIProviderError,
  AIProviderRateLimitError,
  AIProviderAuthError,
  AIProviderSafetyError,
} from '../types/ai-provider.types';

/**
 * Gemini model configurations
 */
export interface GeminiConfig {
  apiKey?: string;
  defaultModel?: string;
  safetyLevel?: 'off' | 'standard' | 'strict';
  enableVertexAI?: boolean;
  vertexAIEndpoint?: string;
}

/**
 * Gemini-specific model names
 */
export enum GeminiModel {
  FLASH_1_5 = 'gemini-1.5-flash',
  PRO_1_5 = 'gemini-1.5-pro',
  FLASH_2_0_EXP = 'gemini-2.0-flash-exp',
  PRO_2_5 = 'gemini-2.5-pro',
  FLASH_2_5 = 'gemini-2.5-flash',
}

/**
 * GeminiService implements the IGeminiProvider interface
 * Provides comprehensive Gemini API integration with error handling,
 * safety settings, and multimodal capabilities
 */
export class GeminiService implements IGeminiProvider {
  public readonly name = 'Gemini';
  private genAI: GoogleGenerativeAI;
  private config: GeminiConfig;
  private defaultModel: string;

  constructor(config?: GeminiConfig) {
    const apiKey = config?.apiKey || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.warn('[GeminiService] No API key provided. Service will not be functional.');
    }

    this.genAI = new GoogleGenerativeAI(apiKey || '');
    this.config = {
      defaultModel: GeminiModel.PRO_2_5,
      safetyLevel: 'standard',
      ...config,
    };
    this.defaultModel = this.config.defaultModel || GeminiModel.PRO_2_5;

    console.log('[GeminiService] Initialized with model:', this.defaultModel);
  }

  /**
   * Check if Gemini service is configured and available
   */
  public get isConfigured(): boolean {
    return !!this.config.apiKey || !!process.env.GOOGLE_API_KEY;
  }

  /**
   * Health check for Gemini service
   */
  public async checkHealth(): Promise<boolean> {
    try {
      if (!this.isConfigured) {
        return false;
      }

      // Simple test generation to verify API key and connectivity
      const model = this.genAI.getGenerativeModel({ model: GeminiModel.FLASH_1_5 });
      const result = await model.generateContent('Hello');
      return !!result.response.text();
    } catch (error) {
      console.error('[GeminiService] Health check failed:', error);
      return false;
    }
  }

  /**
   * Generate text using Gemini
   * Supports various models and safety configurations
   */
  public async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const { prompt, systemContext, config } = request;

    try {
      console.log('[GeminiService] Generating text with model:', this.defaultModel);

      // Build generation configuration
      const generationConfig = this.buildGenerationConfig(config);
      
      // Build safety settings
      const safetySettings = this.buildSafetySettings(this.config.safetyLevel);

      // Get model instance
      const model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
        generationConfig,
        safetySettings,
        systemInstruction: systemContext,
      });

      // Generate content
      const result = await model.generateContent(prompt);
      const response = result.response;
      
      // Check for safety blocks
      if (response.promptFeedback?.blockReason) {
        throw new AIProviderSafetyError(
          this.name,
          `Content blocked: ${response.promptFeedback.blockReason}`
        );
      }

      const text = response.text();
      
      console.log('[GeminiService] Text generated successfully:', {
        length: text.length,
        finishReason: response.candidates?.[0]?.finishReason,
      });

      // Extract usage metadata if available
      const usage = response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
      } : undefined;

      return {
        text,
        finishReason: response.candidates?.[0]?.finishReason,
        usage,
      };
    } catch (error: any) {
      return this.handleError(error, 'generateText');
    }
  }

  /**
   * Generate image using Gemini
   * Note: Gemini 2.0 Flash Experimental supports image generation
   */
  public async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const { prompt, quality = 'standard' } = request;

    try {
      console.log('[GeminiService] Generating image with Gemini 2.0 Flash Exp');

      // Use Gemini 2.0 Flash for image generation
      const model = this.genAI.getGenerativeModel({ 
        model: GeminiModel.FLASH_2_0_EXP 
      });

      // Build enhanced prompt for image generation
      const imagePrompt = this.buildImagePrompt(prompt, quality);

      const result = await model.generateContent(imagePrompt);
      const response = result.response;

      // Extract image data from response
      // Gemini returns images as inline data
      const parts = response.candidates?.[0]?.content?.parts || [];
      let imageData: string | undefined;
      let revisedPrompt: string | undefined;

      for (const part of parts) {
        if ('inlineData' in part && part.inlineData?.data) {
          imageData = part.inlineData.data;
        }
        if ('text' in part && part.text) {
          revisedPrompt = part.text;
        }
      }

      if (!imageData) {
        throw new AIProviderError(
          'No image data returned from Gemini',
          this.name,
          'NO_IMAGE_DATA'
        );
      }

      console.log('[GeminiService] Image generated successfully');

      return {
        imageData,
        revisedPrompt,
        format: 'base64',
      };
    } catch (error: any) {
      return this.handleError(error, 'generateImage');
    }
  }

  /**
   * Analyze content using Gemini
   * Supports sentiment analysis, topic extraction, entity recognition, and safety checks
   */
  public async analyzeContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResponse> {
    const { content, analysisType, context } = request;

    try {
      console.log('[GeminiService] Analyzing content:', { 
        type: analysisType, 
        contentLength: content.length 
      });

      const model = this.genAI.getGenerativeModel({ 
        model: GeminiModel.FLASH_1_5 
      });

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

      const result = await model.generateContent(analysisPrompt);
      const responseText = result.response.text();

      // Parse the structured response
      const analysis = this.parseAnalysisResponse(responseText, analysisType);

      console.log('[GeminiService] Content analysis completed:', { type: analysisType });

      return analysis;
    } catch (error: any) {
      return this.handleError(error, 'analyzeContent');
    }
  }

  /**
   * Analyze multimodal content (text + images)
   * Gemini-specific feature for analyzing both text and visual content
   */
  public async analyzeMultimodalContent(request: {
    text?: string;
    imageData?: string;
    analysisType: string;
  }): Promise<ContentAnalysisResponse> {
    const { text, imageData, analysisType } = request;

    try {
      console.log('[GeminiService] Analyzing multimodal content');

      const model = this.genAI.getGenerativeModel({ 
        model: GeminiModel.PRO_1_5 // Pro model for multimodal
      });

      const parts: any[] = [];

      if (text) {
        parts.push({ text: `Analyze the following content:\n\n${text}` });
      }

      if (imageData) {
        // Determine MIME type from base64 data or default to image/jpeg
        const mimeType = this.detectImageMimeType(imageData);
        parts.push({
          inlineData: {
            mimeType,
            data: imageData,
          },
        });
      }

      parts.push({
        text: this.buildMultimodalAnalysisPrompt(analysisType),
      });

      const result = await model.generateContent(parts);
      const responseText = result.response.text();

      const analysis = this.parseAnalysisResponse(responseText, analysisType);

      console.log('[GeminiService] Multimodal analysis completed');

      return analysis;
    } catch (error: any) {
      return this.handleError(error, 'analyzeMultimodalContent');
    }
  }

  /**
   * Generate structured JSON responses using Gemini
   * Useful for generating data in specific formats
   */
  public async generateStructuredJSON<T = any>(request: {
    prompt: string;
    schema?: any;
    config?: AIGenerationConfig;
  }): Promise<T> {
    const { prompt, schema, config } = request;

    try {
      console.log('[GeminiService] Generating structured JSON');

      const generationConfig = this.buildGenerationConfig(config);
      // Force JSON response format
      generationConfig.responseMimeType = 'application/json';

      const model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
        generationConfig,
      });

      let enhancedPrompt = prompt;
      if (schema) {
        enhancedPrompt += `\n\nResponse must conform to this JSON schema:\n${JSON.stringify(schema, null, 2)}`;
      } else {
        enhancedPrompt += '\n\nResponse must be valid JSON.';
      }

      const result = await model.generateContent(enhancedPrompt);
      const responseText = result.response.text();

      // Parse JSON response
      const jsonData = JSON.parse(responseText);

      console.log('[GeminiService] Structured JSON generated successfully');

      return jsonData as T;
    } catch (error: any) {
      return this.handleError(error, 'generateStructuredJSON');
    }
  }

  /**
   * Build generation configuration from AI config
   */
  private buildGenerationConfig(config?: AIGenerationConfig): any {
    return {
      temperature: config?.temperature ?? 0.7,
      topP: config?.topP,
      topK: config?.topK,
      maxOutputTokens: config?.maxTokens,
      stopSequences: config?.stopSequences,
    };
  }

  /**
   * Build safety settings based on safety level
   */
  private buildSafetySettings(safetyLevel?: string): SafetySetting[] {
    const threshold = this.getSafetyThreshold(safetyLevel);

    return [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold,
      },
    ];
  }

  /**
   * Get safety threshold based on level
   */
  private getSafetyThreshold(level?: string): HarmBlockThreshold {
    switch (level) {
      case 'off':
        return HarmBlockThreshold.BLOCK_NONE;
      case 'strict':
        return HarmBlockThreshold.BLOCK_LOW_AND_ABOVE;
      case 'standard':
      default:
        return HarmBlockThreshold.BLOCK_ONLY_HIGH;
    }
  }

  /**
   * Build enhanced prompt for image generation
   */
  private buildImagePrompt(prompt: string, quality: string): string {
    const qualityInstructions = quality === 'high'
      ? 'Generate a high-quality, detailed image with professional composition.'
      : 'Generate a clear, well-composed image.';

    return `${qualityInstructions}\n\nImage description: ${prompt}\n\nGenerate an image that matches this description.`;
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
   * Build multimodal analysis prompt
   */
  private buildMultimodalAnalysisPrompt(analysisType: string): string {
    return `Analyze both the text and image content provided above.
Focus on: ${analysisType}

Provide comprehensive insights about the content in JSON format.`;
  }

  /**
   * Parse analysis response from Gemini
   */
  private parseAnalysisResponse(
    responseText: string,
    analysisType: string
  ): ContentAnalysisResponse {
    try {
      // Try to parse as JSON first
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: return text as summary
      return {
        summary: responseText,
      };
    } catch (error) {
      console.warn('[GeminiService] Failed to parse analysis response:', error);
      return {
        summary: responseText,
      };
    }
  }

  /**
   * Detect image MIME type from base64 data
   */
  private detectImageMimeType(base64Data: string): string {
    // Check for data URL prefix
    if (base64Data.startsWith('data:image/')) {
      const match = base64Data.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      if (match) {
        return match[1];
      }
    }

    // Try to detect from base64 magic numbers
    const header = base64Data.substring(0, 20);
    if (header.startsWith('/9j/') || header.startsWith('/9g/')) {
      return 'image/jpeg';
    } else if (header.startsWith('iVBORw0KGgo')) {
      return 'image/png';
    } else if (header.startsWith('R0lGOD')) {
      return 'image/gif';
    } else if (header.startsWith('UklGR')) {
      return 'image/webp';
    }

    // Default to JPEG
    return 'image/jpeg';
  }

  /**
   * Handle errors and convert to appropriate error types
   */
  private handleError(error: any, operation: string): never {
    console.error(`[GeminiService] Error in ${operation}:`, error);

    // Check for rate limit errors
    if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
      throw new AIProviderRateLimitError(this.name);
    }

    // Check for authentication errors
    if (error.message?.includes('API key') || error.message?.includes('authentication')) {
      throw new AIProviderAuthError(this.name);
    }

    // Check for safety errors
    if (error.message?.includes('safety') || error.message?.includes('blocked')) {
      throw new AIProviderSafetyError(this.name, error.message);
    }

    // Generic error
    throw new AIProviderError(
      `${operation} failed: ${error.message}`,
      this.name,
      error.code,
      error
    );
  }
}

/**
 * Export singleton instance
 */
export const geminiService = new GeminiService();
