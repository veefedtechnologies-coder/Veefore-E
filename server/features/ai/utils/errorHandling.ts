/**
 * AI Utility: Error Handling
 * 
 * Provides reusable utilities for retry logic, fallback providers,
 * and error management across all AI services.
 * 
 * Requirements: 12.6 (error handling and retry logic)
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface FallbackProvider {
  name: string;
  priority: number;
  isAvailable: () => Promise<boolean>;
  execute: <T>(operation: () => Promise<T>) => Promise<T>;
}

export interface AIError {
  code: string;
  message: string;
  provider?: string;
  isRetryable: boolean;
  originalError?: any;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: AIError;
  attempts: number;
  provider?: string;
}

/**
 * Default retry configuration for AI operations
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'RATE_LIMIT',
    'TIMEOUT',
    'NETWORK_ERROR',
    'SERVICE_UNAVAILABLE',
    'INTERNAL_ERROR',
    'QUOTA_EXCEEDED'
  ]
};

/**
 * Classifies error and determines if it's retryable
 */
export function classifyAIError(error: any, provider?: string): AIError {
  let code = 'UNKNOWN_ERROR';
  let message = error?.message || 'An unknown error occurred';
  let isRetryable = false;

  // OpenAI error classification
  if (error?.code === 'insufficient_quota' || error?.message?.includes('quota')) {
    code = 'QUOTA_EXCEEDED';
    message = 'AI provider quota exceeded';
    isRetryable = false; // Don't retry quota errors
  } else if (error?.code === 'rate_limit_exceeded' || error?.status === 429) {
    code = 'RATE_LIMIT';
    message = 'Rate limit exceeded';
    isRetryable = true;
  } else if (error?.code === 'invalid_api_key' || error?.status === 401) {
    code = 'AUTH_ERROR';
    message = 'Invalid API key configuration';
    isRetryable = false;
  } else if (error?.code === 'timeout' || error?.message?.includes('timeout')) {
    code = 'TIMEOUT';
    message = 'Request timed out';
    isRetryable = true;
  } else if (error?.status === 503 || error?.message?.includes('unavailable')) {
    code = 'SERVICE_UNAVAILABLE';
    message = 'AI service temporarily unavailable';
    isRetryable = true;
  } else if (error?.status === 500 || error?.message?.includes('internal')) {
    code = 'INTERNAL_ERROR';
    message = 'Internal server error';
    isRetryable = true;
  }
  
  // Google AI/Gemini error classification
  else if (error?.message?.includes('SAFETY')) {
    code = 'SAFETY_BLOCK';
    message = 'Content blocked by safety filters';
    isRetryable = false;
  } else if (error?.message?.includes('RECITATION')) {
    code = 'RECITATION_BLOCK';
    message = 'Content blocked due to recitation concerns';
    isRetryable = false;
  } else if (error?.message?.includes('API key not valid')) {
    code = 'AUTH_ERROR';
    message = 'Invalid Google AI API key';
    isRetryable = false;
  }
  
  // Network errors
  else if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
    code = 'NETWORK_ERROR';
    message = 'Network connection failed';
    isRetryable = true;
  }

  return {
    code,
    message,
    provider,
    isRetryable,
    originalError: error
  };
}

/**
 * Calculates delay for exponential backoff with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add jitter (randomness) to prevent thundering herd
  const jitter = Math.random() * 0.3 * cappedDelay; // ±30% jitter
  
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleeps for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes operation with retry logic
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  operationName: string = 'AI operation'
): Promise<RetryResult<T>> {
  let lastError: AIError | undefined;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      console.log(`[AI Retry] Attempt ${attempt}/${config.maxAttempts} for ${operationName}`);
      
      const result = await operation();
      
      console.log(`[AI Retry] ${operationName} succeeded on attempt ${attempt}`);
      
      return {
        success: true,
        data: result,
        attempts: attempt
      };
      
    } catch (error: any) {
      const aiError = classifyAIError(error);
      lastError = aiError;
      
      console.error(`[AI Retry] Attempt ${attempt} failed for ${operationName}:`, {
        code: aiError.code,
        message: aiError.message,
        isRetryable: aiError.isRetryable
      });
      
      // Don't retry if error is not retryable
      if (!aiError.isRetryable) {
        console.log(`[AI Retry] Error is not retryable, stopping attempts`);
        break;
      }
      
      // Don't retry if this was the last attempt
      if (attempt >= config.maxAttempts) {
        console.log(`[AI Retry] Max attempts reached, stopping`);
        break;
      }
      
      // Calculate and wait for backoff delay
      const delay = calculateBackoffDelay(attempt, config);
      console.log(`[AI Retry] Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
  
  return {
    success: false,
    error: lastError,
    attempts: config.maxAttempts
  };
}

/**
 * Executes operation with fallback providers
 */
export async function executeWithFallback<T>(
  providers: FallbackProvider[],
  operationFactory: (provider: FallbackProvider) => () => Promise<T>,
  operationName: string = 'AI operation'
): Promise<RetryResult<T>> {
  // Sort providers by priority (lower number = higher priority)
  const sortedProviders = [...providers].sort((a, b) => a.priority - b.priority);
  
  console.log(`[AI Fallback] Executing ${operationName} with ${sortedProviders.length} providers`);
  
  for (const provider of sortedProviders) {
    try {
      // Check if provider is available
      const isAvailable = await provider.isAvailable();
      
      if (!isAvailable) {
        console.log(`[AI Fallback] Provider ${provider.name} is not available, skipping`);
        continue;
      }
      
      console.log(`[AI Fallback] Trying provider: ${provider.name}`);
      
      // Execute operation with retry logic for this provider
      const operation = operationFactory(provider);
      const result = await retryWithBackoff(
        operation,
        DEFAULT_RETRY_CONFIG,
        `${operationName} (${provider.name})`
      );
      
      if (result.success) {
        console.log(`[AI Fallback] ${operationName} succeeded with provider: ${provider.name}`);
        return {
          ...result,
          provider: provider.name
        };
      }
      
      console.warn(`[AI Fallback] Provider ${provider.name} failed, trying next provider`);
      
    } catch (error: any) {
      console.error(`[AI Fallback] Provider ${provider.name} error:`, error);
      // Continue to next provider
    }
  }
  
  // All providers failed
  console.error(`[AI Fallback] All providers failed for ${operationName}`);
  
  return {
    success: false,
    error: {
      code: 'ALL_PROVIDERS_FAILED',
      message: 'All AI providers failed to complete the operation',
      isRetryable: false
    },
    attempts: sortedProviders.length
  };
}

/**
 * Creates a timeout wrapper for async operations
 */
export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => 
      setTimeout(
        () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}

/**
 * Circuit breaker implementation for AI services
 */
export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 60000, // 1 minute
    private readonly halfOpenAttempts: number = 3
  ) {}

  /**
   * Executes operation with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    // Check circuit state
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceLastFailure >= this.resetTimeoutMs) {
        console.log(`[Circuit Breaker] Transitioning to HALF_OPEN for ${operationName}`);
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker is OPEN for ${operationName}. Try again later.`);
      }
    }

    try {
      const result = await operation();
      
      // Success - reset circuit breaker
      if (this.state === 'HALF_OPEN') {
        console.log(`[Circuit Breaker] Operation succeeded in HALF_OPEN, closing circuit for ${operationName}`);
      }
      
      this.failureCount = 0;
      this.state = 'CLOSED';
      
      return result;
      
    } catch (error: any) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      console.error(`[Circuit Breaker] Failure ${this.failureCount}/${this.failureThreshold} for ${operationName}`);
      
      // Open circuit if threshold reached
      if (this.failureCount >= this.failureThreshold) {
        console.error(`[Circuit Breaker] Opening circuit for ${operationName}`);
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }

  /**
   * Gets current circuit state
   */
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  /**
   * Manually resets circuit breaker
   */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    console.log('[Circuit Breaker] Manually reset');
  }
}

/**
 * Logs AI errors in a structured format
 */
export function logAIError(
  error: AIError,
  context: {
    userId?: string;
    workspaceId?: string;
    operation: string;
    provider?: string;
    metadata?: Record<string, any>;
  }
): void {
  console.error('[AI Error]', {
    timestamp: new Date().toISOString(),
    errorCode: error.code,
    errorMessage: error.message,
    provider: error.provider || context.provider,
    isRetryable: error.isRetryable,
    operation: context.operation,
    userId: context.userId,
    workspaceId: context.workspaceId,
    metadata: context.metadata,
    originalError: error.originalError?.message
  });
}

/**
 * Creates a standardized error response for API endpoints
 */
export function createErrorResponse(error: AIError): {
  error: string;
  code: string;
  retryable: boolean;
  details?: string;
} {
  return {
    error: error.message,
    code: error.code,
    retryable: error.isRetryable,
    details: error.originalError?.message
  };
}

/**
 * Wraps an AI operation with comprehensive error handling
 */
export async function wrapAIOperation<T>(
  operation: () => Promise<T>,
  options: {
    operationName: string;
    userId?: string;
    workspaceId?: string;
    provider?: string;
    retryConfig?: RetryConfig;
    timeoutMs?: number;
  }
): Promise<RetryResult<T>> {
  const {
    operationName,
    userId,
    workspaceId,
    provider,
    retryConfig = DEFAULT_RETRY_CONFIG,
    timeoutMs
  } = options;

  try {
    // Wrap with timeout if specified
    const timedOperation = timeoutMs
      ? () => withTimeout(operation(), timeoutMs, operationName)
      : operation;

    // Execute with retry logic
    const result = await retryWithBackoff(timedOperation, retryConfig, operationName);

    if (!result.success && result.error) {
      // Log error
      logAIError(result.error, {
        userId,
        workspaceId,
        operation: operationName,
        provider
      });
    }

    return result;

  } catch (error: any) {
    const aiError = classifyAIError(error, provider);
    
    logAIError(aiError, {
      userId,
      workspaceId,
      operation: operationName,
      provider
    });

    return {
      success: false,
      error: aiError,
      attempts: 1
    };
  }
}
