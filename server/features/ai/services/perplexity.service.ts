/**
 * PerplexityService
 * 
 * Dedicated service for Perplexity API interactions.
 * Handles text generation with web search capabilities and citation parsing.
 * 
 * Requirements: 12.1, 12.3, 12.5
 */

import type {
  IAIProvider,
  TextGenerationRequest,
  TextGenerationResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from '../types/ai-provider.types';

/**
 * Citation structure returned by Perplexity API
 */
export interface PerplexityCitation {
  url: string;
  title?: string;
  snippet?: string;
}

/**
 * Perplexity API response structure
 */
export interface PerplexityAPIResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
}

/**
 * Web search request parameters
 */
export interface WebSearchRequest {
  query: string;
  searchRecencyFilter?: 'hour' | 'day' | 'week' | 'month' | 'year';
  maxResults?: number;
}

/**
 * Web search response
 */
export interface WebSearchResponse {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    relevance?: number;
  }>;
  summary: string;
  citations: PerplexityCitation[];
}

/**
 * Perplexity-specific interface extends the base provider
 */
export interface IPerplexityProvider extends IAIProvider {
  searchWeb(request: WebSearchRequest): Promise<WebSearchResponse>;
}

/**
 * PerplexityService Implementation
 * 
 * Provides access to Perplexity AI's sonar models with real-time web search.
 * Handles API calls, error handling, rate limiting, and citation parsing.
 */
export class PerplexityService implements IPerplexityProvider {
  public readonly name = 'Perplexity';
  private readonly apiKey: string;
  private readonly apiEndpoint = 'https://api.perplexity.ai/chat/completions';
  private readonly defaultModel = 'llama-3.1-sonar-small-128k-online';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.PERPLEXITY_API_KEY || '';
  }

  /**
   * Check if the service is properly configured with an API key
   */
  public get isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Health check for Perplexity service
   */
  public async checkHealth(): Promise<boolean> {
    try {
      if (!this.isConfigured) {
        return false;
      }

      // Simple test generation to verify API key and connectivity
      const response = await this.generateText({
        prompt: 'Hello',
        config: {
          maxTokens: 5,
        },
      });

      return !!response.text;
    } catch (error) {
      console.error('[PerplexityService] Health check failed:', error);
      return false;
    }
  }

  /**
   * Generate image (not supported by Perplexity)
   * Throws error as Perplexity does not support image generation
   */
  public async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    throw new Error('Image generation is not supported by Perplexity. Please use OpenAI or Gemini.');
  }

  /**
   * Analyze content using Perplexity with web search
   */
  public async analyzeContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResponse> {
    const { content, analysisType, context } = request;

    console.log('[PerplexityService] Analyzing content with web-enhanced insights');

    // Use web search to enhance content analysis
    const analysisPrompt = `Analyze the following ${context || 'content'} for ${analysisType}.

Content: ${content}

Provide analysis with current web-based insights and cite relevant sources.`;

    try {
      const response = await this.generateText({
        prompt: analysisPrompt,
        systemContext: 'You are an expert analyst with access to current web information. Provide accurate, well-sourced analysis.',
        config: {
          temperature: 0.3,
        },
      });

      return {
        summary: response.text,
      };
    } catch (error) {
      console.error('[PerplexityService] Content analysis failed:', error);
      throw error;
    }
  }

  /**
   * Generate text with Perplexity's web-search enabled models
   * 
   * @param request - Text generation parameters
   * @returns Generated text with citations and metadata
   * @throws Error if API call fails or service is not configured
   */
  public async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.isConfigured) {
      throw new Error('Perplexity API key is not configured. Set PERPLEXITY_API_KEY environment variable.');
    }

    const {
      prompt,
      systemContext,
      config,
    } = request;

    const defaultSystemPrompt = 
      'You are a research-focused AI assistant specializing in current trends, data, and up-to-date information for content creators and social media professionals. Provide well-sourced, current information with citations when possible.';

    const systemPrompt = systemContext || defaultSystemPrompt;
    const maxTokens = config?.maxTokens || 800;
    const temperature = config?.temperature ?? 0.3;
    const topP = config?.topP ?? 0.9;
    const searchRecencyFilter = 'month'; // Default to month

    console.log('[PerplexityService] Generating text for prompt:', prompt.substring(0, 50) + '...');

    try {
      const requestBody = {
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        return_images: false,
        return_related_questions: false,
        search_recency_filter: searchRecencyFilter,
        stream: false
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        await this.handleAPIError(response);
      }

      const data = await response.json() as PerplexityAPIResponse;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content received from Perplexity API');
      }

      // Parse citations from response
      const citations = this.parseCitations(data.citations || [], content);

      console.log('[PerplexityService] Successfully generated text with', citations.length, 'citations');

      return {
        text: content,
        finishReason: data.choices?.[0]?.finish_reason,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      console.error('[PerplexityService] Text generation error:', error);
      throw error;
    }
  }

  /**
   * Perform web search using Perplexity's search capabilities
   * 
   * @param request - Web search parameters
   * @returns Search results with citations and summary
   * @throws Error if API call fails or service is not configured
   */
  public async searchWeb(request: WebSearchRequest): Promise<WebSearchResponse> {
    if (!this.isConfigured) {
      throw new Error('Perplexity API key is not configured. Set PERPLEXITY_API_KEY environment variable.');
    }

    const {
      query,
      searchRecencyFilter = 'month',
      maxResults = 10
    } = request;

    console.log('[PerplexityService] Performing web search for:', query);

    // Construct a search-focused prompt
    const searchPrompt = `Search the web and provide detailed information about: ${query}

Please include:
1. A comprehensive summary of findings
2. Key facts and data points
3. Recent trends and developments
4. Sources and citations

Limit to the top ${maxResults} most relevant sources.`;

    try {
      const textResponse = await this.generateText({
        prompt: searchPrompt,
        systemContext: 'You are a web search assistant. Provide accurate, well-sourced information from current web sources. Structure your response with clear citations.',
        config: {
          temperature: 0.2, // Lower temperature for more factual results
        },
      });

      // Extract search results from the response
      const results = this.extractSearchResults(textResponse.text, []);

      console.log('[PerplexityService] Web search completed with', results.length, 'results');

      return {
        results,
        summary: textResponse.text,
        citations: [],
      };
    } catch (error) {
      console.error('[PerplexityService] Web search error:', error);
      throw error;
    }
  }

  /**
   * Handle API errors with appropriate error messages
   * 
   * @param response - Failed fetch response
   * @throws Error with appropriate message based on status code
   */
  private async handleAPIError(response: Response): Promise<never> {
    const errorText = await response.text();
    console.error('[PerplexityService] API error response:', errorText.substring(0, 200));

    switch (response.status) {
      case 401:
        throw new Error('Perplexity API authentication failed. API key may be invalid or expired.');
      case 403:
        throw new Error('Perplexity API access forbidden. Check API key permissions.');
      case 429:
        throw new Error('Perplexity API rate limit exceeded. Please try again later.');
      case 500:
      case 502:
      case 503:
      case 504:
        throw new Error('Perplexity API server error. The service is temporarily unavailable.');
      default:
        throw new Error(`Perplexity API request failed with status ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Parse citations from API response
   * Converts citation URLs into structured citation objects
   * 
   * @param citationUrls - Array of citation URLs from API
   * @param content - Response content to extract context
   * @returns Array of structured citations
   */
  private parseCitations(citationUrls: string[], content: string): PerplexityCitation[] {
    return citationUrls.map((url, index) => {
      // Try to extract title and snippet from content
      const citation: PerplexityCitation = { url };

      // Look for numbered citations in content like [1], [2], etc.
      const citationPattern = new RegExp(`\\[${index + 1}\\]\\s*([^\\[\\n]+)`, 'i');
      const match = content.match(citationPattern);

      if (match) {
        citation.snippet = match[1].trim().substring(0, 200);
      }

      // Extract domain as title if no better title found
      try {
        const urlObj = new URL(url);
        citation.title = this.extractTitleFromURL(urlObj);
      } catch (error) {
        citation.title = 'Source';
      }

      return citation;
    });
  }

  /**
   * Extract a readable title from URL
   * 
   * @param url - URL object
   * @returns Human-readable title
   */
  private extractTitleFromURL(url: URL): string {
    const domain = url.hostname.replace('www.', '');
    const pathSegments = url.pathname.split('/').filter(seg => seg.length > 0);

    if (pathSegments.length > 0) {
      // Use last path segment as title hint
      const lastSegment = pathSegments[pathSegments.length - 1]
        .replace(/[-_]/g, ' ')
        .replace(/\.[^.]+$/, ''); // Remove file extension
      
      return `${domain} - ${lastSegment}`;
    }

    return domain;
  }

  /**
   * Extract search results from generated content
   * Parses the response to identify individual search results
   * 
   * @param content - Generated content
   * @param citations - Parsed citations
   * @returns Array of search results
   */
  private extractSearchResults(
    content: string,
    citations: PerplexityCitation[]
  ): Array<{ title: string; url: string; snippet: string; relevance?: number }> {
    const results: Array<{ title: string; url: string; snippet: string; relevance?: number }> = [];

    // Map citations to results
    citations.forEach((citation, index) => {
      results.push({
        title: citation.title || `Source ${index + 1}`,
        url: citation.url,
        snippet: citation.snippet || '',
        relevance: 1 - (index * 0.1) // Simple relevance scoring
      });
    });

    // If no citations, try to extract from content structure
    if (results.length === 0) {
      // Look for numbered or bulleted lists in content
      const listItemPattern = /(?:^|\n)(?:\d+\.|[-*])\s*([^\n]+)/g;
      let match;
      let count = 0;

      while ((match = listItemPattern.exec(content)) !== null && count < 10) {
        results.push({
          title: `Finding ${count + 1}`,
          url: '',
          snippet: match[1].trim(),
          relevance: 1 - (count * 0.1)
        });
        count++;
      }
    }

    return results;
  }
}

/**
 * Singleton instance for convenient access
 */
let perplexityServiceInstance: PerplexityService | null = null;

/**
 * Get or create PerplexityService singleton instance
 * 
 * @returns PerplexityService instance
 */
export function getPerplexityService(): PerplexityService {
  if (!perplexityServiceInstance) {
    perplexityServiceInstance = new PerplexityService();
  }
  return perplexityServiceInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetPerplexityService(): void {
  perplexityServiceInstance = null;
}
