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
  const algorithm = process.env.RATE_LIMIT_ALGORITHM || 'fixed-window';
  console.log('🔒 P1-3 SECURITY: Rate limiting system initialized with Redis persistence');
  console.log(`📊 Rate Limit Algorithm: ${algorithm} (set RATE_LIMIT_ALGORITHM=sliding-window to rollback)`);
};


// Fallback: In-memory rate limiting store
const localRateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup interval for local store (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of localRateLimitStore.entries()) {
    if (now > value.resetTime) {
      localRateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Get rate limit info from Redis (with in-memory fallback)
 * 
 * Phase 4 Optimization (Task 6.1): Fixed-window INCR pattern
 * - Reduces from 4 Redis commands to 2 commands per request
 * - Feature flag: RATE_LIMIT_ALGORITHM (default: 'fixed-window')
 * 
 * ROLLBACK PROCEDURE (Task 6.2):
 * If issues arise with the new fixed-window algorithm, instant rollback is possible:
 * 
 * METHOD 1 - Environment Variable (Recommended - NO CODE DEPLOY REQUIRED):
 *   1. Set environment variable: RATE_LIMIT_ALGORITHM=sliding-window
 *   2. Restart the application (Railway/Vercel auto-restarts on env var change)
 *   3. System immediately reverts to old 4-command sliding-window pattern
 *   4. Monitor: Redis commands increase but rate limiting restored to baseline behavior
 * 
 * METHOD 2 - Git Revert (If env var method unavailable):
 *   1. Revert commit implementing Task 6.1
 *   2. Deploy previous version
 *   3. System returns to sliding-window implementation
 * 
 * VERIFICATION AFTER ROLLBACK:
 *   - Check logs for: "OLD: Sliding-Window" messages (indicates rollback active)
 *   - Monitor Redis MONITOR output: should see ZREMRANGEBYSCORE, ZCARD, ZADD, EXPIRE
 *   - Verify rate limiting still works: send 121 requests/minute, 121st should be blocked
 *   - Redis command count should return to ~350K-450K/month for rate limiting
 * 
 * Exported for testing purposes
 */
export async function getRateLimitInfo(key: string, windowMs: number, maxRequests: number): Promise<RateLimitInfo> {
  const startTimer = Date.now();
  
  // FAST PATH: If Redis is not ready, switch to In-Memory immediately
  if (!redisClient || redisClient.status !== 'ready') {
    const now = Date.now();
    let record = localRateLimitStore.get(key);

    // Clean expired
    if (record && now > record.resetTime) {
      localRateLimitStore.delete(key);
      record = undefined;
    }

    if (!record) {
      record = { count: 1, resetTime: now + windowMs };
      localRateLimitStore.set(key, record);
    } else {
      record.count++;
    }

    // Defensive programming: limit memory growth
    if (localRateLimitStore.size > 10000) localRateLimitStore.clear();

    if (redisClient) {
      // Log once per minute to avoid spamming
      const logKey = `redis_down_log:${Math.floor(now / 60000)}`;
      if (!localRateLimitStore.has(logKey)) {
        console.warn(`⚠️  Rate Limiting: Redis connection unstable (${redisClient.status}). Switched to local fallback.`);
        localRateLimitStore.set(logKey, { count: 1, resetTime: now + 60000 });
      }
    }

    // VERIFICATION LOG: Show that we are using local memory
    console.log(`[RATE-LIMIT] ⚠️  Fallback: ${key} | Count: ${record.count}/${maxRequests}`);

    return {
      requests: record.count,
      resetTime: record.resetTime,
      blocked: record.count > maxRequests
    };
  }

  try {
    const now = Date.now();
    
    // Task 6.2: Feature flag for rate-limiting algorithm (allows instant rollback)
    // Set RATE_LIMIT_ALGORITHM=sliding-window to revert to old behavior
    const algorithm = process.env.RATE_LIMIT_ALGORITHM || 'fixed-window';

    if (algorithm === 'fixed-window') {
      // NEW: Fixed-Window INCR Pattern (Task 6.1: 2 commands instead of 4)
      // Uses atomic INCR + conditional EXPIRE for better performance
      
      // Lua script for atomic INCR with conditional EXPIRE
      // Only sets EXPIRE on first request (count == 1) to avoid unnecessary EXPIRE commands
      const luaScript = `
        local key = KEYS[1]
        local windowMs = tonumber(ARGV[1])
        local count = redis.call('INCR', key)
        if count == 1 then
          redis.call('PEXPIRE', key, windowMs)
        end
        local ttl = redis.call('PTTL', key)
        return {count, ttl}
      `;

      const result = await redisClient.eval(
        luaScript,
        1,
        key,
        windowMs.toString()
      ) as [number, number];

      const count = result[0];
      const ttl = result[1];
      
      // Calculate reset time from TTL
      const resetTime = now + (ttl > 0 ? ttl : windowMs);
      const blocked = count > maxRequests;

      return {
        requests: count,
        resetTime,
        blocked
      };

    } else {
      // OLD: Sliding-Window Sorted Set Pattern (4 commands: backward compatibility)
      const windowStart = now - windowMs;

      const transaction = redisClient.multi();
      transaction.zremrangebyscore(key, 0, windowStart);
      transaction.zcard(key);
      transaction.zadd(key, now, `${now}-${Math.random()}`);
      transaction.expire(key, Math.ceil(windowMs / 1000));

      const results = await transaction.exec();

      if (!results) throw new Error("Redis transaction failed");

      const zcardResult = results[1];
      if (zcardResult[0]) throw zcardResult[0];

      const current = zcardResult[1] as number;
      const requests = current + 1;
      const blocked = requests > maxRequests;

      return {
        requests,
        resetTime: now + windowMs,
        blocked
      };
    }
  } catch (error) {
    // Fail safe - logic error catch
    const msg = (error as Error).message;
    if (msg.includes('Stream isn\'t writeable') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('Connection is closed')) {
      console.warn(`⚠️  Rate Limiting: Redis unavailable, failing open (allowing request). Error: ${msg}`);
    } else {
      console.error('❌ Rate limit Redis error:', error);
    }
    // Fail open - allow request if Redis errors unexpectedly
    return { requests: 1, resetTime: Date.now() + windowMs, blocked: false };
  }
}

/**
 * P1-3: Global rate limiter middleware - 60 requests per minute
 */
export const globalRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  // P1 SECURITY: Exclude OPTIONS requests (CORS preflight) from rate limiting
  if (req.method === 'OPTIONS') {
    return next();
  }

  // SECURITY: Exempt OAuth callback endpoints from rate limiting
  // These are legitimate redirects from external auth providers (Instagram, Facebook, Google, etc.)
  // OAuth flows can trigger multiple rapid requests which would incorrectly trigger rate limits
  const oauthExemptPaths = [
    '/api/instagram/callback',
    '/api/facebook/callback',
    '/api/google/callback',
    '/api/youtube/callback',
    '/api/twitter/callback',
    '/api/oauth/callback',
    '/api/auth/callback',
    '/api/v1/social-auth/instagram/callback',
    '/api/v1/social-auth/facebook/callback',
    '/api/v1/social-auth/google/callback',
    '/api/v1/social-auth/twitter/callback'
  ];

  if (oauthExemptPaths.some(path => req.path.startsWith(path))) {
    console.log(`✅ [RATE-LIMIT] OAuth callback exempt: ${req.path}`);
    return next();
  }

  // Detailed API logging for debugging
  // console.log(`[API-DEBUG] ${req.method} ${req.url} | IP: ${req.ip}`);

  const key = `global_rl:${req.ip}`;
  const windowMs = 60 * 1000; // 1 minute
  // Stricter limit: 120 requests per minute (2 req/sec) in production, 1000 for development polling
  const maxRequests = process.env.NODE_ENV === 'development' ? 1000 : 120;

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
 * P1-3: Authentication rate limiter - 10 attempts per 15 minutes
 */
export const authRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  // P1 SECURITY: Exclude OPTIONS requests from auth rate limiting
  if (req.method === 'OPTIONS') {
    return next();
  }

  const email = req.body?.email || req.body?.username || '';
  console.log(`[AUTH-DEBUG] Checking rate limit for ${email || 'unknown'} (${req.ip})`);

  const key = `auth_rl:${req.ip}:${email}`;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  // Stricter limit: 10 attempts per 15 minutes
  const maxRequests = 10;

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
 * OAuth-specific rate limiter - 10 requests per minute per IP (Requirement 11.7)
 * Applies to all OAuth endpoints for CSRF and abuse prevention
 */
export const oauthRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  // P1 SECURITY: Exclude OPTIONS requests from OAuth rate limiting
  if (req.method === 'OPTIONS') {
    return next();
  }

  const key = `oauth_rl:${req.ip}`;
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10; // 10 requests per minute per IP

  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);

  if (rateLimitInfo.blocked) {
    console.log(`🚨 OAUTH RATE LIMIT: Blocked ${req.ip} (${rateLimitInfo.requests}/${maxRequests})`);

    // Track OAuth abuse attempts
    if (redisClient) {
      const today = new Date().toISOString().slice(0, 10);
      redisClient.incr(`oauth_rate_limit:${today}`).catch(console.error);
    }

    return res.status(429).json({
      error: 'Too many requests',
      message: 'Too many requests, please try again later',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000),
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
  // P1 SECURITY: Exclude OPTIONS requests from API rate limiting
  if (req.method === 'OPTIONS') {
    return next();
  }

  const user = req.user;
  const key = user?.id ? `api_rl:user:${user.id}` : `api_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000; // 1 minute

  // Dynamic limits based on user plan
  let maxRequests = 30; // Anonymous
  if (user?.plan === 'business') maxRequests = 200;
  else if (user?.plan === 'pro') maxRequests = 100;
  else if (user) maxRequests = 60;

  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);

  // Debug log to confirm Redis usage (remove in production if too noisy)
  if (redisClient) {
    // console.log(`[REDIS] Rate Limit Check (${key}): ${rateLimitInfo.requests}/${maxRequests} requests`);
  }

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
 * P7: Dashboard Refresh Limiter - 10 manual refreshes per minute
 */
export const dashboardRefreshLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const key = user?.id ? `dash_rl:user:${user.id}` : `dash_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000;
  const maxRequests = 10;

  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);

  if (rateLimitInfo.blocked) {
    console.log(`🚨 DASHBOARD RATE LIMIT: Blocked ${user?.id || req.ip}`);
    return res.status(429).json({
      error: 'Refresh rate limit exceeded',
      message: 'Too many manual dashboard refreshes. Please wait 1 minute.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)
    });
  }

  next();
};

/**
 * P7: Webhook Rate Limiter - 1000 requests per minute per source IP
 */
export const webhookRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const key = `webhook_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000;
  const maxRequests = 1000; // Generous for Meta's high-throughput webhooks, but stops DDoS

  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);

  if (rateLimitInfo.blocked) {
    console.warn(`🚨 WEBHOOK RATE LIMIT: Blocked IP ${req.ip} (Flood detected)`);
    return res.status(429).send('Too Many Requests');
  }

  next();
};

/**
 * P7: Automation Loop Limiter - 50 automation triggers per minute per user
 */
export const automationRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const key = user?.id ? `auto_rl:user:${user.id}` : `auto_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000;
  const maxRequests = 50;

  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);

  if (rateLimitInfo.blocked) {
    console.log(`🚨 AUTOMATION RATE LIMIT: Blocked ${user?.id || req.ip} (${rateLimitInfo.requests}/${maxRequests})`);
    return res.status(429).json({
      error: 'Automation rate limit exceeded',
      message: 'Too many automation triggers running simultaneously. Please wait.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)
    });
  }

  next();
};

/**
 * P7: Background Sync Limiter - 5 manual syncs per minute per user
 */
export const syncRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const key = user?.id ? `sync_rl:user:${user.id}` : `sync_rl:ip:${req.ip}`;
  const windowMs = 60 * 1000;
  const maxRequests = 5;

  const rateLimitInfo = await getRateLimitInfo(key, windowMs, maxRequests);

  if (rateLimitInfo.blocked) {
    console.log(`🚨 SYNC RATE LIMIT: Blocked ${user?.id || req.ip}`);
    return res.status(429).json({
      error: 'Sync rate limit exceeded',
      message: 'Too many manual sync requests. Please wait 1 minute.',
      retryAfter: Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)
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
