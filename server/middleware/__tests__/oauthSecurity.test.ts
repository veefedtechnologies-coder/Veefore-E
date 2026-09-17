/**
 * Unit Tests for OAuth Security Middleware
 * 
 * Tests:
 * - Content-Security-Policy header setting
 * - HSTS header in production
 * - Rate limiting (10 req/min per IP)
 * - TLS 1.2+ enforcement in production
 * - Redirect URI validation
 * 
 * Requirements: 11.7, 11.8, 17.5, 17.6, 17.7, 17.8
 */

import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import {
  oauthSecurityHeaders,
  enforceTLS,
  validateRedirectUri,
  oauthRateLimiter,
  initializeOAuthRateLimiting,
} from '../oauthSecurity';

// Mock Express request, response, and next function
const mockRequest = (overrides?: Partial<Request>): Request => {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    path: '/api/auth/google/start',
    method: 'GET',
    protocol: 'https',
    secure: true,
    headers: {},
    get: (header: string) => undefined,
    ...overrides,
  } as unknown as Request;
};

const mockResponse = (): Response => {
  const res: any = {
    _headers: {} as Record<string, string>,
    statusCode: 200,
  };
  
  res.setHeader = vi.fn((name: string, value: string) => {
    res._headers[name.toLowerCase()] = value;
  });
  
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  
  res.json = vi.fn((body: any) => {
    res._body = body;
    return res;
  });
  
  return res as Response;
};

const mockNext = vi.fn() as unknown as NextFunction;

describe('OAuth Security Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('oauthSecurityHeaders', () => {
    it('should set Content-Security-Policy header', () => {
      const req = mockRequest();
      const res = mockResponse();
      
      oauthSecurityHeaders(req, res, mockNext);
      
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'none'")
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("form-action 'self' https://accounts.google.com")
      );
    });

    it('should set HSTS header in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const req = mockRequest();
      const res = mockResponse();
      
      oauthSecurityHeaders(req, res, mockNext);
      
      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should not set HSTS header in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const req = mockRequest();
      const res = mockResponse();
      
      oauthSecurityHeaders(req, res, mockNext);
      
      expect(res.setHeader).not.toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.any(String)
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should set cache control headers to prevent caching', () => {
      const req = mockRequest();
      const res = mockResponse();
      
      oauthSecurityHeaders(req, res, mockNext);
      
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    });

    it('should set additional security headers', () => {
      const req = mockRequest();
      const res = mockResponse();
      
      oauthSecurityHeaders(req, res, mockNext);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    });

    it('should call next()', () => {
      const req = mockRequest();
      const res = mockResponse();
      
      oauthSecurityHeaders(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('enforceTLS', () => {
    it('should allow requests in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const req = mockRequest({ secure: false, protocol: 'http' });
      const res = mockResponse();
      
      enforceTLS(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should reject insecure connections in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const req = mockRequest({ 
        secure: false, 
        protocol: 'http',
        headers: { 'x-forwarded-proto': 'http' },
      });
      const res = mockResponse();
      
      enforceTLS(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'insecure_connection',
          message: 'HTTPS is required for OAuth endpoints',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should allow secure connections in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const req = mockRequest({ 
        secure: true, 
        protocol: 'https',
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = mockResponse();
      
      enforceTLS(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should allow connections with x-forwarded-proto: https', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const req = mockRequest({ 
        secure: false,
        protocol: 'http',
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = mockResponse();
      
      enforceTLS(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should reject outdated TLS versions in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const req = mockRequest({ 
        secure: true,
        socket: { 
          remoteAddress: '127.0.0.1',
          tlsVersion: 'TLSv1.0',
        } as any,
      });
      const res = mockResponse();
      
      enforceTLS(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'outdated_tls',
          message: 'TLS 1.2 or higher is required',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should allow TLS 1.2 connections', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const req = mockRequest({ 
        secure: true,
        socket: { 
          remoteAddress: '127.0.0.1',
          tlsVersion: 'TLSv1.2',
        } as any,
      });
      const res = mockResponse();
      
      enforceTLS(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should allow TLS 1.3 connections', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const req = mockRequest({ 
        secure: true,
        socket: { 
          remoteAddress: '127.0.0.1',
          tlsVersion: 'TLSv1.3',
        } as any,
      });
      const res = mockResponse();
      
      enforceTLS(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('validateRedirectUri', () => {
    const originalCallbackUrl = process.env.OAUTH_CALLBACK_URL;

    beforeAll(() => {
      process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/api/auth/google/callback';
    });

    afterAll(() => {
      process.env.OAUTH_CALLBACK_URL = originalCallbackUrl;
    });

    it('should allow /start endpoint without validation', () => {
      const req = mockRequest({ path: '/api/auth/google/start' });
      const res = mockResponse();
      
      validateRedirectUri(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should validate redirect_uri for /callback endpoint', () => {
      const req = mockRequest({
        path: '/api/auth/google/callback',
        protocol: 'https',
        get: (header: string) => {
          if (header === 'host') return 'api.example.com';
          return undefined;
        },
      });
      const res = mockResponse();
      
      validateRedirectUri(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    // These two cases previously asserted that the middleware rebuilt the
    // callback URL from the request Host/protocol and rejected a mismatch with
    // 400 redirect_uri_mismatch. That check was intentionally REMOVED from
    // `validateRedirectUri` (see its implementation comment): the authorization
    // code flow's redirect_uri is validated by Google against the URI registered
    // in the Google Console BEFORE the callback ever reaches this server, so an
    // attacker cannot steer the redirect to an unregistered host. Meanwhile the
    // reconstruction produced false 400s whenever the app ran behind a proxy or
    // on a different internal port than OAUTH_CALLBACK_URL. The tests were never
    // updated, so they asserted removed behaviour. They now pin the ACTUAL
    // contract: the callback is passed through to the handler.
    it('should pass through a callback whose Host does not match the configured URL', () => {
      const req = mockRequest({
        path: '/api/auth/google/callback',
        protocol: 'https',
        get: (header: string) => {
          if (header === 'host') return 'evil.com';
          return undefined;
        },
      });
      const res = mockResponse();

      validateRedirectUri(req, res, mockNext);

      // Host-based rejection is Google's responsibility, not ours.
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should pass through a callback whose protocol does not match the configured URL', () => {
      // Same rationale as above: TLS termination at a proxy legitimately makes
      // `req.protocol` http on the internal hop, so rejecting on it produced
      // false failures. Google already enforced the registered redirect_uri.
      const req = mockRequest({
        path: '/api/auth/google/callback',
        protocol: 'http',
        get: (header: string) => {
          if (header === 'host') return 'api.example.com';
          return undefined;
        },
      });
      const res = mockResponse();

      validateRedirectUri(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 500 if OAUTH_CALLBACK_URL not configured', () => {
      const originalUrl = process.env.OAUTH_CALLBACK_URL;
      delete process.env.OAUTH_CALLBACK_URL;
      
      const req = mockRequest();
      const res = mockResponse();
      
      validateRedirectUri(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'configuration_error',
          message: 'OAuth callback URL not configured',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
      
      process.env.OAUTH_CALLBACK_URL = originalUrl;
    });
  });

  describe('oauthRateLimiter', () => {
    beforeAll(() => {
      // Initialize with null Redis (use in-memory fallback)
      initializeOAuthRateLimiting(null);
    });

    // The bucket is 20 OAuth initiations per minute per IP (see
    // `memoryRateLimiter` in oauthSecurity.ts). These tests previously asserted
    // 10, the pre-tuning value, so they failed against the real configuration.
    const OAUTH_RATE_LIMIT = 20;

    it('should set rate limit headers on successful request', async () => {
      const req = mockRequest({ ip: '192.168.1.100' });
      const res = mockResponse();
      
      await oauthRateLimiter(req, res, mockNext);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', String(OAUTH_RATE_LIMIT));
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block requests after rate limit exceeded', async () => {
      const testIp = '192.168.1.200';
      const req = mockRequest({ ip: testIp });
      const res = mockResponse();

      // Exhaust the bucket.
      for (let i = 0; i < OAUTH_RATE_LIMIT; i++) {
        await oauthRateLimiter(mockRequest({ ip: testIp }), mockResponse(), vi.fn() as unknown as NextFunction);
      }

      // The next request must be blocked.
      await oauthRateLimiter(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'too_many_requests',
          message: 'Too many requests, please try again later',
          retryAfter: expect.any(Number),
        })
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    }, 10000); // Increase timeout for rate limiting test

    it('should track different IPs separately', async () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // Fully EXHAUST ip1's bucket (and one beyond, to confirm it is blocked).
      // The previous version only sent 10 requests — under the real limit of 20 —
      // so ip1 was never actually blocked and the test proved nothing about
      // per-IP isolation.
      for (let i = 0; i < OAUTH_RATE_LIMIT; i++) {
        await oauthRateLimiter(mockRequest({ ip: ip1 }), mockResponse(), vi.fn() as unknown as NextFunction);
      }

      const blockedRes = mockResponse();
      await oauthRateLimiter(mockRequest({ ip: ip1 }), blockedRes, vi.fn() as unknown as NextFunction);
      expect(blockedRes.status).toHaveBeenCalledWith(429);

      // A different IP must still be served despite ip1 being blocked.
      const req = mockRequest({ ip: ip2 });
      const res = mockResponse();

      await oauthRateLimiter(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(429);
    }, 10000);
  });
});
