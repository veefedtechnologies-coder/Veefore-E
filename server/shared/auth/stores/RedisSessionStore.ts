import { ISessionStore, SessionInfo } from '../controllers/SessionController';

/**
 * Redis Session Store Implementation
 * 
 * Implements ISessionStore interface using Redis for high-performance caching.
 * Suitable for applications requiring fast session validation with automatic expiration.
 * 
 * Validates: Requirements 5.2, 6.3
 */

export class RedisSessionStore implements ISessionStore {
  private static instance: RedisSessionStore;
  private redisClient: any;
  private readonly SESSION_PREFIX = 'session:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';

  private constructor() {}

  public static getInstance(): RedisSessionStore {
    if (!RedisSessionStore.instance) {
      RedisSessionStore.instance = new RedisSessionStore();
    }
    return RedisSessionStore.instance;
  }

  /**
   * Set Redis client
   */
  public setRedisClient(client: any): void {
    this.redisClient = client;
  }

  /**
   * Save a session to Redis with automatic expiration
   */
  async saveSession(session: SessionInfo): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      const sessionKey = `${this.SESSION_PREFIX}${(session as any).sessionToken}`;
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${session.userId}`;
      
      // Calculate TTL in seconds
      const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
      
      if (ttl <= 0) {
        console.warn('[RedisSessionStore] Session already expired, not saving');
        return;
      }

      // Store session data
      await this.redisClient.setex(
        sessionKey,
        ttl,
        JSON.stringify(session)
      );

      // Add session token to user's session set
      await this.redisClient.sadd(userSessionsKey, (session as any).sessionToken);
      await this.redisClient.expire(userSessionsKey, ttl);
    } catch (error) {
      console.error('[RedisSessionStore] Error saving session:', error);
      throw error;
    }
  }

  /**
   * Get a session by token
   */
  async getSession(sessionToken: string): Promise<SessionInfo | null> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      const sessionKey = `${this.SESSION_PREFIX}${sessionToken}`;
      const data = await this.redisClient.get(sessionKey);

      if (!data) {
        return null;
      }

      const session = JSON.parse(data);
      
      // Convert date strings back to Date objects
      session.lastActivity = new Date(session.lastActivity);
      session.expiresAt = new Date(session.expiresAt);
      session.createdAt = new Date(session.createdAt);

      return session;
    } catch (error) {
      console.error('[RedisSessionStore] Error getting session:', error);
      return null;
    }
  }

  /**
   * Update a session
   */
  async updateSession(sessionToken: string, updates: Partial<SessionInfo>): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      const sessionKey = `${this.SESSION_PREFIX}${sessionToken}`;
      const data = await this.redisClient.get(sessionKey);

      if (!data) {
        return;
      }

      const session = JSON.parse(data);
      const updatedSession = { ...session, ...updates };

      // Get remaining TTL
      const ttl = await this.redisClient.ttl(sessionKey);
      
      if (ttl > 0) {
        await this.redisClient.setex(
          sessionKey,
          ttl,
          JSON.stringify(updatedSession)
        );
      }
    } catch (error) {
      console.error('[RedisSessionStore] Error updating session:', error);
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionToken: string): Promise<boolean> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      const sessionKey = `${this.SESSION_PREFIX}${sessionToken}`;
      const result = await this.redisClient.del(sessionKey);

      // Also remove from user's session set
      const session = await this.getSession(sessionToken);
      if (session) {
        const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${session.userId}`;
        await this.redisClient.srem(userSessionsKey, sessionToken);
      }

      return result > 0;
    } catch (error) {
      console.error('[RedisSessionStore] Error deleting session:', error);
      return false;
    }
  }

  /**
   * Get sessions for a user
   */
  async getSessionsByUser(userId: string, limit: number = 10): Promise<SessionInfo[]> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessionTokens = await this.redisClient.smembers(userSessionsKey);

      if (!sessionTokens || sessionTokens.length === 0) {
        return [];
      }

      const sessions: SessionInfo[] = [];
      
      for (const token of sessionTokens.slice(0, limit)) {
        const session = await this.getSession(token);
        if (session) {
          sessions.push(session);
        }
      }

      // Sort by last activity
      sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

      return sessions;
    } catch (error) {
      console.error('[RedisSessionStore] Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<SessionInfo[]> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      const allSessions = await this.getSessionsByUser(userId, 100);
      const now = new Date();

      return allSessions.filter(session => 
        session.isActive && session.expiresAt > now
      );
    } catch (error) {
      console.error('[RedisSessionStore] Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteAllUserSessions(userId: string, excludeToken?: string): Promise<number> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessionTokens = await this.redisClient.smembers(userSessionsKey);

      if (!sessionTokens || sessionTokens.length === 0) {
        return 0;
      }

      let deletedCount = 0;

      for (const token of sessionTokens) {
        if (token !== excludeToken) {
          const deleted = await this.deleteSession(token);
          if (deleted) {
            deletedCount++;
          }
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('[RedisSessionStore] Error deleting user sessions:', error);
      return 0;
    }
  }

  /**
   * Cleanup expired sessions
   * Note: Redis automatically removes expired keys, so this is mainly for cleanup of user session sets
   */
  async cleanupExpiredSessions(): Promise<number> {
    if (!this.redisClient) {
      throw new Error('Redis client not configured');
    }

    try {
      // Get all user session keys
      const pattern = `${this.USER_SESSIONS_PREFIX}*`;
      const keys = await this.redisClient.keys(pattern);

      let cleanedCount = 0;

      for (const key of keys) {
        const sessionTokens = await this.redisClient.smembers(key);
        
        for (const token of sessionTokens) {
          const session = await this.getSession(token);
          
          // If session doesn't exist or is expired, remove from set
          if (!session || session.expiresAt <= new Date()) {
            await this.redisClient.srem(key, token);
            cleanedCount++;
          }
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('[RedisSessionStore] Error cleaning up sessions:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const redisSessionStore = RedisSessionStore.getInstance();
