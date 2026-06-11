import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenExchangeService } from '../TokenExchangeService';

/**
 * Unit tests for TokenExchangeService
 * 
 * Tests cover:
 * - Token exchange with valid authorization code
 * - Token exchange with invalid authorization code
 * - Token exchange with network errors and retry logic
 * - User info retrieval with valid/invalid access token
 * - Token refresh with valid/expired refresh token
 * - Error handling and sanitization
 * - Retry logic with exponential backoff
 * 
 * Requirements tested: 2.5, 2.6, 2.7, 6.6, 11.2, 11.3, 15.3, 15.9
 */

describe('TokenExchangeService', () => {
  let service: TokenExchangeService;
  let mockOAuth2Client: any;

  beforeEach(() => {
    // Create service instance with test configuration
    service = new TokenExchangeService({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/callback',
      maxRetries: 3,
      timeout: 30000,
    });

    // Access the private oauth2Client for mocking
    mockOAuth2Client = (service as any).oauth2Client;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exchangeCodeForTokens', () => {
    it('should successfully exchange authorization code for tokens', async () => {
      // Requirement 2.5: Exchange authorization code using code_verifier
      const mockTokens = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'openid email profile',
      };

      // Mock the getToken method
      mockOAuth2Client.getToken = vi.fn().mockResolvedValue({
        tokens: mockTokens,
      });

      const result = await service.exchangeCodeForTokens(
        'test-authorization-code',
        'test-code-verifier',
        'test-correlation-id'
      );

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.scope).toBe('openid email profile');
      expect(result.expiresIn).toBeGreaterThan(Date.now());

      // Verify getToken was called with correct parameters
      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith({
        code: 'test-authorization-code',
        codeVerifier: 'test-code-verifier',
      });
      expect(mockOAuth2Client.getToken).toHaveBeenCalledTimes(1);
    });

    it('should throw error if access token is missing from response', async () => {
      // Mock response without access_token
      mockOAuth2Client.getToken = vi.fn().mockResolvedValue({
        tokens: {
          refresh_token: 'mock-refresh-token',
        },
      });

      await expect(
        service.exchangeCodeForTokens('code', 'verifier')
      ).rejects.toThrow('Token exchange failed: No access token received');
    });

    it('should handle authorization code reuse error', async () => {
      // Requirement 11.6: Handle authorization code already used
      const reuseError = new Error('invalid_grant: code was already redeemed');
      mockOAuth2Client.getToken = vi.fn().mockRejectedValue(reuseError);

      await expect(
        service.exchangeCodeForTokens('reused-code', 'verifier')
      ).rejects.toThrow('Authorization code has already been used');
    });

    it('should handle redirect_uri_mismatch error', async () => {
      // Requirement 12.3: Handle redirect_uri_mismatch error
      const redirectError = {
        message: 'redirect_uri_mismatch',
        response: {
          data: {
            error: 'redirect_uri_mismatch',
          },
        },
      };
      mockOAuth2Client.getToken = vi.fn().mockRejectedValue(redirectError);

      await expect(
        service.exchangeCodeForTokens('code', 'verifier')
      ).rejects.toThrow('OAuth configuration error: redirect URI not authorized');
    });

    it('should retry on network timeout error', async () => {
      // Requirement 11.2: Retry with exponential backoff on network failures
      const timeoutError = new Error('Request timeout');
      
      // Mock: Fail first 2 attempts, succeed on 3rd
      let callCount = 0;
      mockOAuth2Client.getToken = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(timeoutError);
        }
        return Promise.resolve({
          tokens: {
            access_token: 'success-after-retry',
            refresh_token: 'refresh-token',
            expiry_date: Date.now() + 3600000,
            token_type: 'Bearer',
          },
        });
      });

      // Mock sleep to avoid waiting in tests
      const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      const result = await service.exchangeCodeForTokens('code', 'verifier');

      expect(result.accessToken).toBe('success-after-retry');
      expect(mockOAuth2Client.getToken).toHaveBeenCalledTimes(3);
      
      // Verify exponential backoff: 1s, 2s
      expect(sleepSpy).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000); // 2^0 * 1000 = 1s
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000); // 2^1 * 1000 = 2s
    });

    it('should throw service unavailable after max retries', async () => {
      // Requirement 11.3: All retry exhaustion returns 503
      const timeoutError = new Error('Request timeout');
      mockOAuth2Client.getToken = vi.fn().mockRejectedValue(timeoutError);

      // Mock sleep to avoid waiting
      vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await expect(
        service.exchangeCodeForTokens('code', 'verifier')
      ).rejects.toThrow('Authentication service temporarily unavailable');

      expect(mockOAuth2Client.getToken).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx client errors', async () => {
      // 4xx errors are not retryable
      const clientError: any = new Error('invalid_client');
      clientError.response = { status: 400 };
      
      mockOAuth2Client.getToken = vi.fn().mockRejectedValue(clientError);

      await expect(
        service.exchangeCodeForTokens('code', 'verifier')
      ).rejects.toThrow();

      // Should not retry - only 1 call
      expect(mockOAuth2Client.getToken).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx server errors', async () => {
      // 5xx errors are retryable
      const serverError: any = new Error('Internal Server Error');
      serverError.response = { status: 500 };
      
      let callCount = 0;
      mockOAuth2Client.getToken = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(serverError);
        }
        return Promise.resolve({
          tokens: {
            access_token: 'success-after-server-error',
            refresh_token: 'refresh-token',
            expiry_date: Date.now() + 3600000,
            token_type: 'Bearer',
          },
        });
      });

      vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      const result = await service.exchangeCodeForTokens('code', 'verifier');

      expect(result.accessToken).toBe('success-after-server-error');
      expect(mockOAuth2Client.getToken).toHaveBeenCalledTimes(2);
    });

    it('should sanitize error messages to prevent token leakage', async () => {
      // Sensitive data should be redacted from error messages
      const sensitiveError = new Error('Token exchange failed with access_token=abc123xyz456 and refresh_token=def789');
      mockOAuth2Client.getToken = vi.fn().mockRejectedValue(sensitiveError);

      try {
        await service.exchangeCodeForTokens('code', 'verifier');
        throw new Error('Should have thrown error');
      } catch (error) {
        // Error message should have tokens redacted
        expect((error as Error).message).not.toContain('abc123xyz456');
        expect((error as Error).message).not.toContain('def789');
        expect((error as Error).message).toContain('[REDACTED]');
      }
    });
  });

  describe('getUserInfo', () => {
    beforeEach(() => {
      // Mock fetch globally
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should successfully retrieve user information', async () => {
      // Requirement 2.7: Request user information from Google using access_token
      const mockUserInfo = {
        id: 'google-user-id-123',
        email: 'test@example.com',
        verified_email: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/picture.jpg',
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockUserInfo,
      });

      const result = await service.getUserInfo('mock-access-token');

      expect(result).toBeDefined();
      expect(result.sub).toBe('google-user-id-123');
      expect(result.email).toBe('test@example.com');
      expect(result.email_verified).toBe(true);
      expect(result.name).toBe('Test User');
      expect(result.given_name).toBe('Test');
      expect(result.family_name).toBe('User');
      expect(result.picture).toBe('https://example.com/picture.jpg');

      // Verify fetch was called with correct parameters
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer mock-access-token',
          },
        })
      );
    });

    it('should handle missing required fields in user info response', async () => {
      // Missing email field
      const incompleteUserInfo = {
        id: 'google-user-id-123',
        // email missing
        name: 'Test User',
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => incompleteUserInfo,
      });

      await expect(
        service.getUserInfo('mock-access-token')
      ).rejects.toThrow('User info request failed: Missing required fields');
    });

    it('should handle HTTP error responses', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(
        service.getUserInfo('invalid-access-token')
      ).rejects.toThrow('User info request failed with status 401');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(
        service.getUserInfo('mock-access-token')
      ).rejects.toThrow();
    });

    it('should provide default values for optional fields', async () => {
      // Minimal user info (only required fields)
      const minimalUserInfo = {
        id: 'google-user-id-123',
        email: 'test@example.com',
        // Optional fields missing
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => minimalUserInfo,
      });

      const result = await service.getUserInfo('mock-access-token');

      expect(result.sub).toBe('google-user-id-123');
      expect(result.email).toBe('test@example.com');
      expect(result.email_verified).toBe(false); // Default
      expect(result.name).toBe(''); // Default
      expect(result.given_name).toBe(''); // Default
      expect(result.family_name).toBe(''); // Default
      expect(result.picture).toBe(''); // Default
    });
  });

  describe('refreshAccessToken', () => {
    it('should successfully refresh access token', async () => {
      // Requirement 6.6: Request new access_token using refresh_token
      const mockCredentials = {
        access_token: 'new-access-token',
        expiry_date: Date.now() + 3600000,
      };

      mockOAuth2Client.setCredentials = vi.fn();
      mockOAuth2Client.refreshAccessToken = vi.fn().mockResolvedValue({
        credentials: mockCredentials,
      });

      const result = await service.refreshAccessToken('mock-refresh-token', 'correlation-id');

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('new-access-token');
      expect(result.expiresIn).toBeGreaterThan(Date.now());

      // Verify refresh token was set
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: 'mock-refresh-token',
      });
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should throw error if access token is missing from refresh response', async () => {
      mockOAuth2Client.setCredentials = vi.fn();
      mockOAuth2Client.refreshAccessToken = vi.fn().mockResolvedValue({
        credentials: {
          // access_token missing
        },
      });

      await expect(
        service.refreshAccessToken('mock-refresh-token')
      ).rejects.toThrow('Token refresh failed: No access token received');
    });

    it('should handle expired refresh token error', async () => {
      // Requirement 6.7: Return error if refresh token is expired or revoked
      const expiredError = new Error('invalid_grant: Token has been expired or revoked');
      mockOAuth2Client.setCredentials = vi.fn();
      mockOAuth2Client.refreshAccessToken = vi.fn().mockRejectedValue(expiredError);

      await expect(
        service.refreshAccessToken('expired-refresh-token')
      ).rejects.toThrow('Refresh token expired, please re-authenticate');
    });

    it('should retry on network errors', async () => {
      // Retry logic for token refresh
      const networkError = new Error('ECONNRESET');
      (networkError as any).code = 'ECONNRESET';

      let callCount = 0;
      mockOAuth2Client.setCredentials = vi.fn();
      mockOAuth2Client.refreshAccessToken = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(networkError);
        }
        return Promise.resolve({
          credentials: {
            access_token: 'success-after-retry',
            expiry_date: Date.now() + 3600000,
          },
        });
      });

      vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      const result = await service.refreshAccessToken('mock-refresh-token');

      expect(result.accessToken).toBe('success-after-retry');
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should throw service unavailable after max retries on refresh', async () => {
      // Requirement 11.3: All retry exhaustion returns 503
      const timeoutError = new Error('Request timeout');
      mockOAuth2Client.setCredentials = vi.fn();
      mockOAuth2Client.refreshAccessToken = vi.fn().mockRejectedValue(timeoutError);

      vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      await expect(
        service.refreshAccessToken('mock-refresh-token')
      ).rejects.toThrow('Authentication service temporarily unavailable');

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(3);
    });

    it('should not retry on expired token error', async () => {
      // Expired token is not retryable
      const expiredError = new Error('invalid_grant: token_expired');
      mockOAuth2Client.setCredentials = vi.fn();
      mockOAuth2Client.refreshAccessToken = vi.fn().mockRejectedValue(expiredError);

      await expect(
        service.refreshAccessToken('expired-token')
      ).rejects.toThrow('Refresh token expired, please re-authenticate');

      // Should not retry - only 1 call
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should identify retryable errors correctly', () => {
      const isRetryableError = (service as any).isRetryableError.bind(service);

      // Timeout errors are retryable
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);

      // Network errors are retryable
      const networkError: any = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';
      expect(isRetryableError(networkError)).toBe(true);

      // 5xx server errors are retryable
      const serverError: any = new Error('Server error');
      serverError.response = { status: 500 };
      expect(isRetryableError(serverError)).toBe(true);

      // 4xx client errors are not retryable
      const clientError: any = new Error('Client error');
      clientError.response = { status: 400 };
      expect(isRetryableError(clientError)).toBe(false);

      // Generic errors are not retryable
      expect(isRetryableError(new Error('Generic error'))).toBe(false);
    });

    it('should sanitize error messages with tokens', () => {
      const sanitizeError = (service as any).sanitizeError.bind(service);

      const error = new Error('Failed with access_token=abc123xyz456789 and client_secret=secret123');
      const sanitized = sanitizeError(error, 'Default message');

      // Tokens should be redacted
      expect(sanitized.message).not.toContain('abc123xyz456789');
      expect(sanitized.message).not.toContain('secret123');
      expect(sanitized.message).toContain('[REDACTED]');
    });

    it('should use default message if original is empty', () => {
      const sanitizeError = (service as any).sanitizeError.bind(service);

      const error = new Error('');
      const sanitized = sanitizeError(error, 'Default message');

      expect(sanitized.message).toContain('Default message');
    });
  });

  describe('timeout handling', () => {
    it('should timeout token exchange after specified duration', async () => {
      // Create service with short timeout
      const shortTimeoutService = new TokenExchangeService({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/callback',
        maxRetries: 3,
        timeout: 100, // 100ms timeout
      });

      const mockClient = (shortTimeoutService as any).oauth2Client;

      // Mock a slow response (longer than timeout)
      mockClient.getToken = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({
          tokens: { access_token: 'slow-token' }
        }), 200)) // 200ms delay
      );

      // Mock sleep to avoid waiting in tests
      vi.spyOn(shortTimeoutService as any, 'sleep').mockResolvedValue(undefined);

      // Should timeout and after retries throw service unavailable
      await expect(
        shortTimeoutService.exchangeCodeForTokens('code', 'verifier')
      ).rejects.toThrow('Authentication service temporarily unavailable');
      
      // Should have retried 3 times (timeout is retryable)
      expect(mockClient.getToken).toHaveBeenCalledTimes(3);
    });
  });
});
