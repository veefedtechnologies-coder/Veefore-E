/**
 * P1-3 SECURITY: Production-Ready Rate Limiting System
 * 
 * Working implementation using available packages:
 * - Global rate limiting for all endpoints
 * - Authentication brute-force protection
 * - Layered security with Redis persistence
 * - Security monitoring and analytics
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

// Rate limiting tracking
interface RateLimitInfo {
  requests: number;
  resetTime: number;
  blocked: boolean;
}

// Redis client for rate limiting
let redisClient: Redis;

/**
 * Initialize rate limiting with Redis
 */
export const initializeRateLimiting = (redis: Redis) => {
  redisClient = redis;
  console.log('🔒 P1-3 SECURITY: Rate limiting system initialized with Redis persistence');
};

/**
 * Get rate limit info from Redis
 */
async function getRateLimitInfo(key: string, windowMs: number, maxRequests: number): Promise<RateLimitInfo> {
  if (!redisClient) {
    return { requests: 1, resetTime: Date.now() + windowMs, blocked: false };
  }

  try {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries and count current requests
    await redisClient.zremrangebyscore(key, 0, windowStart);
    const current = await redisClient.zcard(key);
    
    // Add current request
    await redisClient.zadd(key, now, `${now}-${Math.random()}`);
    await redisClient.expire(key, Math.ceil(windowMs / 1000));
    
    const requests = current + 1;
    const blocked = requests > maxRequests;
    
    return {
      requests,
      resetTime: now + windowMs,
      blocked
    };
  } catch (error) {
    console.error('❌ Rate limit Redis error:', error);
    // Fail open - allow request if Redis is down
    return { requests: 1, resetTime: Date.now() + windowMs, blocked: false };
  }
}

/**
 * P1-3: Global rate limiter middleware - 60 requests per minute
 */
export const globalRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const key = `global_rl:${req.ip}`;
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 60;
  
  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);
  
  // Set rate limit headers
  res.set({
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': Math.max(0, maxRequests - rateLimitInfo.requests).toString(),
    'X-RateLimit-Reset': Math.ceil(rateLimitInfo.resetTime / 1000).toString()
  });
  
  if (rateLimitInfo.blocked) {
    console.log(`🚨 GLOBAL RATE LIMIT: Blocked IP ${req.ip} (${rateLimitInfo.requests}/${maxRequests})`);
    
    // Track violations
    if (redisClient) {
      const today = new Date().toISOString().slice(0, 10);
      redisClient.incr(`rate_limit_violations:${today}`).catch(console.error);
    }
    
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP address',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000),
      limit: maxRequests,
      remaining: 0
    });
  }
  
  next();
};

/**
 * P1-3: Authentication rate limiter - 5 attempts per 15 minutes
 */
export const authRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const email = req.body?.email || req.body?.username || '';
  const key = `auth_rl:${req.ip}:${email}`;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 5;
  
  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);
  
  if (rateLimitInfo.blocked) {
    console.log(`🚨 AUTH RATE LIMIT: Blocked ${req.ip} for ${email} (${rateLimitInfo.requests}/${maxRequests})`);
    
    // Track auth attacks
    if (redisClient) {
      const today = new Date().toISOString().slice(0, 10);
      redisClient.incr(`auth_brute_force:${today}`).catch(console.error);
    }
    
    return res.status(429).json({
      error: 'Authentication rate limit exceeded',
      message: 'Too many failed login attempts. Please wait 15 minutes.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000),
      securityNote: 'This protection helps secure accounts from unauthorized access.'
    });
  }
  
  next();
};

/**
 * P1-3: Progressive brute-force protection
 */
export const bruteForceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!redisClient) {
    return next();
  }
  
  const email = req.body?.email || req.body?.username || '';
  const key = `brute_force:${req.ip}:${email}`;
  
  try {
    const attempts = await redisClient.get(key);
    const currentAttempts = parseInt(attempts || '0');
    
    if (currentAttempts >= 5) {
      const ttl = await redisClient.ttl(key);
      console.log(`🚨 BRUTE FORCE: Progressive block - ${req.ip}:${email}, TTL: ${ttl}s`);
      
      // Track progressive blocks
      const today = new Date().toISOString().slice(0, 10);
      redisClient.incr(`progressive_blocks:${today}`).catch(console.error);
      
      return res.status(429).json({
        error: 'Account temporarily locked',
        message: `Too many failed attempts. Please wait ${Math.ceil(ttl / 60)} minutes.`,
        retryAfter: ttl,
        securityInfo: 'Progressive delays protect against automated attacks.'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Brute force check error:', error);
    next();
  }
};

/**
 * P1-3: API rate limiter with dynamic limits
 */
export const apiRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const key = user?.id ? `api_rl:user:${user.id}` : `api_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000; // 1 minute
  
  // Dynamic limits based on user plan
  let maxRequests = 30; // Anonymous
  if (user?.plan === 'business') maxRequests = 200;
  else if (user?.plan === 'pro') maxRequests = 100;
  else if (user) maxRequests = 60;
  
  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);
  
  if (rateLimitInfo.blocked) {
    console.log(`🚨 API RATE LIMIT: Blocked ${user?.id || req.ip} (${rateLimitInfo.requests}/${maxRequests})`);
    
    return res.status(429).json({
      error: 'API rate limit exceeded',
      message: 'Too many API requests. Please wait before making more requests.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000),
      limit: maxRequests,
      remaining: 0
    });
  }
  
  next();
};

/**
 * P1-3: Upload rate limiter - 5 uploads per minute
 */
export const uploadRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const key = user?.id ? `upload_rl:user:${user.id}` : `upload_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000;
  const maxRequests = 5;
  
  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);
  
  if (rateLimitInfo.blocked) {
    console.log(`🚨 UPLOAD RATE LIMIT: Blocked ${user?.id || req.ip} (${rateLimitInfo.requests}/${maxRequests})`);
    
    return res.status(429).json({
      error: 'Upload rate limit exceeded',
      message: 'Too many file uploads. Please wait 1 minute.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000),
      securityNote: 'This limit prevents abuse and ensures system stability.'
    });
  }
  
  next();
};

/**
 * P1-3: Password reset rate limiter - 3 attempts per hour
 */
export const passwordResetRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const email = req.body?.email || '';
  const key = `pwd_reset:${req.ip}:${email}`;
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 3;
  
  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);
  
  if (rateLimitInfo.blocked) {
    console.log(`🚨 PASSWORD RESET RATE LIMIT: Blocked ${req.ip} for ${email}`);
    
    return res.status(429).json({
      error: 'Password reset limit exceeded',
      message: 'Too many password reset requests. Please wait 1 hour.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000),
      securityNote: 'This protects against automated password reset abuse.'
    });
  }
  
  next();
};

/**
 * P1-3: Social media rate limiter - 10 operations per minute
 */
export const socialMediaRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const key = user?.id ? `social_rl:user:${user.id}` : `social_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000;
  const maxRequests = 10;
  
  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);
  
  if (rateLimitInfo.blocked) {
    console.log(`🚨 SOCIAL MEDIA RATE LIMIT: Blocked ${user?.id || req.ip}`);
    
    return res.status(429).json({
      error: 'Social media rate limit exceeded',
      message: 'Too many social media operations. Please wait 1 minute.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)
    });
  }
  
  next();
};

/**
 * P1-3: AI endpoints rate limiter - Cost protection for AI API calls
 * Stricter limits to prevent credit/cost overruns from OpenAI/Claude/Gemini
 * 10 requests per user per 5 minutes
 */
export const aiRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const key = user?.id ? `ai_rl:user:${user.id}` : `ai_rl:ip:${req.ip}`;
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const maxRequests = 10;
  
  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);
  
  if (rateLimitInfo.blocked) {
    const userId = user?.id || 'anonymous';
    console.log(`🚨 AI RATE LIMIT: Blocked ${userId} (${rateLimitInfo.requests}/${maxRequests})`);
    
    // Track AI rate limit violations for monitoring
    if (redisClient) {
      const today = new Date().toISOString().slice(0, 10);
      redisClient.incr(`ai_rate_limit_violations:${today}`).catch(console.error);
      // Track per-user for abuse detection
      redisClient.incr(`ai_rate_limit:${userId}:${today}`).catch(console.error);
    }
    
    return res.status(429).json({
      error: 'AI rate limit exceeded',
      message: 'Too many AI requests. Please wait 5 minutes before generating more content.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000),
      securityNote: 'This limit protects against excessive AI usage and helps manage costs.'
    });
  }
  
  next();
};

/**
 * P1-3: Rate limiting analytics
 */
export const getRateLimitStats = async () => {
  if (!redisClient) return null;
  
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const [
      globalViolations,
      authBruteForce,
      progressiveBlocks,
      aiRateLimitViolations
    ] = await Promise.all([
      redisClient.get(`rate_limit_violations:${today}`),
      redisClient.get(`auth_brute_force:${today}`),
      redisClient.get(`progressive_blocks:${today}`),
      redisClient.get(`ai_rate_limit_violations:${today}`)
    ]);
    
    return {
      date: today,
      globalViolations: parseInt(globalViolations || '0'),
      authBruteForce: parseInt(authBruteForce || '0'),
      progressiveBlocks: parseInt(progressiveBlocks || '0'),
      aiRateLimitViolations: parseInt(aiRateLimitViolations || '0'),
      totalSecurityEvents: parseInt(globalViolations || '0') + 
                          parseInt(authBruteForce || '0') + 
                          parseInt(progressiveBlocks || '0') +
                          parseInt(aiRateLimitViolations || '0')
    };
  } catch (error) {
    console.error('❌ Error getting rate limit stats:', error);
    return null;
  }
};

/**
 * P1-3: Security alerts monitoring
 */
export const checkSecurityAlerts = async () => {
  const stats = await getRateLimitStats();
  if (!stats) return [];
  
  const alerts: Array<{
    type: string;
    severity: string;
    message: string;
    count: number;
  }> = [];
  
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
      message: `Persistent attack attempts: ${stats.progressiveBlocks} progressive blocks today`,
      count: stats.progressiveBlocks
    });
  }
  
  // AI abuse detection - cost protection alert
  if (stats.aiRateLimitViolations > 30) {
    alerts.push({
      type: 'AI_ABUSE_DETECTED',
      severity: 'HIGH',
      message: `High AI rate limit violations: ${stats.aiRateLimitViolations} attempts today - potential credit abuse`,
      count: stats.aiRateLimitViolations
    });
  }
  
  return alerts;
};

/**
 * P1-3: Rate limiting health check
 */
export const checkRateLimitHealth = async (): Promise<boolean> => {
  if (!redisClient) return false;
  
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('❌ Rate limiting health check failed:', error);
    return false;
  }
};
