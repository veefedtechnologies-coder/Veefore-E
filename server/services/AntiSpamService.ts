import { redisConnection, isRedisAvailable } from '../queues/metricsQueue';

export class AntiSpamService {
  /**
   * Check if a specific user has already received a DM for a specific automation rule
   * within the cooldown period (default 24 hours).
   */
  static async canSendDm(workspaceId: string, ruleId: string, socialUserId: string, cooldownHours = 24): Promise<boolean> {
    if (!isRedisAvailable() || !redisConnection) {
      console.warn('⚠️ Redis not available, bypassing AntiSpam cooldown check');
      return true;
    }

    const key = `dm_cooldown:${workspaceId}:${ruleId}:${socialUserId}`;
    
    try {
      const exists = await redisConnection.exists(key);
      return exists === 0; // If it doesn't exist, we can send the DM
    } catch (error) {
      console.error('🚨 Error checking DM cooldown:', error);
      return true; // Fail open to avoid blocking legit DMs if Redis hiccups
    }
  }

  /**
   * Mark that a user has been sent a DM for a specific automation rule.
   * This sets a Redis key with an expiration time.
   */
  static async recordDmSent(workspaceId: string, ruleId: string, socialUserId: string, cooldownHours = 24): Promise<void> {
    if (!isRedisAvailable() || !redisConnection) return;

    const key = `dm_cooldown:${workspaceId}:${ruleId}:${socialUserId}`;
    const ttlSeconds = cooldownHours * 60 * 60;

    try {
      await redisConnection.setex(key, ttlSeconds, Date.now().toString());
    } catch (error) {
      console.error('🚨 Error recording DM cooldown:', error);
    }
  }

  /**
   * Generate a randomized human-like delay between min and max seconds.
   */
  static async humanLikeDelay(minSeconds = 5, maxSeconds = 15): Promise<void> {
    const delayMs = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }
}
