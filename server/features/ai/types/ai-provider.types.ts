/**
 * Common types for AI provider services
 * Provides unified interfaces for different AI providers (OpenAI, Gemini, Perplexity)
 */

export interface AIGenerationConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
}

export interface TextGenerationRequest {
  prompt: string;
  systemContext?: string;
  config?: AIGenerationConfig;
}

export interface TextGenerationResponse {
  text: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ImageGenerationRequest {
  prompt: string;
  size?: string;
  quality?: string;
  style?: string;
  n?: number;
}

export interface ImageGenerationResponse {
  imageUrl?: string;
  imageData?: string; // Base64 encoded image data
  revisedPrompt?: string;
  format?: string;
}

export interface ContentAnalysisRequest {
  content: string;
  analysisType: 'sentiment' | 'topics' | 'entities' | 'safety' | 'comprehensive';
  context?: string;
}

export interface ContentAnalysisResponse {
  sentiment?: {
    score: number; // -1 to 1
    magnitude: number;
    label: 'positive' | 'negative' | 'neutral' | 'mixed';
  };
  topics?: string[];
  entities?: Array<{
    name: string;
    type: string;
    salience: number;
  }>;
  safety?: {
    isSafe: boolean;
    categories: Array<{
      category: string;
      severity: string;
    }>;
  };
  summary?: string;
}

/**
 * Common interface that all AI providers must implement
 */
export interface IAIProvider {
  readonly name: string;
  readonly isConfigured: boolean;

  /**
   * Generate text based on a prompt
   */
  generateText(request: TextGenerationRequest): Promise<TextGenerationResponse>;

  /**
   * Generate an image based on a prompt
   */
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;

  /**
   * Analyze content for various insights
   */
  analyzeContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResponse>;

  /**
   * Check if the provider is properly configured and available
   */
  checkHealth(): Promise<boolean>;
}

/**
 * Gemini-specific provider interface
 */
export interface IGeminiProvider extends IAIProvider {
  /**
   * Gemini supports multimodal content analysis
   */
  analyzeMultimodalContent(request: {
    text?: string;
    imageData?: string;
    analysisType: string;
  }): Promise<ContentAnalysisResponse>;

  /**
   * Generate structured JSON responses
   */
  generateStructuredJSON<T = any>(request: {
    prompt: string;
    schema?: any;
    config?: AIGenerationConfig;
  }): Promise<T>;
}

/**
 * Error types for AI provider operations
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class AIProviderRateLimitError extends AIProviderError {
  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${provider}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      provider,
      'RATE_LIMIT'
    );
    this.name = 'AIProviderRateLimitError';
  }
}

export class AIProviderAuthError extends AIProviderError {
  constructor(provider: string) {
    super(`Authentication failed for ${provider}`, provider, 'AUTH_ERROR');
    this.name = 'AIProviderAuthError';
  }
}

export class AIProviderSafetyError extends AIProviderError {
  constructor(provider: string, reason?: string) {
    super(
      `Content safety violation for ${provider}${reason ? `: ${reason}` : ''}`,
      provider,
      'SAFETY_ERROR'
    );
    this.name = 'AIProviderSafetyError';
  }
}
