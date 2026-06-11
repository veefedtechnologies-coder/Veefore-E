/**
 * TokenExchangeService
 * 
 * Service responsible for exchanging authorization codes for access and refresh tokens,
 * retrieving user information from Google, and refreshing expired access tokens.
 * 
 * Security features:
 * - Implements PKCE (Proof Key for Code Exchange) for authorization code flow
 * - Retry logic with exponential backoff for network failures
 * - 30-second timeout for token exchange requests
 * - Sensitive data redaction in logs (never logs access_token or refresh_token)
 * 
 * Requirements: 2.5, 2.6, 2.7, 6.6, 11.2, 11.3, 17.5, 18.2, 18.3, 18.5
 */

import { google, Auth } from 'googleapis';
import { logger } from '../../config/logger';

/**
 * Result of successful token exchange
 */
export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string | null | undefined;
  expiresIn: number;
  tokenType: string;
  scope: string | null | undefined;
}

/**
 * Google user information from OAuth
 */
export interface GoogleUserInfo {
  sub: string;          // Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
}

/**
 * Result of token refresh operation
 */
export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
}

/**
 * Token exchange service configuration
 */
interface TokenExchangeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Service for handling OAuth token exchange operations with Google
 */
export class TokenExchangeService {
  private oauth2Client: any; // Using any to avoid type conflicts between googleapis versions
  private maxRetries: number;
  private timeout: number;

  /**
   * Creates a new TokenExchangeService instance
   * 
   * @param config - Service configuration with OAuth credentials
   */
  constructor(config: TokenExchangeConfig) {
    // Initialize OAuth2Client from googleapis
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    // Configuration for retry logic and timeouts
    this.maxRetries = config.maxRetries ?? 3;
    this.timeout = config.timeout ?? 30000; // 30 seconds default
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * 
   * Implements PKCE by including the code_verifier parameter that matches
   * the code_challenge sent in the authorization request.
   * 
   * Implements exponential backoff retry: 1s, 2s, 4s for transient failures.
   * 
   * @param code - Authorization code from Google OAuth callback
   * @param codeVerifier - PKCE code verifier that matches the code_challenge
   * @param correlationId - Request correlation ID for debugging
   * @returns Token exchange result with access token and refresh token
   * @throws Error if token exchange fails after all retries
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    correlationId?: string
  ): Promise<TokenExchangeResult> {
    const startTime = Date.now();

    // Requirement 18.2: Log token exchange operation with INFO level
    logger.debug('Starting token exchange', {
      component: 'OAuth.TokenExchange',
      requestId: correlationId,
    });

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Attempt token exchange with timeout
        const result = await this.executeWithTimeout(
          this.oauth2Client.getToken({
            code,
            codeVerifier: codeVerifier,
          }),
          this.timeout
        ) as any;

        const { tokens } = result;

        // Validate token response structure
        if (!tokens.access_token) {
          throw new Error('Token exchange failed: No access token received');
        }

        const durationMs = Date.now() - startTime;

        // Requirement 18.2: Log successful token exchange with INFO level
        logger.info('Token exchange successful', {
          component: 'OAuth.TokenExchange',
          requestId: correlationId,
          durationMs,
          hasRefreshToken: !!tokens.refresh_token,
        });

        // Return structured token result
        // NOTE: Sensitive data redaction - never log access_token or refresh_token
        return {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expiry_date ?? Date.now() + 3600000, // Default 1 hour
          tokenType: tokens.token_type ?? 'Bearer',
          scope: tokens.scope,
        };
      } catch (error) {
        const errorMessage = (error as any).message?.toLowerCase() || '';
        const errorResponse = (error as any).response?.data || {};

        // Check for specific OAuth errors from Google
        // Requirement 11.6: Handle authorization code reuse
        if (errorMessage.includes('invalid_grant') || errorMessage.includes('code was already redeemed')) {
          const codeReuseError = new Error('Authorization code has already been used');
          (codeReuseError as any).code = 'AUTHORIZATION_CODE_USED';
          (codeReuseError as any).statusCode = 400;
          
          // Requirement 18.3: Log token exchange failure with ERROR level
          logger.error('Token exchange failed: authorization code reused', codeReuseError, {
            component: 'OAuth.TokenExchange',
            requestId: correlationId,
            errorType: 'authorization_code_used',
          });
          
          throw codeReuseError;
        }

        // Requirement 12.3: Handle redirect_uri_mismatch error from Google
        if (errorMessage.includes('redirect_uri_mismatch') || errorResponse.error === 'redirect_uri_mismatch') {
          const redirectError = new Error('OAuth configuration error: redirect URI not authorized');
          (redirectError as any).code = 'REDIRECT_URI_MISMATCH';
          (redirectError as any).statusCode = 400;
          
          // Requirement 18.3: Log configuration error with ERROR level
          logger.error('Token exchange failed: redirect URI mismatch', redirectError, {
            component: 'OAuth.TokenExchange',
            requestId: correlationId,
            errorType: 'redirect_uri_mismatch',
          });
          
          throw redirectError;
        }

        // Determine if error is retryable (network errors, 5xx responses)
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === this.maxRetries - 1) {
          // Non-retryable error or last retry
          // Requirement 11.3: All retry exhaustion returns 503
          if (attempt === this.maxRetries - 1 && isRetryable) {
            const exhaustionError = new Error('Authentication service temporarily unavailable');
            (exhaustionError as any).code = 'SERVICE_UNAVAILABLE';
            (exhaustionError as any).statusCode = 503;
            
            // Requirement 18.3: Log retry exhaustion with ERROR level
            logger.error('Token exchange failed: retry exhaustion', exhaustionError, {
              component: 'OAuth.TokenExchange',
              requestId: correlationId,
              errorType: 'retry_exhaustion',
              attempts: this.maxRetries,
            });
            
            throw exhaustionError;
          }
          // Non-retryable error - throw immediately
          const sanitizedError = this.sanitizeError(error, 'Token exchange failed');
          
          logger.error('Token exchange failed', sanitizedError, {
            component: 'OAuth.TokenExchange',
            requestId: correlationId,
            errorType: sanitizedError.name,
          });
          
          throw sanitizedError;
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt) * 1000;
        
        logger.warn('Token exchange retry', {
          component: 'OAuth.TokenExchange',
          requestId: correlationId,
          errorType: (error as Error).name,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          retryInMs: backoffMs,
        });
        
        await this.sleep(backoffMs);
      }
    }

    // All retries exhausted (should not reach here due to check above, but for safety)
    const exhaustionError = new Error('Authentication service temporarily unavailable');
    (exhaustionError as any).code = 'SERVICE_UNAVAILABLE';
    (exhaustionError as any).statusCode = 503;
    
    logger.error('Token exchange failed: retry exhaustion', exhaustionError, {
      component: 'OAuth.TokenExchange',
      requestId: correlationId,
      errorType: 'retry_exhaustion',
      attempts: this.maxRetries,
    });
    
    throw exhaustionError;
  }

  /**
   * Get user information from Google using access token
   * 
   * @param accessToken - Google access token from token exchange
   * @returns User profile information from Google
   * @throws Error if user info request fails
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    try {
      // Use direct API call to Google userinfo endpoint instead of SDK
      // This avoids type conflicts between googleapis versions
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`User info request failed with status ${response.status}`);
      }

      const userInfo = await response.json() as any;

      // Validate required fields
      if (!userInfo.email || !userInfo.id) {
        throw new Error('User info request failed: Missing required fields');
      }

      // Return structured user info
      return {
        sub: userInfo.id,
        email: userInfo.email,
        email_verified: userInfo.verified_email ?? false,
        name: userInfo.name ?? '',
        picture: userInfo.picture ?? '',
        given_name: userInfo.given_name ?? '',
        family_name: userInfo.family_name ?? '',
      };
    } catch (error) {
      throw this.sanitizeError(error, 'Failed to get user information');
    }
  }

  /**
   * Refresh access token using refresh token
   * 
   * @param refreshToken - Google refresh token stored in database
   * @param correlationId - Request correlation ID for debugging
   * @returns New access token and expiration time
   * @throws Error if refresh fails (token expired, revoked, or invalid)
   */
  async refreshAccessToken(refreshToken: string, correlationId?: string): Promise<RefreshResult> {
    const startTime = Date.now();

    // Requirement 18.5: Log refresh token operation with INFO level
    logger.debug('Starting token refresh', {
      component: 'OAuth.TokenRefresh',
      requestId: correlationId,
    });

    // Retry logic with exponential backoff: 1s, 2s, 4s
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Set refresh token in OAuth2 client
        this.oauth2Client.setCredentials({ refresh_token: refreshToken });

        // Request new access token
        const result = await this.executeWithTimeout(
          this.oauth2Client.refreshAccessToken(),
          this.timeout
        ) as any;

        const { credentials } = result;

        // Validate response
        if (!credentials.access_token) {
          throw new Error('Token refresh failed: No access token received');
        }

        const durationMs = Date.now() - startTime;

        // Requirement 18.5: Log successful token refresh with INFO level
        logger.info('Token refresh successful', {
          component: 'OAuth.TokenRefresh',
          requestId: correlationId,
          durationMs,
        });

        // Return new access token
        // NOTE: Sensitive data redaction - never log access_token
        return {
          accessToken: credentials.access_token,
          expiresIn: credentials.expiry_date ?? Date.now() + 3600000,
        };
      } catch (error) {
        // Check for specific error conditions
        const errorMessage = (error as Error).message?.toLowerCase() || '';
        
        // Non-retryable errors: invalid_grant (expired/revoked token)
        if (errorMessage.includes('invalid_grant') || errorMessage.includes('token_expired')) {
          // Requirement 18.5: Log refresh failure with ERROR level
          logger.error('Token refresh failed: refresh token expired', error, {
            component: 'OAuth.TokenRefresh',
            requestId: correlationId,
            errorType: 'refresh_token_expired',
          });
          
          throw new Error('Refresh token expired, please re-authenticate');
        }

        // Determine if error is retryable
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === this.maxRetries - 1) {
          // Requirement 11.3: All retry exhaustion returns 503
          if (attempt === this.maxRetries - 1 && isRetryable) {
            const exhaustionError = new Error('Authentication service temporarily unavailable');
            (exhaustionError as any).code = 'SERVICE_UNAVAILABLE';
            (exhaustionError as any).statusCode = 503;
            
            logger.error('Token refresh failed: retry exhaustion', exhaustionError, {
              component: 'OAuth.TokenRefresh',
              requestId: correlationId,
              errorType: 'retry_exhaustion',
              attempts: this.maxRetries,
            });
            
            throw exhaustionError;
          }
          
          const sanitizedError = this.sanitizeError(error, 'Token refresh failed');
          
          logger.error('Token refresh failed', sanitizedError, {
            component: 'OAuth.TokenRefresh',
            requestId: correlationId,
            errorType: sanitizedError.name,
          });
          
          throw sanitizedError;
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt) * 1000;
        
        logger.warn('Token refresh retry', {
          component: 'OAuth.TokenRefresh',
          requestId: correlationId,
          errorType: (error as Error).name,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          retryInMs: backoffMs,
        });
        
        await this.sleep(backoffMs);
      }
    }

    // All retries exhausted (should not reach here due to check above, but for safety)
    const exhaustionError = new Error('Authentication service temporarily unavailable');
    (exhaustionError as any).code = 'SERVICE_UNAVAILABLE';
    (exhaustionError as any).statusCode = 503;
    
    logger.error('Token refresh failed: retry exhaustion', exhaustionError, {
      component: 'OAuth.TokenRefresh',
      requestId: correlationId,
      errorType: 'retry_exhaustion',
      attempts: this.maxRetries,
    });
    
    throw exhaustionError;
  }

  /**
   * Execute a promise with timeout
   * 
   * @param promise - Promise to execute
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise result
   * @throws Error if timeout is exceeded
   */
  private executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Determine if an error is retryable
   * 
   * Retryable errors:
   * - Network timeouts
   * - 5xx server errors from Google
   * - Connection errors
   * 
   * Non-retryable errors:
   * - 4xx client errors (invalid code, invalid grant, etc.)
   * - Invalid request format
   * 
   * @param error - Error to check
   * @returns True if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    const err = error as any;

    // Check for timeout
    if (err.message?.includes('timeout')) {
      return true;
    }

    // Check for network errors
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      return true;
    }

    // Check for 5xx server errors
    if (err.response?.status && err.response.status >= 500) {
      return true;
    }

    // 4xx errors are not retryable
    return false;
  }

  /**
   * Sanitize error message to prevent sensitive data leakage
   * 
   * Removes any potential tokens or secrets from error messages before logging.
   * 
   * @param error - Original error
   * @param defaultMessage - Default error message if sanitization removes all context
   * @returns Sanitized error
   */
  private sanitizeError(error: unknown, defaultMessage: string): Error {
    const err = error as Error;
    let message = err.message || defaultMessage;

    // Remove any potential tokens from error message
    // Pattern matches: token-like strings (base64, hex, etc.)
    message = message.replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]');
    
    // Remove common secret patterns
    message = message.replace(/(client_secret|access_token|refresh_token|api_key)=[^&\s]*/gi, '$1=[REDACTED]');

    return new Error(message);
  }

  /**
   * Sleep for specified milliseconds
   * 
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create TokenExchangeService instance from environment variables
 * 
 * @returns Configured TokenExchangeService instance
 * @throws Error if required environment variables are missing
 */
export function createTokenExchangeService(): TokenExchangeService {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_CALLBACK_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing required OAuth environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_CALLBACK_URL'
    );
  }

  return new TokenExchangeService({
    clientId,
    clientSecret,
    redirectUri,
  });
}

// Export singleton instance for use across the application (skip in test environment)
export const tokenExchangeService = process.env.VITEST !== 'true' 
  ? createTokenExchangeService() 
  : null as any;
