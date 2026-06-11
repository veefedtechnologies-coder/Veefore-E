import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  oauthErrorHandler,
  OAuthError,
  OAuthErrorCodes,
  OAuthErrorMessages,
  redactSensitiveData,
  redactSensitiveDataFromObject,
  correlationIdMiddleware,
  createOAuthError,
  throwOAuthError,
} from '../oauthErrorHandler';

describe('OAuth Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let consoleErrorSpy: any;

  beforeEach(() => {
    mockRequest = {
      path: '/api/auth/google/callback',
      method: 'GET',
      headers: {},
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      headersSent: false,
    };

    mockNext = vi.fn();

    // Suppress console output during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('OAuthError Class', () => {
    it('should create OAuthError with all properties', () => {
      const error = new OAuthError(
        OAuthErrorCodes.INVALID_STATE,
        403,
        'Custom message',
        'test-correlation-id',
        { detail: 'test' }
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OAuthError);
      expect(error.code).toBe(OAuthErrorCodes.INVALID_STATE);
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Custom message');
      expect(error.correlationId).toBe('test-correlation-id');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.isOperational).toBe(true);
    });

    it('should use default message from OAuthErrorMessages', () => {
      const error = new OAuthError(OAuthErrorCodes.TOKEN_EXCHANGE_FAILED, 401);

      expect(error.message).toBe(OAuthErrorMessages[OAuthErrorCodes.TOKEN_EXCHANGE_FAILED]);
    });

    it('should generate correlation ID if not provided', () => {
      const error = new OAuthError(OAuthErrorCodes.INTERNAL_ERROR, 500);

      expect(error.correlationId).toBeDefined();
      expect(error.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('Sensitive Data Redaction', () => {
    describe('redactSensitiveData', () => {
      it('should redact client_secret', () => {
        const input = 'client_secret=abc123xyz';
        const result = redactSensitiveData(input);
        expect(result).not.toContain('abc123xyz');
        expect(result).toContain('[REDACTED]');
      });

      it('should redact refresh_token', () => {
        const input = 'refresh_token=token123';
        const result = redactSensitiveData(input);
        expect(result).not.toContain('token123');
        expect(result).toContain('[REDACTED]');
      });

      it('should redact access_token', () => {
        const input = 'access_token=access123';
        const result = redactSensitiveData(input);
        expect(result).not.toContain('access123');
        expect(result).toContain('[REDACTED]');
      });

      it('should redact multiple sensitive values', () => {
        const input = 'client_secret=secret123&refresh_token=token456&access_token=access789';
        const result = redactSensitiveData(input);
        expect(result).not.toContain('secret123');
        expect(result).not.toContain('token456');
        expect(result).not.toContain('access789');
      });

      it('should redact bearer tokens', () => {
        const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
        const result = redactSensitiveData(input);
        expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      });

      it('should not modify non-sensitive data', () => {
        const input = 'username=john&email=john@example.com';
        const result = redactSensitiveData(input);
        expect(result).toBe(input);
      });
    });

    describe('redactSensitiveDataFromObject', () => {
      it('should redact sensitive keys in object', () => {
        const input = {
          client_secret: 'secret123',
          refresh_token: 'token456',
          username: 'john',
        };

        const result = redactSensitiveDataFromObject(input);

        expect(result.client_secret).toBe('[REDACTED]');
        expect(result.refresh_token).toBe('[REDACTED]');
        expect(result.username).toBe('john');
      });

      it('should redact nested sensitive data', () => {
        const input = {
          user: {
            username: 'john',
            credentials: {
              access_token: 'token123',
              password: 'pass456',
            },
          },
        };

        const result = redactSensitiveDataFromObject(input);

        expect(result.user.username).toBe('john');
        expect(result.user.credentials.access_token).toBe('[REDACTED]');
        expect(result.user.credentials.password).toBe('[REDACTED]');
      });

      it('should handle arrays', () => {
        const input = {
          tokens: [
            { access_token: 'token1' },
            { access_token: 'token2' },
          ],
        };

        const result = redactSensitiveDataFromObject(input);

        expect(result.tokens).toBeDefined();
        expect(result.tokens[0]).toBeDefined();
        expect(result.tokens[0].access_token).toBe('[REDACTED]');
        expect(result.tokens[1].access_token).toBe('[REDACTED]');
      });

      it('should redact camelCase sensitive keys', () => {
        const input = {
          clientSecret: 'secret123',
          refreshToken: 'token456',
          accessToken: 'access789',
        };

        const result = redactSensitiveDataFromObject(input);

        expect(result.clientSecret).toBe('[REDACTED]');
        expect(result.refreshToken).toBe('[REDACTED]');
        expect(result.accessToken).toBe('[REDACTED]');
      });

      it('should handle null and undefined', () => {
        expect(redactSensitiveDataFromObject(null)).toBe(null);
        expect(redactSensitiveDataFromObject(undefined)).toBe(undefined);
      });

      it('should handle primitives', () => {
        expect(redactSensitiveDataFromObject('string')).toBe('string');
        expect(redactSensitiveDataFromObject(123)).toBe(123);
        expect(redactSensitiveDataFromObject(true)).toBe(true);
      });
    });
  });

  describe('Correlation ID Middleware', () => {
    it('should generate correlation ID if not provided', () => {
      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).correlationId).toBeDefined();
      expect((mockRequest as any).correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Correlation-Id',
        (mockRequest as any).correlationId
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing correlation ID from header', () => {
      const existingId = 'existing-correlation-id';
      mockRequest.headers = { 'x-correlation-id': existingId };

      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).correlationId).toBe(existingId);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Correlation-Id', existingId);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handler Middleware', () => {
    it('should skip if headers already sent', () => {
      mockResponse.headersSent = true;
      const error = new Error('Test error');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should handle OAuthError with correlation ID', () => {
      const error = new OAuthError(
        OAuthErrorCodes.INVALID_STATE,
        403,
        'Invalid state',
        'test-correlation-id'
      );

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.INVALID_STATE,
            message: 'Invalid state',
            correlationId: 'test-correlation-id',
            timestamp: expect.any(String),
          }),
        })
      );
    });

    it('should map generic error with "state" and "invalid" to INVALID_STATE', () => {
      const error = new Error('Invalid state parameter');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.INVALID_STATE,
            message: OAuthErrorMessages[OAuthErrorCodes.INVALID_STATE],
          }),
        })
      );
    });

    it('should map generic error with "state" and "expired" to STATE_EXPIRED', () => {
      const error = new Error('State expired');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.STATE_EXPIRED,
          }),
        })
      );
    });

    it('should map redirect_uri_mismatch error', () => {
      const error = new Error('redirect_uri_mismatch');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.REDIRECT_URI_MISMATCH,
          }),
        })
      );
    });

    it('should map token exchange errors', () => {
      const error = new Error('token exchange failed');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.TOKEN_EXCHANGE_FAILED,
          }),
        })
      );
    });

    it('should map refresh token expired errors', () => {
      const error = new Error('refresh token expired');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.REFRESH_TOKEN_EXPIRED,
          }),
        })
      );
    });

    it('should map refresh token not found errors', () => {
      const error = new Error('refresh token not found');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.REFRESH_TOKEN_NOT_FOUND,
          }),
        })
      );
    });

    it('should map Firebase errors', () => {
      const error = new Error('Firebase token creation failed');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.FIREBASE_TOKEN_FAILED,
          }),
        })
      );
    });

    it('should map encryption errors', () => {
      const error = new Error('Failed to encrypt token');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.ENCRYPTION_FAILED,
          }),
        })
      );
    });

    it('should map decryption errors', () => {
      const error = new Error('Failed to decrypt token');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.DECRYPTION_FAILED,
          }),
        })
      );
    });

    it('should map session errors', () => {
      const error = new Error('session expired');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.SESSION_EXPIRED,
          }),
        })
      );
    });

    it('should map rate limit errors', () => {
      const error = new Error('rate limit exceeded');
      error.name = 'RateLimitError';

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.RATE_LIMIT_EXCEEDED,
          }),
        })
      );
    });

    it('should map service unavailable errors', () => {
      const error = new Error('service unavailable');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.SERVICE_UNAVAILABLE,
          }),
        })
      );
    });

    it('should default to INTERNAL_ERROR for unknown errors', () => {
      const error = new Error('Unknown error');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: OAuthErrorCodes.INTERNAL_ERROR,
          }),
        })
      );
    });

    it('should generate correlation ID if not present', () => {
      const error = new Error('Test error');

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            correlationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
          }),
        })
      );
    });

    it('should use correlation ID from request', () => {
      const error = new Error('Test error');
      (mockRequest as any).correlationId = 'request-correlation-id';

      oauthErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            correlationId: 'request-correlation-id',
          }),
        })
      );
    });
  });

  describe('Helper Functions', () => {
    describe('createOAuthError', () => {
      it('should create OAuthError with correct properties', () => {
        const error = createOAuthError(
          'INVALID_STATE',
          403,
          'test-id',
          { detail: 'test' }
        );

        expect(error).toBeInstanceOf(OAuthError);
        expect(error.code).toBe(OAuthErrorCodes.INVALID_STATE);
        expect(error.statusCode).toBe(403);
        expect(error.correlationId).toBe('test-id');
        expect(error.details).toEqual({ detail: 'test' });
      });
    });

    describe('throwOAuthError', () => {
      it('should throw OAuthError with request correlation ID', () => {
        (mockRequest as any).correlationId = 'request-id';

        expect(() => {
          throwOAuthError(
            mockRequest as Request,
            'TOKEN_EXCHANGE_FAILED',
            401,
            { detail: 'test' }
          );
        }).toThrow(OAuthError);

        try {
          throwOAuthError(
            mockRequest as Request,
            'TOKEN_EXCHANGE_FAILED',
            401
          );
        } catch (error) {
          expect((error as OAuthError).correlationId).toBe('request-id');
          expect((error as OAuthError).code).toBe(OAuthErrorCodes.TOKEN_EXCHANGE_FAILED);
          expect((error as OAuthError).statusCode).toBe(401);
        }
      });

      it('should generate correlation ID if not in request', () => {
        expect(() => {
          throwOAuthError(
            mockRequest as Request,
            'INTERNAL_ERROR',
            500
          );
        }).toThrow(OAuthError);

        try {
          throwOAuthError(mockRequest as Request, 'INTERNAL_ERROR', 500);
        } catch (error) {
          expect((error as OAuthError).correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        }
      });
    });
  });

  describe('Error Codes and Messages', () => {
    it('should have error message for every error code', () => {
      const codes = Object.values(OAuthErrorCodes);
      const messages = Object.keys(OAuthErrorMessages);

      codes.forEach(code => {
        expect(messages).toContain(code);
        expect(OAuthErrorMessages[code]).toBeDefined();
        expect(OAuthErrorMessages[code].length).toBeGreaterThan(0);
      });
    });

    it('should have user-friendly error messages', () => {
      const messages = Object.values(OAuthErrorMessages);

      messages.forEach(message => {
        // Should not contain technical terms like "CSRF", internal error codes, etc.
        expect(message).not.toMatch(/CSRF/i);
        expect(message).not.toMatch(/\bcode\b.*\berror\b/i);
        
        // Should be readable
        expect(message.length).toBeGreaterThan(10);
        expect(message.length).toBeLessThan(200);
      });
    });
  });
});
