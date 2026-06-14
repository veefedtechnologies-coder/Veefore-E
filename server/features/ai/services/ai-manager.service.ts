/**
 * AI Service Manager
 * 
 * Orchestrator service that manages and delegates to provider-specific AI services.
 * Selects the appropriate AI provider (OpenAI, Gemini, Perplexity) based on configuration,
 * workload, and availability. Implements fallback strategies and load balancing.
 * 
 * Requirements: 4.1, 4.2, 12.1, 12.2
 * Task: 16.1 Create AIServiceManager orchestrator (~300 lines)
 */

import { OpenAIService } from './openai.service';
import { GeminiService } from './gemini.service';
import { PerplexityService } from './perplexity.service';
import type {
  IAIProvider,
  TextGenerationRequest,
  TextGenerationResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
} from '../types/ai-provider.types';
import {
  AIProviderError,
  AIProviderRateLimitError,
} from '../types/ai-provider.types';

/**
 * AI provider types supported by the manager
 */
export type AIProviderType = 'openai' | 'gemini' | 'perplexity';

/**
 * Configuration for AI service manager
 */
export interface AIManagerConfig {
  defaultProvider?: AIProviderType;
  enableFallback?: boolean;
  enableLoadBalancing?: boolean;
  preferredProviders?: {
    text?: AIProviderType;
    image?: AIProviderType;
    analysis?: AIProviderType;
  };
}

/**
 * Provider selection strategy
 */
type SelectionStrategy = 'default' | 'roundrobin' | 'availability' | 'workload';

/**
 * AIServiceManager
 * 
 * Central orchestrator for all AI operations. Manages multiple AI providers,
 * implements intelligent provider selection, fallback mechanisms, and error handling.
 * 
 * Key Features:
 * - Provider selection based on task type and configuration
 * - Automatic fallback when providers fail or are unavailable
 * - Load balancing across multiple providers
 * - Health monitoring of all providers
 * - Unified error handling and logging
 */
export class AIServiceManager {
  private static instance: AIServiceManager;
  private config: AIManagerConfig;
  private providers: Map<AIProviderType, IAIProvider>;
  private healthStatus: Map<AIProviderType, boolean>;
  private requestCounts: Map<AIProviderType, number>;
  private lastHealthCheck: Date;
  private healthCheckInterval: number = 5 * 60 * 1000; // 5 minutes

  private constructor(config?: AIManagerConfig) {
    this.config = {
      defaultProvider: 'openai',
      enableFallback: true,
      enableLoadBalancing: false,
      preferredProviders: {
        text: 'openai',
        image: 'openai',
        analysis: 'gemini',
      },
      ...config,
    };

    // Initialize providers
    this.providers = new Map();
    this.healthStatus = new Map();
    this.requestCounts = new Map();
    this.lastHealthCheck = new Date();

    this.initializeProviders();
    
    console.log('[AIServiceManager] Initialized with default provider:', this.config.defaultProvider);
  }

  /**
   * Get singleton instance of AIServiceManager
   */
  public static getInstance(config?: AIManagerConfig): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager(config);
    }
    return AIServiceManager.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    AIServiceManager.instance = null as any;
  }

  /**
   * Initialize all AI provider services
   */
  private initializeProviders(): void {
    console.log('[AIServiceManager] Initializing AI providers...');

    // Initialize OpenAI
    const openaiService = new OpenAIService();
    this.providers.set('openai', openaiService);
    this.healthStatus.set('openai', openaiService.isConfigured);
    this.requestCounts.set('openai', 0);

    // Initialize Gemini
    const geminiService = new GeminiService();
    this.providers.set('gemini', geminiService);
    this.healthStatus.set('gemini', geminiService.isConfigured);
    this.requestCounts.set('gemini', 0);

    // Initialize Perplexity
    const perplexityService = new PerplexityService();
    this.providers.set('perplexity', perplexityService);
    this.healthStatus.set('perplexity', perplexityService.isConfigured);
    this.requestCounts.set('perplexity', 0);

    console.log('[AIServiceManager] Providers initialized:', {
      openai: this.healthStatus.get('openai'),
      gemini: this.healthStatus.get('gemini'),
      perplexity: this.healthStatus.get('perplexity'),
    });
  }

  /**
   * Generate text using the best available provider
   * 
   * @param request - Text generation request parameters
   * @param preferredProvider - Optional preferred provider
   * @returns Generated text with metadata
   */
  public async generateText(
    request: TextGenerationRequest,
    preferredProvider?: AIProviderType
  ): Promise<TextGenerationResponse> {
    const provider = preferredProvider || this.config.preferredProviders?.text || this.config.defaultProvider;
    
    console.log('[AIServiceManager] Generating text with provider:', provider);

    try {
      const selectedProvider = await this.selectProvider('text', provider);
      const result = await selectedProvider.generateText(request);
      
      this.incrementRequestCount(this.getProviderType(selectedProvider));
      
      return result;
    } catch (error) {
      return this.handleProviderError(error, 'generateText', request, preferredProvider);
    }
  }

  /**
   * Generate image using the best available provider
   * 
   * @param request - Image generation request parameters
   * @param preferredProvider - Optional preferred provider
   * @returns Generated image with metadata
   */
  public async generateImage(
    request: ImageGenerationRequest,
    preferredProvider?: AIProviderType
  ): Promise<ImageGenerationResponse> {
    const provider = preferredProvider || this.config.preferredProviders?.image || this.config.defaultProvider;
    
    console.log('[AIServiceManager] Generating image with provider:', provider);

    try {
      const selectedProvider = await this.selectProvider('image', provider);
      const result = await selectedProvider.generateImage(request);
      
      this.incrementRequestCount(this.getProviderType(selectedProvider));
      
      return result;
    } catch (error) {
      return this.handleProviderError(error, 'generateImage', request, preferredProvider);
    }
  }

  /**
   * Analyze content using the best available provider
   * 
   * @param request - Content analysis request parameters
   * @param preferredProvider - Optional preferred provider
   * @returns Content analysis results
   */
  public async analyzeContent(
    request: ContentAnalysisRequest,
    preferredProvider?: AIProviderType
  ): Promise<ContentAnalysisResponse> {
    const provider = preferredProvider || this.config.preferredProviders?.analysis || this.config.defaultProvider;
    
    console.log('[AIServiceManager] Analyzing content with provider:', provider);

    try {
      const selectedProvider = await this.selectProvider('analysis', provider);
      const result = await selectedProvider.analyzeContent(request);
      
      this.incrementRequestCount(this.getProviderType(selectedProvider));
      
      return result;
    } catch (error) {
      return this.handleProviderError(error, 'analyzeContent', request, preferredProvider);
    }
  }

  /**
   * Select the appropriate AI provider based on task type and configuration
   * 
   * @param taskType - Type of AI task (text, image, analysis)
   * @param preferredProvider - Preferred provider if specified
   * @returns Selected AI provider instance
   */
  private async selectProvider(
    taskType: 'text' | 'image' | 'analysis',
    preferredProvider?: AIProviderType
  ): Promise<IAIProvider> {
    // Check if we need to refresh health status
    await this.refreshHealthStatusIfNeeded();

    // Try preferred provider first
    if (preferredProvider) {
      const provider = this.providers.get(preferredProvider);
      const isHealthy = this.healthStatus.get(preferredProvider);
      
      if (provider && isHealthy) {
        console.log('[AIServiceManager] Using preferred provider:', preferredProvider);
        return provider;
      }
      
      console.warn('[AIServiceManager] Preferred provider unavailable:', preferredProvider);
    }

    // Get all healthy providers
    const healthyProviders = this.getHealthyProviders();
    
    if (healthyProviders.length === 0) {
      throw new AIProviderError(
        'No healthy AI providers available',
        'AIServiceManager',
        'NO_PROVIDERS_AVAILABLE'
      );
    }

    // Select provider based on strategy
    let selectedProviderType: AIProviderType;

    if (this.config.enableLoadBalancing) {
      // Round-robin selection among healthy providers
      selectedProviderType = this.selectProviderByLoadBalancing(healthyProviders);
    } else {
      // Use first healthy provider (priority order)
      selectedProviderType = healthyProviders[0];
    }

    const provider = this.providers.get(selectedProviderType);
    
    if (!provider) {
      throw new AIProviderError(
        `Provider ${selectedProviderType} not found`,
        'AIServiceManager',
        'PROVIDER_NOT_FOUND'
      );
    }

    console.log('[AIServiceManager] Selected provider:', selectedProviderType);
    return provider;
  }

  /**
   * Get list of healthy (available) providers
   */
  private getHealthyProviders(): AIProviderType[] {
    const healthy: AIProviderType[] = [];
    
    Array.from(this.healthStatus.entries()).forEach(([type, isHealthy]) => {
      if (isHealthy) {
        healthy.push(type);
      }
    });
    
    return healthy;
  }

  /**
   * Select provider using load balancing (round-robin)
   */
  private selectProviderByLoadBalancing(healthyProviders: AIProviderType[]): AIProviderType {
    // Find provider with lowest request count
    let minCount = Infinity;
    let selectedProvider = healthyProviders[0];
    
    for (const provider of healthyProviders) {
      const count = this.requestCounts.get(provider) || 0;
      if (count < minCount) {
        minCount = count;
        selectedProvider = provider;
      }
    }
    
    return selectedProvider;
  }

  /**
   * Handle provider errors with fallback logic
   */
  private async handleProviderError(
    error: any,
    operation: string,
    request: any,
    attemptedProvider?: AIProviderType
  ): Promise<any> {
    console.error(`[AIServiceManager] Error in ${operation}:`, error);

    // If fallback is disabled, rethrow the error
    if (!this.config.enableFallback) {
      throw error;
    }

    // If it's a rate limit error and we have other providers, try fallback
    if (error instanceof AIProviderRateLimitError) {
      console.log('[AIServiceManager] Rate limit hit, attempting fallback...');
      
      // Mark provider as temporarily unhealthy
      if (attemptedProvider) {
        this.healthStatus.set(attemptedProvider, false);
      }
      
      // Try with another provider
      try {
        const fallbackProvider = await this.selectProvider(
          this.inferTaskType(operation),
          undefined // Don't prefer any provider for fallback
        );
        
        return await (fallbackProvider as any)[operation](request);
      } catch (fallbackError) {
        console.error('[AIServiceManager] Fallback also failed:', fallbackError);
        throw fallbackError;
      }
    }

    // For other errors, rethrow
    throw error;
  }

  /**
   * Infer task type from operation name
   */
  private inferTaskType(operation: string): 'text' | 'image' | 'analysis' {
    if (operation.includes('Image')) {
      return 'image';
    } else if (operation.includes('analyze')) {
      return 'analysis';
    }
    return 'text';
  }

  /**
   * Get provider type from provider instance
   */
  private getProviderType(provider: IAIProvider): AIProviderType {
    const entries = Array.from(this.providers.entries());
    for (const [type, p] of entries) {
      if (p === provider) {
        return type;
      }
    }
    return 'openai'; // Default fallback
  }

  /**
   * Increment request count for a provider
   */
  private incrementRequestCount(provider: AIProviderType): void {
    const current = this.requestCounts.get(provider) || 0;
    this.requestCounts.set(provider, current + 1);
  }

  /**
   * Refresh health status if needed (based on interval)
   */
  private async refreshHealthStatusIfNeeded(): Promise<void> {
    const now = new Date();
    const timeSinceLastCheck = now.getTime() - this.lastHealthCheck.getTime();
    
    if (timeSinceLastCheck > this.healthCheckInterval) {
      console.log('[AIServiceManager] Refreshing provider health status...');
      await this.checkAllProvidersHealth();
      this.lastHealthCheck = now;
    }
  }

  /**
   * Check health of all providers
   */
  public async checkAllProvidersHealth(): Promise<Record<AIProviderType, boolean>> {
    console.log('[AIServiceManager] Checking health of all providers...');
    
    const healthChecks = Array.from(this.providers.entries()).map(
      async ([type, provider]) => {
        try {
          const isHealthy = await provider.checkHealth();
          this.healthStatus.set(type, isHealthy);
          return [type, isHealthy] as [AIProviderType, boolean];
        } catch (error) {
          console.error(`[AIServiceManager] Health check failed for ${type}:`, error);
          this.healthStatus.set(type, false);
          return [type, false] as [AIProviderType, boolean];
        }
      }
    );
    
    const results = await Promise.all(healthChecks);
    const healthMap = Object.fromEntries(results) as Record<AIProviderType, boolean>;
    
    console.log('[AIServiceManager] Health check results:', healthMap);
    
    return healthMap;
  }

  /**
   * Get current statistics about provider usage
   */
  public getStatistics(): {
    providers: Record<AIProviderType, { healthy: boolean; requests: number }>;
    totalRequests: number;
  } {
    const providers: Record<string, { healthy: boolean; requests: number }> = {};
    let totalRequests = 0;
    
    const providerKeys = Array.from(this.providers.keys());
    for (const type of providerKeys) {
      const healthy = this.healthStatus.get(type) || false;
      const requests = this.requestCounts.get(type) || 0;
      
      providers[type] = { healthy, requests };
      totalRequests += requests;
    }
    
    return {
      providers: providers as Record<AIProviderType, { healthy: boolean; requests: number }>,
      totalRequests,
    };
  }

  /**
   * Reset request counts (useful for testing or periodic resets)
   */
  public resetRequestCounts(): void {
    const providerKeys = Array.from(this.providers.keys());
    for (const provider of providerKeys) {
      this.requestCounts.set(provider, 0);
    }
    console.log('[AIServiceManager] Request counts reset');
  }

  /**
   * Get specific provider instance (for direct access if needed)
   */
  public getProvider(type: AIProviderType): IAIProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Check if a specific provider is available
   */
  public isProviderAvailable(type: AIProviderType): boolean {
    return this.healthStatus.get(type) || false;
  }
}

/**
 * Export convenience function to get manager instance
 */
export function getAIServiceManager(config?: AIManagerConfig): AIServiceManager {
  return AIServiceManager.getInstance(config);
}
