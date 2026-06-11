import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';
import crypto from 'crypto';

/**
 * OAuth-specific error codes for all OAuth scenarios
 * Requirements: 11.1, 11.4, 11.5
 */
export const OAuthErrorCodes = {
  // State validation errors (CSRF protection)
  INVALID_STATE: 'invalid_state',
  STATE_EXPIRED: 'state_expired',
  STATE_MISSING: 'state_missing',
  
  // Token exchange errors
  TOKEN_EXCHANGE_FAILED: 'token_exchange_failed',
  INVALID_AUTHORIZATION_CODE: 'invalid_authorization_code',
  AUTHORIZATION_CODE_USED: 'authorization_code_used',
  
  // Firebase token errors
  FIREBASE_TOKEN_FAILED: 'firebase_token_failed',
  
  // Refresh token errors
  REFRESH_TOKEN_NOT_FOUND: 'refresh_token_not_found',
  REFRESH_TOKEN_EXPIRED: 'refresh_token_expired',
  REFRESH_TOKEN_INVALID: 'refresh_token_invalid',
  ENCRYPTION_FAILED: 'encryption_failed',
  DECRYPTION_FAILED: 'decryption_failed',
  
  // Session errors
  NO_VALID_SESSION: 'no_valid_session',
  SESSION_EXPIRED: 'session_expired',
  INVALID_SESSION: 'invalid_session',
  
  // Configuration errors
  REDIRECT_URI_MISMATCH: 'redirect_uri_mismatch',
  OAUTH_CONFIG_ERROR: 'oauth_config_error',
  
  // Service availability errors
  SERVICE_UNAVAILABLE: 'service_unavailable',
  GOOGLE_OAUTH_ERROR: 'google_oauth_error',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  
  // General errors
  INTERNAL_ERROR: 'internal_error',
} as const;

/**
 * User-friendly error messages for OAuth scenarios
 * Requirements: 11.1, 11.4
 */
export const OAuthErrorMessages: Record<string, string> = {
  [OAuthErrorCodes.INVALID_STATE]: 'Invalid authentication request. Please try again.',
  [OAuthErrorCodes.STATE_EXPIRED]: 'Authentication request expired. Please try again.',
  [OAuthErrorCodes.STATE_MISSING]: 'Missing authentication data. Please try again.',
  
  [OAuthErrorCodes.TOKEN_EXCHANGE_FAILED]: 'Failed to complete authentication. Please try again.',
  [OAuthErrorCodes.INVALID_AUTHORIZATION_CODE]: 'Invalid authorization code. Please try again.',
  [OAuthErrorCodes.AUTHORIZATION_CODE_USED]: 'Authorization code has already been used. Please try again.',
  
  [OAuthErrorCodes.FIREBASE_TOKEN_FAILED]: 'Failed to create authentication token. Please try again.',
  
  [OAuthErrorCodes.REFRESH_TOKEN_NOT_FOUND]: 'Session expired. Please log in again.',
  [OAuthErrorCodes.REFRESH_TOKEN_EXPIRED]: 'Refresh token expired. Please re-authenticate.',
  [OAuthErrorCodes.REFRESH_TOKEN_INVALID]: 'Invalid refresh token. Please log in again.',
  [OAuthErrorCodes.ENCRYPTION_FAILED]: 'Failed to secure authentication data. Please try again.',
  [OAuthErrorCodes.DECRYPTION_FAILED]: 'Failed to retrieve authentication data. Please log in again.',
  
  [OAuthErrorCodes.NO_VALID_SESSION]: 'No valid session found. Please log in.',
  [OAuthErrorCodes.SESSION_EXPIRED]: 'Your session has expired. Please log in again.',
  [OAuthErrorCodes.INVALID_SESSION]: 'Invalid session. Please log in again.',
  
  [OAuthErrorCodes.REDIRECT_URI_MISMATCH]: 'OAuth configuration error: redirect URI not authorized. Please contact support.',
  [OAuthErrorCodes.OAUTH_CONFIG_ERROR]: 'OAuth configuration error. Please contact support.',
  
  [OAuthErrorCodes.SERVICE_UNAVAILABLE]: 'Authentication service temporarily unavailable. Please try again later.',
  [OAuthErrorCodes.GOOGLE_OAUTH_ERROR]: 'Google authentication service error. Please try again later.',
  
  [OAuthErrorCodes.RATE_LIMIT_EXCEEDED]: 'Too many authentication attempts. Please try again later.',
  
  [OAuthErrorCodes.INTERNAL_ERROR]: 'An unexpected error occurred. Please try again.',
};

/**
 * OAuth error response format with correlationId
 * Requirements: 11.1, 11.5
 */
export interface OAuthErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    timestamp: string;
    details?: Record<string, any>;
  };
}

/**
 * Custom OAuth error class
 * Requirements: 11.1, 11.4
 */
export class OAuthError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly correlationId: string;
  public readonly isOperational: boolean = true;
  public readonly details?: Record<string, any>;

  constructor(
    code: string,
    statusCode: number = 500,
    message?: string,
    correlationId?: string,
    details?: Record<string, any>
  ) {
    super(message || OAuthErrorMessages[code] || 'An unexpected error occurred');
    this.code = code;
    this.statusCode = statusCode;
    this.correlationId = correlationId || crypto.randomUUID();
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Patterns for detecting and redacting sensitive data in error messages and logs
 * Requirements: 11.4, 11.5
 */
const SENSITIVE_DATA_PATTERNS = [
  /client_secret[=:]\s*[^\s&]+/gi,
  /refresh_token[=:]\s*[^\s&]+/gi,
  /access_token[=:]\s*[^\s&]+/gi,
  /session_secret[=:]\s*[^\s&]+/gi,
  /authorization[=:]\s*Bearer\s+[^\s&]+/gi,
  /bearer\s+[^\s&]+/gi,
  /api[_-]?key[=:]\s*[^\s&]+/gi,
  /password[=:]\s*[^\s&]+/gi,
  /secret[=:]\s*[^\s&]+/gi,
  /token[=:]\s*[^\s&]+/gi,
  /code_verifier[=:]\s*[^\s&]+/gi,
];

/**
 * Redact sensitive data from strings
 * Requirements: 11.4, 11.5
 */
export function redactSensitiveData(input: string): string {
  let redacted = input;
  
  for (const pattern of SENSITIVE_DATA_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      // Check if it has an = or : separator
      const separatorMatch = match.match(/([^=:]+)[=:]/);
      if (separatorMatch) {
        const key = separatorMatch[1];
        return `${key}=[REDACTED]`;
      }
      // For bearer tokens and other patterns without separator
      return '[REDACTED]';
    });
  }
  
  return redacted;
}

/**
 * Recursively redact sensitive data from objects
 * Requirements: 11.4, 11.5
 */
export function redactSensitiveDataFromObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveDataFromObject(item));
  }

  const redacted: any = {};
  const sensitiveKeys = [
    'client_secret',
    'clientSecret',
    'refresh_token',
    'refreshToken',
    'access_token',
    'accessToken',
    'session_secret',
    'sessionSecret',
    'SESSION_SECRET',
    'authorization',
    'bearer',
    'apiKey',
    'api_key',
    'password',
    'secret',
    'token',
    'code_verifier',
    'codeVerifier',
  ];

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key exactly matches or contains sensitive pattern
    // But exclude keys that are just plurals (like "tokens" which should not match "token")
    const isSensitive = sensitiveKeys.some(sk => {
      const lowerSk = sk.toLowerCase();
      return lowerKey === lowerSk || (lowerKey.includes(lowerSk) && lowerKey !== lowerSk + 's');
    });
    
    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = redactSensitiveData(value);
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveDataFromObject(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Add correlation ID to request
 * Requirements: 11.5
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate or extract correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  
  // Attach to request for use in handlers
  (req as any).correlationId = correlationId;
  
  // Set response header
  res.setHeader('X-Correlation-Id', correlationId);
  
  next();
}

/**
 * OAuth-specific error handler middleware
 * Handles OAuth errors with correlation IDs, user-friendly messages, and sensitive data redaction
 * Requirements: 11.1, 11.4, 11.5
 */
export const oauthErrorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  // Extract or generate correlation ID
  const correlationId = (req as any).correlationId || (err as any).correlationId || crypto.randomUUID();

  // Default error response
  let statusCode = 500;
  let errorCode = OAuthErrorCodes.INTERNAL_ERROR;
  let errorMessage = 'An unexpected error occurred';
  let details: Record<string, any> | undefined;

  // Handle OAuthError instances
  if (err instanceof OAuthError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    errorMessage = err.message;
    details = err.details;

    // Log operational OAuth errors with correlation ID
    logger.warn('OAuth operational error', {
      correlationId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      details: redactSensitiveDataFromObject(err.details),
    });
  } else {
    // Handle generic errors - extract OAuth-related info if available
    const originalMessage = (err.message || '').toLowerCase();
    const errorName = err.name || '';

    // Map common error patterns to OAuth error codes
    if (originalMessage.includes('state') && originalMessage.includes('invalid')) {
      statusCode = 403;
      errorCode = OAuthErrorCodes.INVALID_STATE;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.INVALID_STATE];
    } else if (originalMessage.includes('state') && originalMessage.includes('expired')) {
      statusCode = 403;
      errorCode = OAuthErrorCodes.STATE_EXPIRED;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.STATE_EXPIRED];
    } else if (originalMessage.includes('redirect_uri_mismatch')) {
      statusCode = 400;
      errorCode = OAuthErrorCodes.REDIRECT_URI_MISMATCH;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.REDIRECT_URI_MISMATCH];
    } else if (originalMessage.includes('token exchange')) {
      statusCode = 401;
      errorCode = OAuthErrorCodes.TOKEN_EXCHANGE_FAILED;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.TOKEN_EXCHANGE_FAILED];
    } else if (originalMessage.includes('code') && originalMessage.includes('used')) {
      statusCode = 400;
      errorCode = OAuthErrorCodes.AUTHORIZATION_CODE_USED;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.AUTHORIZATION_CODE_USED];
    } else if (originalMessage.includes('refresh token')) {
      if (originalMessage.includes('expired') || originalMessage.includes('revoked')) {
        statusCode = 401;
        errorCode = OAuthErrorCodes.REFRESH_TOKEN_EXPIRED;
        errorMessage = OAuthErrorMessages[OAuthErrorCodes.REFRESH_TOKEN_EXPIRED];
      } else if (originalMessage.includes('not found')) {
        statusCode = 401;
        errorCode = OAuthErrorCodes.REFRESH_TOKEN_NOT_FOUND;
        errorMessage = OAuthErrorMessages[OAuthErrorCodes.REFRESH_TOKEN_NOT_FOUND];
      } else {
        statusCode = 401;
        errorCode = OAuthErrorCodes.REFRESH_TOKEN_INVALID;
        errorMessage = OAuthErrorMessages[OAuthErrorCodes.REFRESH_TOKEN_INVALID];
      }
    } else if (originalMessage.includes('session')) {
      if (originalMessage.includes('expired')) {
        statusCode = 401;
        errorCode = OAuthErrorCodes.SESSION_EXPIRED;
        errorMessage = OAuthErrorMessages[OAuthErrorCodes.SESSION_EXPIRED];
      } else {
        statusCode = 401;
        errorCode = OAuthErrorCodes.NO_VALID_SESSION;
        errorMessage = OAuthErrorMessages[OAuthErrorCodes.NO_VALID_SESSION];
      }
    } else if (originalMessage.includes('firebase')) {
      statusCode = 500;
      errorCode = OAuthErrorCodes.FIREBASE_TOKEN_FAILED;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.FIREBASE_TOKEN_FAILED];
    } else if (originalMessage.includes('encrypt')) {
      statusCode = 500;
      errorCode = OAuthErrorCodes.ENCRYPTION_FAILED;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.ENCRYPTION_FAILED];
    } else if (originalMessage.includes('decrypt')) {
      statusCode = 401;
      errorCode = OAuthErrorCodes.DECRYPTION_FAILED;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.DECRYPTION_FAILED];
    } else if (originalMessage.includes('rate limit') || errorName === 'RateLimitError') {
      statusCode = 429;
      errorCode = OAuthErrorCodes.RATE_LIMIT_EXCEEDED;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.RATE_LIMIT_EXCEEDED];
    } else if (originalMessage.includes('unavailable') || statusCode === 503) {
      statusCode = 503;
      errorCode = OAuthErrorCodes.SERVICE_UNAVAILABLE;
      errorMessage = OAuthErrorMessages[OAuthErrorCodes.SERVICE_UNAVAILABLE];
    }

    // Log unhandled OAuth errors with full context
    logger.error('OAuth unhandled error', err, {
      correlationId,
      code: errorCode,
      statusCode,
      path: req.path,
      method: req.method,
      originalError: err.name,
      // Redact sensitive data from the entire error object
      stack: isProduction() ? undefined : err.stack,
    });
  }

  // Build error response
  const errorResponse: OAuthErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      correlationId,
      timestamp: new Date().toISOString(),
    },
  };

  // Include sanitized details in non-production or if explicitly provided
  if (!isProduction() && details) {
    errorResponse.error.details = redactSensitiveDataFromObject(details);
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Factory function to create OAuthError instances
 * Requirements: 11.1, 11.4
 */
export function createOAuthError(
  code: keyof typeof OAuthErrorCodes,
  statusCode: number,
  correlationId?: string,
  details?: Record<string, any>
): OAuthError {
  return new OAuthError(
    OAuthErrorCodes[code],
    statusCode,
    OAuthErrorMessages[OAuthErrorCodes[code]],
    correlationId,
    details
  );
}

/**
 * Helper to throw specific OAuth errors with correlation ID from request
 * Requirements: 11.1, 11.5
 */
export function throwOAuthError(
  req: Request,
  code: keyof typeof OAuthErrorCodes,
  statusCode: number,
  details?: Record<string, any>
): never {
  const correlationId = (req as any).correlationId || crypto.randomUUID();
  throw createOAuthError(code, statusCode, correlationId, details);
}

export default oauthErrorHandler;
