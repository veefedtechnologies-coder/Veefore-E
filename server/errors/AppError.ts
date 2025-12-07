export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id ${id} not found` : `${resource} not found`,
      404,
      'NOT_FOUND'
    );
  }
}

export class ValidationError extends AppError {
  public readonly errors: Record<string, string[]>;

  constructor(message: string, errors: Record<string, string[]> = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class PaymentRequiredError extends AppError {
  public readonly details?: Record<string, any>;

  constructor(message: string, details?: Record<string, any>) {
    super(message, 402, 'PAYMENT_REQUIRED');
    this.details = details;
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string = 'Too many requests', retryAfter: number = 60) {
    super(message, 429, 'RATE_LIMIT');
    this.retryAfter = retryAfter;
  }
}

export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(`Database error: ${message}`, 500, 'DATABASE_ERROR');
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

export class TransientDatabaseError extends AppError {
  public readonly isTransient = true;
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(`Transient database error: ${message}`, 503, 'TRANSIENT_DATABASE_ERROR');
    this.originalError = originalError;
    if (originalError) {
      this.stack = originalError.stack;
    }
  }

  static isTransientError(error: any): boolean {
    if (!error) return false;
    const errorName = error.name || '';
    const errorMessage = error.message || '';
    
    return (
      errorName === 'MongoNetworkError' ||
      errorName === 'MongoServerSelectionError' ||
      errorName === 'MongoTimeoutError' ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection closed') ||
      errorMessage.includes('socket hang up')
    );
  }
}

export class MongoConnectionError extends AppError {
  public readonly retryable: boolean;

  constructor(message: string, retryable: boolean = true) {
    super(`MongoDB connection error: ${message}`, 503, 'MONGO_CONNECTION_ERROR');
    this.retryable = retryable;
  }
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  shouldRetry: (error: any) => boolean = TransientDatabaseError.isTransientError
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);
      const jitter = Math.random() * delay * 0.1;
      
      console.warn(
        `[RETRY] Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay + jitter)}ms:`,
        error.message
      );

      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }

  throw lastError;
}
