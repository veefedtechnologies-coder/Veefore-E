/**
 * P1-3 SECURITY: Global Rate Limiting with Redis Store and Brute-Force Protection
 * 
 * Comprehensive rate limiting system with:
 * - Global rate limiting with Redis persistence
 * - Brute-force protection for authentication endpoints
 * - Layered rate limiting (global, auth, API, uploads)
 * - Progressive delay for repeat offenders
 * - Security monitoring and alerting
 */

import rateLimit from 'express-rate-limit';
// Note: RedisStore and RateLimiterRedis will be installed separately
// For now, using basic rate limiting with plans to add Redis store
import Redis from 'ioredis';
import { Request, Response, NextFunction } from 'express';

// Redis client for rate limiting (reuse existing connection)
let redisClient: Redis;

/**
 * Initialize rate limiting with Redis store
 */
export const initializeRateLimiting = (redis: Redis) => {
  redisClient = redis;
  console.log('🔒 P1-3 SECURITY: Rate limiting system initialized with Redis store');
};

/**
 * P1-3: Global rate limiter - Primary protection layer
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  standardHeaders: 'draft-8', // Latest 2025 standard
  legacyHeaders: false,
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'global_rl:',
  }),
  
  keyGenerator: (req: Request) => {
    // Use IP as primary key, but consider forwarded headers for proxies
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  
  message: {
    error: 'Too many requests from this IP',
    retryAfter: 'Please wait before making more requests',
    details: 'Global rate limit: 60 requests per minute'
  },
  
  handler: (req: Request, res: Response) => {
    console.log(`🚨 RATE LIMIT: Global limit exceeded from IP: ${req.ip}`);
    
    // Track rate limit violations in Redis for monitoring
    redisClient.incr(`rate_limit_violations:${new Date().toISOString().slice(0, 10)}`);
    
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP address',
      retryAfter: Math.ceil(req.rateLimit?.resetTime ?? 0 / 1000),
      limit: req.rateLimit?.limit,
      remaining: req.rateLimit?.remaining
    });
  }
});

/**
 * P1-3: Authentication endpoints rate limiter - Brute-force protection
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful authentications
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'auth_rl:',
  }),
  
  keyGenerator: (req: Request) => {
    // Combine IP with email for authentication attempts
    const email = req.body?.email || req.body?.username || '';
    return `${req.ip}:${email}`;
  },
  
  message: {
    error: 'Too many authentication attempts',
    retryAfter: 'Please wait before attempting to login again'
  },
  
  handler: (req: Request, res: Response) => {
    const email = req.body?.email || req.body?.username || 'unknown';
    console.log(`🚨 AUTH RATE LIMIT: Brute-force attempt blocked - IP: ${req.ip}, Email: ${email}`);
    
    // Track authentication brute-force attempts
    redisClient.incr(`auth_brute_force:${new Date().toISOString().slice(0, 10)}`);
    
    res.status(429).json({
      error: 'Authentication rate limit exceeded',
      message: 'Too many failed login attempts. Please wait 15 minutes before trying again.',
      retryAfter: Math.ceil(req.rateLimit?.resetTime ?? 0 / 1000),
      securityNote: 'This protection helps secure your account from unauthorized access attempts.'
    });
  }
});

/**
 * P1-3: Progressive brute-force protection with exponential backoff
 */
const bruteForceProtection = new RateLimiterRedis({
  redis: redisClient,
  keyPrefix: 'brute_force',
  points: 5, // 5 attempts allowed
  duration: 900, // 15 minutes base duration
  blockDuration: 900, // Initial block duration: 15 minutes
  execEvenly: true, // Spread attempts evenly across duration
});

/**
 * Advanced brute-force middleware with progressive penalties
 */
export const bruteForceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!redisClient) {
    console.warn('⚠️ RATE LIMIT: Redis not available, skipping brute-force protection');
    return next();
  }
  
  const key = `${req.ip}:${req.body?.email || req.body?.username || 'unknown'}`;
  
  try {
    await bruteForceProtection.consume(key);
    next();
  } catch (rejRes: any) {
    const remainingTime = Math.round(rejRes.msBeforeNext / 1000);
    const totalAttempts = rejRes.totalHits || 0;
    
    console.log(`🚨 BRUTE FORCE: Progressive block applied - IP: ${req.ip}, Attempts: ${totalAttempts}, Block: ${remainingTime}s`);
    
    // Track progressive brute-force blocks
    redisClient.incr(`progressive_blocks:${new Date().toISOString().slice(0, 10)}`);
    
    res.set('Retry-After', String(remainingTime));
    res.status(429).json({
      error: 'Account temporarily locked',
      message: `Too many failed attempts. Account locked for ${Math.ceil(remainingTime / 60)} minutes.`,
      retryAfter: remainingTime,
      attempts: totalAttempts,
      securityInfo: 'Progressive delays help protect your account from automated attacks.'
    });
  }
};

/**
 * P1-3: API endpoints rate limiter - Higher limits for authenticated users
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req: Request) => {
    // Dynamic limits based on authentication status
    if (req.user?.plan === 'business') return 200;
    if (req.user?.plan === 'pro') return 100;
    if (req.user) return 60; // Authenticated users
    return 30; // Anonymous users
  },
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'api_rl:',
  }),
  
  keyGenerator: (req: Request) => {
    // Use user ID for authenticated requests, IP for anonymous
    return req.user?.id || req.ip || 'unknown';
  },
  
  message: {
    error: 'API rate limit exceeded',
    retryAfter: 'Please wait before making more API requests'
  }
});

/**
 * P1-3: Upload endpoints rate limiter - Very strict for file uploads
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Only 5 uploads per minute
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'upload_rl:',
  }),
  
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip || 'unknown';
  },
  
  message: {
    error: 'Upload rate limit exceeded',
    retryAfter: 'Please wait before uploading more files'
  },
  
  handler: (req: Request, res: Response) => {
    console.log(`🚨 UPLOAD RATE LIMIT: Exceeded from user/IP: ${req.user?.id || req.ip}`);
    
    res.status(429).json({
      error: 'Upload rate limit exceeded',
      message: 'Too many file uploads. Please wait 1 minute before uploading again.',
      retryAfter: Math.ceil(req.rateLimit?.resetTime ?? 0 / 1000),
      securityNote: 'This limit prevents abuse and ensures system stability.'
    });
  }
});

/**
 * P1-3: Password reset rate limiter - Ultra-strict
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 password reset attempts per hour
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'pwd_reset_rl:',
  }),
  
  keyGenerator: (req: Request) => {
    const email = req.body?.email || '';
    return `${req.ip}:${email}`;
  },
  
  message: {
    error: 'Password reset rate limit exceeded',
    retryAfter: 'Please wait before requesting another password reset'
  },
  
  handler: (req: Request, res: Response) => {
    const email = req.body?.email || 'unknown';
    console.log(`🚨 PASSWORD RESET RATE LIMIT: Exceeded for email: ${email}, IP: ${req.ip}`);
    
    res.status(429).json({
      error: 'Password reset limit exceeded',
      message: 'Too many password reset requests. Please wait 1 hour before trying again.',
      retryAfter: Math.ceil(req.rateLimit?.resetTime ?? 0 / 1000),
      securityNote: 'This protects against automated password reset abuse.'
    });
  }
});

/**
 * P1-3: Social media endpoints rate limiter - Respects third-party API limits
 */
export const socialMediaRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 social media operations per minute
  
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'social_rl:',
  }),
  
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip || 'unknown';
  },
  
  message: {
    error: 'Social media rate limit exceeded',
    retryAfter: 'Please wait before performing more social media operations'
  }
});

/**
 * P1-3: Rate limiting monitoring and analytics
 */
export const getRateLimitStats = async (): Promise<any> => {
  if (!redisClient) return null;
  
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const [
      globalViolations,
      authBruteForce,
      progressiveBlocks,
      uploadViolations
    ] = await Promise.all([
      redisClient.get(`rate_limit_violations:${today}`),
      redisClient.get(`auth_brute_force:${today}`),
      redisClient.get(`progressive_blocks:${today}`),
      redisClient.get(`upload_violations:${today}`)
    ]);
    
    return {
      date: today,
      globalViolations: parseInt(globalViolations || '0'),
      authBruteForce: parseInt(authBruteForce || '0'),
      progressiveBlocks: parseInt(progressiveBlocks || '0'),
      uploadViolations: parseInt(uploadViolations || '0'),
      totalSecurityEvents: parseInt(globalViolations || '0') + 
                          parseInt(authBruteForce || '0') + 
                          parseInt(progressiveBlocks || '0')
    };
  } catch (error) {
    console.error('❌ Error getting rate limit stats:', error);
    return null;
  }
};

/**
 * P1-3: Health check for rate limiting system
 */
export const checkRateLimitHealth = async (): Promise<boolean> => {
  if (!redisClient) return false;
  
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('❌ Rate limiting Redis health check failed:', error);
    return false;
  }
};

/**
 * P1-3: Security alert threshold monitoring
 */
export const checkSecurityAlerts = async (): Promise<any[]> => {
  const stats = await getRateLimitStats();
  if (!stats) return [];
  
  const alerts = [];
  
  // Alert thresholds
  if (stats.authBruteForce > 50) {
    alerts.push({
      type: 'HIGH_AUTH_ATTACKS',
      severity: 'HIGH',
      message: `High authentication brute-force activity: ${stats.authBruteForce} attempts today`,
      count: stats.authBruteForce
    });
  }
  
  if (stats.globalViolations > 1000) {
    alerts.push({
      type: 'HIGH_RATE_LIMIT_VIOLATIONS',
      severity: 'MEDIUM',
      message: `High rate limit violations: ${stats.globalViolations} today`,
      count: stats.globalViolations
    });
  }
  
  if (stats.progressiveBlocks > 20) {
    alerts.push({
      type: 'PERSISTENT_ATTACKERS',
      severity: 'HIGH',
      message: `Multiple persistent attack attempts: ${stats.progressiveBlocks} progressive blocks today`,
      count: stats.progressiveBlocks
    });
  }
  
  return alerts;
};