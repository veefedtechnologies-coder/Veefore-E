import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getEnv } from '../../../config/env';

/**
 * SessionController - Shared Session Management Module
 * 
 * Consolidates session management logic for both Main_App and Admin_Panel.
 * Provides unified interface for session creation, validation, refresh, and destruction.
 * 
 * Features:
 * - JWT-based session tokens
 * - Refresh token support
 * - In-memory caching for performance
 * - Device and location tracking
 * - Risk score calculation
 * - Activity monitoring
 * 
 * Validates: Requirements 5.2, 6.3
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface SessionData {
  sessionId: string;
  userId: string;
  userType: 'user' | 'admin';
  ipAddress: string;
  userAgent: string;
  device: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
    version: string;
  };
  location?: {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  };
  isSecure: boolean;
}

export interface SessionInfo {
  id: string;
  userId: string;
  userType: 'user' | 'admin';
  ipAddress: string;
  userAgent: string;
  device: any;
  location: any;
  isActive: boolean;
  lastActivity: Date;
  expiresAt: Date;
  isSecure: boolean;
  isTrusted: boolean;
  riskScore: number;
  activityCount: number;
  lastAction?: string;
  lastPage?: string;
  createdAt: Date;
}

export interface CreateSessionResult {
  sessionToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface ValidateSessionResult {
  isValid: boolean;
  session?: SessionInfo;
  reason?: string;
}

export interface RefreshSessionResult {
  success: boolean;
  sessionToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  reason?: string;
}

// ============================================================================
// Session Store Interface
// ============================================================================

/**
 * Interface for session persistence layer.
 * Implementations can use MongoDB, Redis, or any other storage.
 */
export interface ISessionStore {
  saveSession(session: SessionInfo): Promise<void>;
  getSession(sessionToken: string): Promise<SessionInfo | null>;
  updateSession(sessionToken: string, updates: Partial<SessionInfo>): Promise<void>;
  deleteSession(sessionToken: string): Promise<boolean>;
  getSessionsByUser(userId: string, limit?: number): Promise<SessionInfo[]>;
  getActiveSessions(userId: string): Promise<SessionInfo[]>;
  deleteAllUserSessions(userId: string, excludeToken?: string): Promise<number>;
  cleanupExpiredSessions(): Promise<number>;
}

// ============================================================================
// SessionController Class
// ============================================================================

export class SessionController {
  private static instance: SessionController;
  private sessionCache: Map<string, SessionInfo> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
  private readonly REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
  private sessionStore?: ISessionStore;

  private constructor() {}

  /**
   * Get singleton instance of SessionController
   */
  public static getInstance(): SessionController {
    if (!SessionController.instance) {
      SessionController.instance = new SessionController();
    }
    return SessionController.instance;
  }

  /**
   * Set the session store implementation
   */
  public setSessionStore(store: ISessionStore): void {
    this.sessionStore = store;
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Create a new session for a user
   * Generates session token, refresh token, and calculates risk score
   */
  public async createSession(sessionData: SessionData): Promise<CreateSessionResult> {
    try {
      const sessionToken = this.generateSessionToken();
      const refreshToken = this.generateRefreshToken();
      const expiresAt = new Date(Date.now() + this.SESSION_EXPIRY);

      // Calculate risk score based on session characteristics
      const riskScore = await this.calculateRiskScore(sessionData);

      // Check if device is trusted
      const isTrusted = await this.isTrustedDevice(
        sessionData.userId,
        sessionData.ipAddress,
        sessionData.device
      );

      const session: SessionInfo = {
        id: sessionData.sessionId,
        userId: sessionData.userId,
        userType: sessionData.userType,
        sessionToken,
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        location: sessionData.location,
        device: sessionData.device,
        isActive: true,
        expiresAt,
        lastActivity: new Date(),
        isSecure: sessionData.isSecure,
        isTrusted,
        riskScore,
        activityCount: 0,
        createdAt: new Date()
      } as any;

      // Persist to store if available
      if (this.sessionStore) {
        await this.sessionStore.saveSession(session);
      }

      // Cache session
      this.cacheSession(sessionToken, session);

      return {
        sessionToken,
        refreshToken,
        expiresAt
      };
    } catch (error) {
      console.error('[SessionController] Error creating session:', error);
      throw error;
    }
  }

  /**
   * Validate a session token
   * Checks cache first, then store, then updates activity
   */
  public async validateSession(sessionToken: string): Promise<ValidateSessionResult> {
    try {
      // Check cache first
      const cachedSession = this.sessionCache.get(sessionToken);
      if (cachedSession) {
        if (cachedSession.expiresAt > new Date() && cachedSession.isActive) {
          return { isValid: true, session: cachedSession };
        } else {
          this.sessionCache.delete(sessionToken);
          return { 
            isValid: false, 
            reason: cachedSession.expiresAt <= new Date() ? 'expired' : 'inactive' 
          };
        }
      }

      // Check store if available
      if (this.sessionStore) {
        const session = await this.sessionStore.getSession(sessionToken);
        
        if (!session) {
          return { isValid: false, reason: 'not_found' };
        }

        if (session.expiresAt <= new Date()) {
          return { isValid: false, reason: 'expired' };
        }

        if (!session.isActive) {
          return { isValid: false, reason: 'inactive' };
        }

        // Update last activity
        await this.updateSessionActivity(sessionToken, session);

        // Cache session
        this.cacheSession(sessionToken, session);

        return { isValid: true, session };
      }

      return { isValid: false, reason: 'no_store_configured' };
    } catch (error) {
      console.error('[SessionController] Error validating session:', error);
      return { isValid: false, reason: 'validation_error' };
    }
  }

  /**
   * Refresh a session using refresh token
   * Generates new session token while maintaining session data
   */
  public async refreshSession(
    oldSessionToken: string,
    refreshToken: string
  ): Promise<RefreshSessionResult> {
    try {
      // Validate old session exists
      const validation = await this.validateSession(oldSessionToken);
      
      if (!validation.isValid || !validation.session) {
        return { 
          success: false, 
          reason: validation.reason || 'invalid_session' 
        };
      }

      // Verify refresh token (in production, this should be validated against stored hash)
      if (!refreshToken || refreshToken.length < 32) {
        return { success: false, reason: 'invalid_refresh_token' };
      }

      // Generate new tokens
      const newSessionToken = this.generateSessionToken();
      const newRefreshToken = this.generateRefreshToken();
      const expiresAt = new Date(Date.now() + this.SESSION_EXPIRY);

      // Update session with new tokens
      const updatedSession: SessionInfo = {
        ...validation.session,
        expiresAt,
        lastActivity: new Date()
      };

      // Update in store
      if (this.sessionStore) {
        await this.sessionStore.deleteSession(oldSessionToken);
        await this.sessionStore.saveSession(updatedSession);
      }

      // Update cache
      this.sessionCache.delete(oldSessionToken);
      this.cacheSession(newSessionToken, updatedSession);

      return {
        success: true,
        sessionToken: newSessionToken,
        refreshToken: newRefreshToken,
        expiresAt
      };
    } catch (error) {
      console.error('[SessionController] Error refreshing session:', error);
      return { success: false, reason: 'refresh_error' };
    }
  }

  /**
   * Destroy a session (logout)
   * Removes from store and cache
   */
  public async destroySession(sessionToken: string): Promise<boolean> {
    try {
      // Remove from cache
      this.sessionCache.delete(sessionToken);

      // Remove from store
      if (this.sessionStore) {
        return await this.sessionStore.deleteSession(sessionToken);
      }

      return true;
    } catch (error) {
      console.error('[SessionController] Error destroying session:', error);
      return false;
    }
  }

  /**
   * Destroy all sessions for a user
   * Useful for "logout from all devices"
   */
  public async destroyAllUserSessions(
    userId: string,
    excludeSessionToken?: string
  ): Promise<number> {
    try {
      // Remove from cache
      for (const [token, session] of this.sessionCache.entries()) {
        if (session.userId === userId && token !== excludeSessionToken) {
          this.sessionCache.delete(token);
        }
      }

      // Remove from store
      if (this.sessionStore) {
        return await this.sessionStore.deleteAllUserSessions(userId, excludeSessionToken);
      }

      return 0;
    } catch (error) {
      console.error('[SessionController] Error destroying user sessions:', error);
      return 0;
    }
  }

  /**
   * Update session activity
   * Records user actions and page views
   */
  public async updateActivity(
    sessionToken: string,
    action?: string,
    page?: string
  ): Promise<void> {
    try {
      const validation = await this.validateSession(sessionToken);
      
      if (!validation.isValid || !validation.session) {
        return;
      }

      const updates: Partial<SessionInfo> = {
        lastActivity: new Date(),
        activityCount: validation.session.activityCount + 1,
        lastAction: action,
        lastPage: page
      };

      // Update in store
      if (this.sessionStore) {
        await this.sessionStore.updateSession(sessionToken, updates);
      }

      // Update cache
      const cachedSession = this.sessionCache.get(sessionToken);
      if (cachedSession) {
        Object.assign(cachedSession, updates);
      }
    } catch (error) {
      console.error('[SessionController] Error updating activity:', error);
    }
  }

  /**
   * Get all sessions for a user
   */
  public async getUserSessions(userId: string, limit: number = 10): Promise<SessionInfo[]> {
    try {
      if (this.sessionStore) {
        return await this.sessionStore.getSessionsByUser(userId, limit);
      }
      return [];
    } catch (error) {
      console.error('[SessionController] Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Get active sessions for a user
   */
  public async getActiveSessions(userId: string): Promise<SessionInfo[]> {
    try {
      if (this.sessionStore) {
        return await this.sessionStore.getActiveSessions(userId);
      }
      return [];
    } catch (error) {
      console.error('[SessionController] Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Cleanup expired sessions
   * Should be called periodically (e.g., via cron job)
   */
  public async cleanupExpiredSessions(): Promise<number> {
    try {
      // Clear expired sessions from cache
      const now = new Date();
      for (const [token, session] of this.sessionCache.entries()) {
        if (session.expiresAt <= now) {
          this.sessionCache.delete(token);
        }
      }

      // Cleanup from store
      if (this.sessionStore) {
        return await this.sessionStore.cleanupExpiredSessions();
      }

      return 0;
    } catch (error) {
      console.error('[SessionController] Error cleaning up sessions:', error);
      return 0;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Generate a cryptographically secure session token
   */
  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a cryptographically secure refresh token
   */
  private generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Calculate risk score for a session
   * Higher score = more suspicious
   */
  private async calculateRiskScore(sessionData: SessionData): Promise<number> {
    let riskScore = 0;

    // Check for new IP address
    if (this.sessionStore) {
      const existingSessions = await this.sessionStore.getActiveSessions(sessionData.userId);
      
      const hasUsedIP = existingSessions.some(s => s.ipAddress === sessionData.ipAddress);
      if (!hasUsedIP && existingSessions.length > 0) {
        riskScore += 20;
      }

      // Check for new device
      const hasUsedDevice = existingSessions.some(s =>
        s.device.type === sessionData.device.type &&
        s.device.os === sessionData.device.os &&
        s.device.browser === sessionData.device.browser
      );
      if (!hasUsedDevice && existingSessions.length > 0) {
        riskScore += 15;
      }

      // Check for new location
      if (sessionData.location) {
        const hasUsedLocation = existingSessions.some(s =>
          s.location?.country === sessionData.location?.country &&
          s.location?.region === sessionData.location?.region
        );
        if (!hasUsedLocation && existingSessions.length > 0) {
          riskScore += 25;
        }
      }
    }

    // Check for non-secure connection
    if (!sessionData.isSecure) {
      riskScore += 10;
    }

    // Check for suspicious user agent
    if (this.isSuspiciousUserAgent(sessionData.userAgent)) {
      riskScore += 30;
    }

    return Math.min(riskScore, 100);
  }

  /**
   * Check if device is trusted based on previous sessions
   */
  private async isTrustedDevice(
    userId: string,
    ipAddress: string,
    device: SessionData['device']
  ): Promise<boolean> {
    if (!this.sessionStore) {
      return false;
    }

    const activeSessions = await this.sessionStore.getActiveSessions(userId);
    
    return activeSessions.some(s =>
      s.ipAddress === ipAddress &&
      s.device.type === device.type &&
      s.device.os === device.os &&
      s.device.browser === device.browser
    );
  }

  /**
   * Check if user agent is suspicious (bot, crawler, etc.)
   */
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python-requests/i,
      /java\//i,
      /php\//i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Update session activity in store
   */
  private async updateSessionActivity(
    sessionToken: string,
    session: SessionInfo
  ): Promise<void> {
    if (!this.sessionStore) {
      return;
    }

    const updates: Partial<SessionInfo> = {
      lastActivity: new Date(),
      activityCount: session.activityCount + 1
    };

    await this.sessionStore.updateSession(sessionToken, updates);
  }

  /**
   * Cache a session in memory
   */
  private cacheSession(sessionToken: string, session: SessionInfo): void {
    this.sessionCache.set(sessionToken, session);

    // Set cache expiration
    setTimeout(() => {
      this.sessionCache.delete(sessionToken);
    }, this.CACHE_TTL);
  }

  /**
   * Clear all cached sessions (useful for testing)
   */
  public clearCache(): void {
    this.sessionCache.clear();
  }

  /**
   * Get cache statistics (useful for monitoring)
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.sessionCache.size,
      keys: Array.from(this.sessionCache.keys())
    };
  }
}

// ============================================================================
// JWT Token Generation (for compatibility with existing JWT-based auth)
// ============================================================================

/**
 * Generate JWT token for session
 * This is separate from session tokens for backward compatibility
 */
export function generateJWT(userId: string, userType: 'user' | 'admin', expiresIn: string = '24h'): string {
  const env = getEnv();
  const JWT_SECRET = env.JWT_SECRET || 'development-secret';

  return jwt.sign(
    {
      id: userId,
      userType,
      timestamp: Date.now()
    },
    JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Verify JWT token
 */
export function verifyJWT(token: string): { id: string; userType: string } | null {
  try {
    const env = getEnv();
    const JWT_SECRET = env.JWT_SECRET || 'development-secret';
    
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    
    if (typeof decoded === 'string' || !decoded.id) {
      return null;
    }

    return {
      id: decoded.id as string,
      userType: (decoded.userType as string) || 'user'
    };
  } catch (error) {
    return null;
  }
}

// Export singleton instance
export const sessionController = SessionController.getInstance();
