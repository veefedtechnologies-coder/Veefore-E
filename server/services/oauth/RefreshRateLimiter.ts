import { logger } from '../../config/logger';
import type Redis from 'ioredis';

/**
 * RefreshRateLimiter - Per-user rate limiting for failed refresh token attempts
 * 
 * Implements per-user rate limiting to prevent brute force attacks on refresh tokens.
 * Unlike IP-based rate limiting, this tracks failed attempts per user, preventing
 * attackers from bypassing limits by rotating IP addresses.
 * 
 * Security properties:
 * - Per-user tracking: Failed attempts tracked by user ID, not IP
 * - Exponential backoff: Lockout duration increases with repeated violations
 * - Temporary blocking: Users blocked for 15 minutes after 5 failed attempts
 * - Automatic unblock: Lockout expires after cooldown period
 * - Success reset: Successful refresh resets failed attempt counter
 * - Redis backing: Supports multi-instance deployments with shared state
 * 
 * Requirements: 1.10, 1.11, 2.10, 2.11
 */
export class RefreshRateLimiter {
  // Maximum failed attempts before blocking (5 attempts)
  // Requirement 2.10: Implement per-user rate limiting threshold
  private static readonly MAX_FAILURES = 5;

  // Initial lockout duration in milliseconds (15 minutes)
  // Requirement 2.11: Temporarily block users who exceed threshold
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  // In-memory storage for failed attempts (Map-based tracking)
  // Key: userId, Value: { count, firstAttemptTime, lockoutUntil, violationCount }
  private failedAttempts: Map<string, {
    count: number;
    firstAttemptTime: number;
    lockoutUntil: number | null;
    violationCount: number; // For exponential backoff
  }> = new Map();

  // Optional Redis client for production multi-instance deployments
  private redisClient: Redis | null = null;

  constructor(redisClient?: Redis) {
    this.redisClient = redisClient || null;

    if (this.redisClient) {
      logger.info('RefreshRateLimiter initialized with Redis backing', {
        component: 'OAuth.RefreshRateLimiter',
      });
    } else {
      logger.info('RefreshRateLimiter initialized with memory-based tracking', {
        component: 'OAuth.RefreshRateLimiter',
      });
    }
  }

  /**
   * Check if user is currently blocked from making refresh attempts
   * 
   * Requirement 2.11: Block users who exceed the failed refresh threshold
   * 
   * @param userId - MongoDB user ID
   * @param requestId - Optional request correlation ID for logging
   * @returns true if user is blocked, false otherwise
   */
  async isBlocked(userId: string, requestId?: string): Promise<boolean> {
    try {
      // Check Redis first if available
      if (this.redisClient) {
        const lockoutUntil = await this.redisClient.get(`refresh_rate_limit:lockout:${userId}`);
        
        if (lockoutUntil) {
          const lockoutTime = parseInt(lockoutUntil, 10);
          const isLocked = Date.now() < lockoutTime;
          
          if (isLocked) {
            const remainingMs = lockoutTime - Date.now();
            const remainingMinutes = Math.ceil(remainingMs / 60000);
            
            logger.debug('User is blocked from refresh attempts (Redis)', {
              component: 'OAuth.RefreshRateLimiter',
              userId,
              requestId,
              remainingMinutes,
              lockoutUntil: new Date(lockoutTime).toISOString(),
            });
            
            return true;
          } else {
            // Lockout expired - clean up Redis
            await this.redisClient.del(`refresh_rate_limit:lockout:${userId}`);
            await this.redisClient.del(`refresh_rate_limit:attempts:${userId}`);
            await this.redisClient.del(`refresh_rate_limit:violations:${userId}`);
            return false;
          }
        }
        
        return false;
      }

      // Fall back to in-memory Map
      const userAttempts = this.failedAttempts.get(userId);
      
      if (!userAttempts || !userAttempts.lockoutUntil) {
        return false;
      }

      // Check if lockout has expired
      if (Date.now() >= userAttempts.lockoutUntil) {
        // Lockout expired - clear the user's attempts
        this.failedAttempts.delete(userId);
        
        logger.debug('User lockout expired, access restored', {
          component: 'OAuth.RefreshRateLimiter',
          userId,
          requestId,
        });
        
        return false;
      }

      const remainingMs = userAttempts.lockoutUntil - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      
      logger.debug('User is blocked from refresh attempts (memory)', {
        component: 'OAuth.RefreshRateLimiter',
        userId,
        requestId,
        remainingMinutes,
        attemptCount: userAttempts.count,
        violationCount: userAttempts.violationCount,
      });

      return true;
    } catch (error) {
      // On error, fail open (don't block the user)
      logger.error('Failed to check if user is blocked', error, {
        component: 'OAuth.RefreshRateLimiter',
        userId,
        requestId,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
      
      return false;
    }
  }

  /**
   * Record a failed refresh attempt for a user
   * 
   * Requirement 2.10: Track failed refresh attempts per user
   * Requirement 2.11: Block user after threshold with exponential backoff
   * 
   * @param userId - MongoDB user ID
   * @param requestId - Optional request correlation ID for logging
   */
  async recordFailure(userId: string, requestId?: string): Promise<void> {
    try {
      // Use Redis if available
      if (this.redisClient) {
        // Increment attempt counter (with 1 hour expiry)
        const attemptsKey = `refresh_rate_limit:attempts:${userId}`;
        const attempts = await this.redisClient.incr(attemptsKey);
        await this.redisClient.expire(attemptsKey, 3600); // 1 hour window

        logger.debug('Recorded failed refresh attempt (Redis)', {
          component: 'OAuth.RefreshRateLimiter',
          userId,
          requestId,
          attempts,
          threshold: RefreshRateLimiter.MAX_FAILURES,
        });

        // Check if threshold exceeded
        if (attempts >= RefreshRateLimiter.MAX_FAILURES) {
          // Get violation count for exponential backoff
          const violationsKey = `refresh_rate_limit:violations:${userId}`;
          const violations = await this.redisClient.incr(violationsKey);
          await this.redisClient.expire(violationsKey, 86400); // 24 hour window

          // Calculate lockout duration with exponential backoff
          // 1st violation: 15 minutes
          // 2nd violation: 30 minutes
          // 3rd violation: 60 minutes
          // 4th+ violations: 120 minutes (max)
          const backoffMultiplier = Math.min(Math.pow(2, violations - 1), 8);
          const lockoutDuration = RefreshRateLimiter.LOCKOUT_DURATION_MS * backoffMultiplier;
          const lockoutUntil = Date.now() + lockoutDuration;

          // Set lockout
          const lockoutKey = `refresh_rate_limit:lockout:${userId}`;
          await this.redisClient.set(lockoutKey, lockoutUntil.toString());
          await this.redisClient.expire(lockoutKey, Math.ceil(lockoutDuration / 1000));

          logger.warn('User blocked from refresh attempts (Redis)', {
            component: 'OAuth.RefreshRateLimiter',
            userId,
            requestId,
            attempts,
            violations,
            lockoutDurationMs: lockoutDuration,
            lockoutDurationMinutes: Math.ceil(lockoutDuration / 60000),
            lockoutUntil: new Date(lockoutUntil).toISOString(),
          });

          // Reset attempt counter after blocking
          await this.redisClient.del(attemptsKey);
        }

        return;
      }

      // Fall back to in-memory Map
      const now = Date.now();
      const userAttempts = this.failedAttempts.get(userId);

      if (!userAttempts) {
        // First failed attempt
        this.failedAttempts.set(userId, {
          count: 1,
          firstAttemptTime: now,
          lockoutUntil: null,
          violationCount: 0,
        });

        logger.debug('Recorded first failed refresh attempt (memory)', {
          component: 'OAuth.RefreshRateLimiter',
          userId,
          requestId,
          attempts: 1,
        });

        return;
      }

      // Check if attempts are within the 1-hour window
      const timeSinceFirst = now - userAttempts.firstAttemptTime;
      const oneHourMs = 60 * 60 * 1000;

      if (timeSinceFirst > oneHourMs) {
        // Reset counter - attempts outside the window
        this.failedAttempts.set(userId, {
          count: 1,
          firstAttemptTime: now,
          lockoutUntil: null,
          violationCount: userAttempts.violationCount,
        });

        logger.debug('Reset failed attempt counter (outside 1-hour window)', {
          component: 'OAuth.RefreshRateLimiter',
          userId,
          requestId,
          previousCount: userAttempts.count,
        });

        return;
      }

      // Increment counter
      userAttempts.count++;

      logger.debug('Recorded failed refresh attempt (memory)', {
        component: 'OAuth.RefreshRateLimiter',
        userId,
        requestId,
        attempts: userAttempts.count,
        threshold: RefreshRateLimiter.MAX_FAILURES,
      });

      // Check if threshold exceeded
      if (userAttempts.count >= RefreshRateLimiter.MAX_FAILURES) {
        // Increment violation count for exponential backoff
        userAttempts.violationCount++;

        // Calculate lockout duration with exponential backoff
        const backoffMultiplier = Math.min(Math.pow(2, userAttempts.violationCount - 1), 8);
        const lockoutDuration = RefreshRateLimiter.LOCKOUT_DURATION_MS * backoffMultiplier;
        userAttempts.lockoutUntil = now + lockoutDuration;

        logger.warn('User blocked from refresh attempts (memory)', {
          component: 'OAuth.RefreshRateLimiter',
          userId,
          requestId,
          attempts: userAttempts.count,
          violations: userAttempts.violationCount,
          lockoutDurationMs: lockoutDuration,
          lockoutDurationMinutes: Math.ceil(lockoutDuration / 60000),
          lockoutUntil: new Date(userAttempts.lockoutUntil).toISOString(),
        });

        // Reset attempt counter after blocking
        userAttempts.count = 0;
        userAttempts.firstAttemptTime = now;
      }
    } catch (error) {
      // On error, fail silently (don't block legitimate users due to tracking errors)
      logger.error('Failed to record refresh failure', error, {
        component: 'OAuth.RefreshRateLimiter',
        userId,
        requestId,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
    }
  }

  /**
   * Record a successful refresh attempt for a user
   * 
   * Requirement: Successful refresh resets failed attempt counter
   * 
   * @param userId - MongoDB user ID
   * @param requestId - Optional request correlation ID for logging
   */
  async recordSuccess(userId: string, requestId?: string): Promise<void> {
    try {
      // Use Redis if available
      if (this.redisClient) {
        const attemptsKey = `refresh_rate_limit:attempts:${userId}`;
        await this.redisClient.del(attemptsKey);

        logger.debug('Reset failed attempt counter after successful refresh (Redis)', {
          component: 'OAuth.RefreshRateLimiter',
          userId,
          requestId,
        });

        return;
      }

      // Fall back to in-memory Map
      const userAttempts = this.failedAttempts.get(userId);

      if (userAttempts) {
        // Reset counter but keep violation count for exponential backoff tracking
        userAttempts.count = 0;
        userAttempts.firstAttemptTime = Date.now();
        userAttempts.lockoutUntil = null;

        logger.debug('Reset failed attempt counter after successful refresh (memory)', {
          component: 'OAuth.RefreshRateLimiter',
          userId,
          requestId,
        });
      }
    } catch (error) {
      // On error, fail silently
      logger.error('Failed to record refresh success', error, {
        component: 'OAuth.RefreshRateLimiter',
        userId,
        requestId,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
    }
  }

  /**
   * Get rate limit status for a user (for debugging/monitoring)
   * 
   * @param userId - MongoDB user ID
   * @returns Rate limit status or null if no attempts recorded
   */
  async getStatus(userId: string): Promise<{
    attempts: number;
    isBlocked: boolean;
    lockoutUntil: Date | null;
    violationCount: number;
  } | null> {
    try {
      // Check Redis first if available
      if (this.redisClient) {
        const attemptsKey = `refresh_rate_limit:attempts:${userId}`;
        const lockoutKey = `refresh_rate_limit:lockout:${userId}`;
        const violationsKey = `refresh_rate_limit:violations:${userId}`;

        const [attempts, lockoutUntil, violations] = await Promise.all([
          this.redisClient.get(attemptsKey),
          this.redisClient.get(lockoutKey),
          this.redisClient.get(violationsKey),
        ]);

        if (!attempts && !lockoutUntil) {
          return null;
        }

        const lockoutTime = lockoutUntil ? parseInt(lockoutUntil, 10) : null;
        const isBlocked = lockoutTime ? Date.now() < lockoutTime : false;

        return {
          attempts: parseInt(attempts || '0', 10),
          isBlocked,
          lockoutUntil: lockoutTime ? new Date(lockoutTime) : null,
          violationCount: parseInt(violations || '0', 10),
        };
      }

      // Fall back to in-memory Map
      const userAttempts = this.failedAttempts.get(userId);

      if (!userAttempts) {
        return null;
      }

      const isBlocked = userAttempts.lockoutUntil ? Date.now() < userAttempts.lockoutUntil : false;

      return {
        attempts: userAttempts.count,
        isBlocked,
        lockoutUntil: userAttempts.lockoutUntil ? new Date(userAttempts.lockoutUntil) : null,
        violationCount: userAttempts.violationCount,
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', error, {
        component: 'OAuth.RefreshRateLimiter',
        userId,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });

      return null;
    }
  }

  /**
   * Clear all rate limit data (for testing/admin purposes)
   */
  async clearAll(): Promise<void> {
    try {
      if (this.redisClient) {
        // Clear all rate limit keys in Redis
        const keys = await this.redisClient.keys('refresh_rate_limit:*');
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }

        logger.info('Cleared all rate limit data (Redis)', {
          component: 'OAuth.RefreshRateLimiter',
          keysCleared: keys.length,
        });
      }

      // Clear in-memory Map
      this.failedAttempts.clear();

      logger.info('Cleared all rate limit data (memory)', {
        component: 'OAuth.RefreshRateLimiter',
      });
    } catch (error) {
      logger.error('Failed to clear rate limit data', error, {
        component: 'OAuth.RefreshRateLimiter',
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
    }
  }
}

// Export singleton instance (will be initialized with Redis in server/index.ts)
export let refreshRateLimiter: RefreshRateLimiter | null = null;

/**
 * Initialize the RefreshRateLimiter with optional Redis backing
 * 
 * @param redisClient - Optional Redis client for multi-instance deployments
 */
export function initializeRefreshRateLimiter(redisClient?: Redis): void {
  refreshRateLimiter = new RefreshRateLimiter(redisClient);
}
