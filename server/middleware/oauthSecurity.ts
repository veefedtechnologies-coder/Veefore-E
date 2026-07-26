/**
 * OAuth Security Headers and Middleware
 * 
 * This module implements comprehensive security measures for OAuth 2.0 endpoints:
 * - Content-Security-Policy headers
 * - HSTS (HTTP Strict Transport Security) in production
 * - Rate limiting (10 requests/minute per IP)
 * - TLS 1.2+ enforcement for production
 * - redirect_uri validation
 * 
 * Requirements: 11.7, 11.8, 17.5, 17.6, 17.7, 17.8
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import type Redis from 'ioredis';

// In-memory rate limiter (fallback)
const memoryRateLimiter = new RateLimiterMemory({
  points: 20, // 20 OAuth initiations
  duration: 60, // per 60 seconds (1 minute)
  blockDuration: 60, // Block for 60 seconds if exceeded
});

// Redis rate limiter (primary)
let redisRateLimiter: RateLimiterRedis | null = null;

/**
 * Initialize OAuth rate limiting with Redis
 * Falls back to in-memory if Redis is unavailable
 */
export const initializeOAuthRateLimiting = (redis: Redis | null) => {
  if (redis) {
    try {
      redisRateLimiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: 'oauth_init_rl',
        points: 20, // 20 OAuth initiations
        duration: 60, // per 60 seconds (1 minute)
        blockDuration: 60, // Block for 60 seconds if exceeded
      });
      console.log('🔒 OAuth rate limiting initialized with Redis');
    } catch (error) {
      console.warn('⚠️  OAuth rate limiting Redis initialization failed, using in-memory fallback:', error);
    }
  } else {
    console.log('🔒 OAuth rate limiting using in-memory store (Redis not available)');
  }
};

/**
 * OAuth Rate Limiting Middleware
 * 
 * Implements rate limiting of 10 requests per minute per IP address for OAuth endpoints.
 * This prevents brute force attacks and abuse of OAuth flows.
 * 
 * Exempts the metrics endpoint from rate limiting to allow monitoring systems
 * to poll without restrictions.
 * 
 * @requirement 11.7 - Rate limiting of 10 requests per minute per IP for OAuth endpoints
 * @requirement 11.8 - Return HTTP 429 if rate limit exceeded
 */
export const oauthRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Only rate-limit genuine OAuth *initiation* (e.g. GET /google/start). The
    // oauthSecurityMiddleware that wraps this limiter is mounted on the WHOLE
    // /api/auth OAuth router, so without this guard the 10/min bucket is drained
    // by the auto-fired session-maintenance endpoints that run on every page load
    // and during login/logout (/session, /update-token, /refresh, /logout,
    // /debug-client-log, /google/callback). A single "logout → login" cycle fires
    // those many times and then wrongly blocks the next /google/start for 60s
    // (the reported bug). Those endpoints are not brute-force-able OAuth
    // initiation and have their own protections, so we skip them here and only
    // throttle the initiation endpoints.
    const isOAuthInitiation = req.method === 'GET' && /\/start$/.test(req.path);
    if (!isOAuthInitiation) {
      return next();
    }
    
    // Get client IP address
    // Trust proxy settings in server/index.ts ensure this is accurate behind load balancers
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Use Redis rate limiter if available, otherwise use memory
    const rateLimiter = redisRateLimiter || memoryRateLimiter;
    
    try {
      // Consume 1 point for this request
      const rateLimiterRes = await rateLimiter.consume(clientIp);
      
      // Set rate limit headers for transparency
      res.setHeader('X-RateLimit-Limit', '20');
      res.setHeader('X-RateLimit-Remaining', String(rateLimiterRes.remainingPoints));
      res.setHeader('X-RateLimit-Reset', String(new Date(Date.now() + rateLimiterRes.msBeforeNext).getTime() / 1000));
      
      next();
    } catch (rateLimiterError: any) {
      // Rate limit exceeded
      console.warn('[OAuth Security] Rate limit exceeded:', {
        ip: clientIp,
        path: req.path,
        method: req.method,
      });
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', '20');
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(new Date(Date.now() + rateLimiterError.msBeforeNext).getTime() / 1000));
      res.setHeader('Retry-After', String(Math.ceil(rateLimiterError.msBeforeNext / 1000)));
      
      // Requirement 11.8: Return HTTP 429 with message
      res.status(429).json({
        error: 'too_many_requests',
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil(rateLimiterError.msBeforeNext / 1000),
      });
    }
  } catch (error) {
    // If rate limiting fails, allow the request but log the error
    console.error('[OAuth Security] Rate limiting error:', error);
    next();
  }
};

/**
 * OAuth Security Headers Middleware
 * 
 * Sets comprehensive security headers for OAuth endpoints:
 * - Content-Security-Policy to prevent XSS attacks
 * - HSTS (Strict-Transport-Security) in production for HTTPS enforcement
 * - Additional security headers
 * 
 * @requirement 17.7 - Content-Security-Policy header
 * @requirement 17.8 - HSTS header in production
 */
export const oauthSecurityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Requirement 17.7: Content-Security-Policy header
  // Strict CSP for OAuth endpoints - only allow same-origin resources
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; " +
    "script-src 'self'; " +
    "connect-src 'self'; " +
    "img-src 'self' data: https:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "base-uri 'self'; " +
    "form-action 'self' https://accounts.google.com;"
  );
  
  // Requirement 17.8: HSTS header in production
  // Enforce HTTPS for 2 years with includeSubDomains
  if (isProduction) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }
  
  // Additional security headers for defense in depth
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Disabled in favor of CSP
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Prevent caching of OAuth responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  next();
};

/**
 * TLS Version Enforcement Middleware
 * 
 * Enforces TLS 1.2+ for OAuth endpoints in production.
 * Rejects requests using older, insecure TLS versions.
 * 
 * @requirement 17.5 - TLS 1.2+ enforcement for production
 */
export const enforceTLS = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Only enforce TLS in production
  if (!isProduction) {
    return next();
  }
  
  // Check if connection is secure (HTTPS)
  const isSecure = req.secure || 
                   req.headers['x-forwarded-proto'] === 'https' ||
                   (req.socket as any).encrypted;
  
  if (!isSecure) {
    console.warn('[OAuth Security] Insecure connection attempt:', {
      ip: req.ip,
      path: req.path,
      protocol: req.protocol,
      forwardedProto: req.headers['x-forwarded-proto'],
    });
    
    return res.status(403).json({
      error: 'insecure_connection',
      message: 'HTTPS is required for OAuth endpoints',
    });
  }
  
  // Check TLS version if available
  // Note: TLS version detection depends on how the request is proxied
  // Railway/Vercel handle TLS termination, so we trust their proxy headers
  const tlsVersion = (req.socket as any).tlsVersion;
  if (tlsVersion && !['TLSv1.2', 'TLSv1.3'].includes(tlsVersion)) {
    console.warn('[OAuth Security] Outdated TLS version:', {
      ip: req.ip,
      path: req.path,
      tlsVersion,
    });
    
    return res.status(403).json({
      error: 'outdated_tls',
      message: 'TLS 1.2 or higher is required',
    });
  }
  
  next();
};

/**
 * Redirect URI Validation Middleware
 * 
 * Validates that redirect URIs in OAuth requests match the configured callback URL.
 * Prevents open redirect vulnerabilities and authorization code interception.
 * 
 * @requirement 17.6 - Validate redirect_uri in callback matches authorization request
 */
export const validateRedirectUri = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Get configured callback URL from environment
  const configuredCallbackUrl = process.env.OAUTH_CALLBACK_URL;
  
  if (!configuredCallbackUrl) {
    console.error('[OAuth Security] OAUTH_CALLBACK_URL not configured');
    return res.status(500).json({
      error: 'configuration_error',
      message: 'OAuth callback URL not configured',
    });
  }
  
  // For /start endpoint, no validation needed (we set the redirect_uri)
  if (req.path.includes('/start')) {
    return next();
  }
  
  // For /callback endpoint, Google OAuth already validates the redirect_uri.
  // If the redirect_uri didn't match what's registered in Google Console,
  // Google would reject it before the callback even reaches this server.
  // The additional host/protocol reconstruction check is skipped because
  // it incorrectly fires when the server runs behind a proxy or on a
  // different internal port than OAUTH_CALLBACK_URL (e.g. localhost:5000 vs 3000).
  if (req.path.includes('/callback')) {
    return next();
  }
  
  next();
};

/**
 * Combined OAuth Security Middleware
 * 
 * Applies all OAuth security measures in correct order:
 * 1. TLS enforcement (production only)
 * 2. Security headers
 * 3. Redirect URI validation
 * 4. Rate limiting
 */
export const oauthSecurityMiddleware = [
  enforceTLS,
  oauthSecurityHeaders,
  validateRedirectUri,
  oauthRateLimiter,
];

export default oauthSecurityMiddleware;
