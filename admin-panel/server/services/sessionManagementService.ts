import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Session from '../models/Session';
import Admin from '../models/Admin';

export interface SessionData {
  sessionId: string;
  adminId: string;
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
  adminId: string;
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

export class SessionManagementService {
  private static instance: SessionManagementService;
  private sessionCache: Map<string, SessionInfo> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): SessionManagementService {
    if (!SessionManagementService.instance) {
      SessionManagementService.instance = new SessionManagementService();
    }
    return SessionManagementService.instance;
  }

  // Create new session
  public async createSession(sessionData: SessionData): Promise<{
    sessionToken: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    try {
      const sessionToken = this.generateSessionToken();
      const refreshToken = this.generateRefreshToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Calculate risk score
      const riskScore = await this.calculateRiskScore(sessionData);

      // Check if device is trusted
      const isTrusted = await this.isTrustedDevice(sessionData.adminId, sessionData.ipAddress, sessionData.device);

      const session = new Session({
        adminId: sessionData.adminId,
        sessionToken,
        refreshToken,
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        location: sessionData.location,
        device: sessionData.device,
        isActive: true,
        expiresAt,
        isSecure: sessionData.isSecure,
        isTrusted,
        riskScore
      });

      await session.save();

      // Cache session
      this.cacheSession(session);

      return {
        sessionToken,
        refreshToken,
        expiresAt
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  // Validate session
  public async validateSession(sessionToken: string): Promise<SessionInfo | null> {
    try {
      // Check cache first
      const cachedSession = this.sessionCache.get(sessionToken);
      if (cachedSession && cachedSession.expiresAt > new Date()) {
        return cachedSession;
      }

      // Check database
      const session = await Session.findOne({
        sessionToken,
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        return null;
      }

      // Update last activity
      session.lastActivity = new Date();
      session.activityCount += 1;
      await session.save();

      // Cache session
      this.cacheSession(session);

      return this.transformSession(session);
    } catch (error) {
      console.error('Error validating session:', error);
      return null;
    }
  }

  // Update session activity
  public async updateSessionActivity(sessionToken: string, action?: string, page?: string): Promise<void> {
    try {
      const session = await Session.findOne({ sessionToken, isActive: true });
      if (session) {
        session.lastActivity = new Date();
        session.activityCount += 1;
        if (action) session.lastAction = action;
        if (page) session.lastPage = page;
        await session.save();

        // Update cache
        this.cacheSession(session);
      }
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  }

  // Get admin sessions
  public async getAdminSessions(adminId: string, limit: number = 10): Promise<SessionInfo[]> {
    try {
      const sessions = await Session.find({ adminId })
        .sort({ lastActivity: -1 })
        .limit(limit);

      return sessions.map(session => this.transformSession(session));
    } catch (error) {
      console.error('Error fetching admin sessions:', error);
      return [];
    }
  }

  // Get active sessions
  public async getActiveSessions(adminId: string): Promise<SessionInfo[]> {
    try {
      const sessions = await Session.find({
        adminId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).sort({ lastActivity: -1 });

      return sessions.map(session => this.transformSession(session));
    } catch (error) {
      console.error('Error fetching active sessions:', error);
      return [];
    }
  }

  // Terminate session
  public async terminateSession(sessionToken: string): Promise<boolean> {
    try {
      const session = await Session.findOneAndUpdate(
        { sessionToken },
        { isActive: false },
        { new: true }
      );

      if (session) {
        // Remove from cache
        this.sessionCache.delete(sessionToken);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error terminating session:', error);
      return false;
    }
  }

  // Terminate all sessions for admin
  public async terminateAllSessions(adminId: string, excludeSessionToken?: string): Promise<number> {
    try {
      const query: any = { adminId, isActive: true };
      if (excludeSessionToken) {
        query.sessionToken = { $ne: excludeSessionToken };
      }

      const result = await Session.updateMany(query, { isActive: false });

      // Clear cache for this admin
      for (const [token, session] of this.sessionCache.entries()) {
        if (session.adminId === adminId) {
          this.sessionCache.delete(token);
        }
      }

      return result.modifiedCount;
    } catch (error) {
      console.error('Error terminating all sessions:', error);
      return 0;
    }
  }

  // Terminate sessions by criteria
  public async terminateSessionsByCriteria(criteria: {
    adminId?: string;
    ipAddress?: string;
    deviceType?: string;
    riskScoreMin?: number;
    inactiveSince?: Date;
  }): Promise<number> {
    try {
      const query: any = { isActive: true };

      if (criteria.adminId) query.adminId = criteria.adminId;
      if (criteria.ipAddress) query.ipAddress = criteria.ipAddress;
      if (criteria.deviceType) query['device.type'] = criteria.deviceType;
      if (criteria.riskScoreMin) query.riskScore = { $gte: criteria.riskScoreMin };
      if (criteria.inactiveSince) query.lastActivity = { $lt: criteria.inactiveSince };

      const result = await Session.updateMany(query, { isActive: false });

      // Clear relevant cache entries
      for (const [token, session] of this.sessionCache.entries()) {
        let shouldRemove = false;

        if (criteria.adminId && session.adminId === criteria.adminId) shouldRemove = true;
        if (criteria.ipAddress && session.ipAddress === criteria.ipAddress) shouldRemove = true;
        if (criteria.deviceType && session.device.type === criteria.deviceType) shouldRemove = true;
        if (criteria.riskScoreMin && session.riskScore >= criteria.riskScoreMin) shouldRemove = true;
        if (criteria.inactiveSince && session.lastActivity < criteria.inactiveSince) shouldRemove = true;

        if (shouldRemove) {
          this.sessionCache.delete(token);
        }
      }

      return result.modifiedCount;
    } catch (error) {
      console.error('Error terminating sessions by criteria:', error);
      return 0;
    }
  }

  // Get session statistics
  public async getSessionStats(adminId?: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    byDevice: { [key: string]: number };
    byLocation: { [key: string]: number };
    riskDistribution: { [key: string]: number };
  }> {
    try {
      const matchQuery = adminId ? { adminId } : {};

      const [
        total,
        active,
        inactive,
        byDevice,
        byLocation,
        riskDistribution
      ] = await Promise.all([
        Session.countDocuments(matchQuery),
        Session.countDocuments({ ...matchQuery, isActive: true, expiresAt: { $gt: new Date() } }),
        Session.countDocuments({ ...matchQuery, isActive: false }),
        Session.aggregate([
          { $match: matchQuery },
          { $group: { _id: '$device.type', count: { $sum: 1 } } }
        ]),
        Session.aggregate([
          { $match: { ...matchQuery, 'location.country': { $exists: true } } },
          { $group: { _id: '$location.country', count: { $sum: 1 } } }
        ]),
        Session.aggregate([
          { $match: matchQuery },
          {
            $bucket: {
              groupBy: '$riskScore',
              boundaries: [0, 25, 50, 75, 100],
              default: '100+',
              output: { count: { $sum: 1 } }
            }
          }
        ])
      ]);

      return {
        total,
        active,
        inactive,
        byDevice: byDevice.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byLocation: byLocation.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        riskDistribution: riskDistribution.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      return {
        total: 0,
        active: 0,
        inactive: 0,
        byDevice: {},
        byLocation: {},
        riskDistribution: {}
      };
    }
  }

  // Clean up expired sessions
  public async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await Session.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      // Clear expired sessions from cache
      for (const [token, session] of this.sessionCache.entries()) {
        if (session.expiresAt < new Date()) {
          this.sessionCache.delete(token);
        }
      }

      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  // Generate session token
  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate refresh token
  private generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Calculate risk score
  private async calculateRiskScore(sessionData: SessionData): Promise<number> {
    let riskScore = 0;

    // Check for new IP address
    const existingSessions = await Session.find({
      adminId: sessionData.adminId,
      isActive: true
    });

    const hasUsedIP = existingSessions.some(s => s.ipAddress === sessionData.ipAddress);
    if (!hasUsedIP) riskScore += 20;

    // Check for new device
    const hasUsedDevice = existingSessions.some(s => 
      s.device.type === sessionData.device.type &&
      s.device.os === sessionData.device.os &&
      s.device.browser === sessionData.device.browser
    );
    if (!hasUsedDevice) riskScore += 15;

    // Check for new location
    if (sessionData.location) {
      const hasUsedLocation = existingSessions.some(s => 
        s.location?.country === sessionData.location?.country &&
        s.location?.region === sessionData.location?.region
      );
      if (!hasUsedLocation) riskScore += 25;
    }

    // Check for non-secure connection
    if (!sessionData.isSecure) riskScore += 10;

    // Check for suspicious user agent
    if (this.isSuspiciousUserAgent(sessionData.userAgent)) riskScore += 30;

    return Math.min(riskScore, 100);
  }

  // Check if device is trusted
  private async isTrustedDevice(adminId: string, ipAddress: string, device: any): Promise<boolean> {
    const trustedSessions = await Session.find({
      adminId,
      ipAddress,
      'device.type': device.type,
      'device.os': device.os,
      'device.browser': device.browser,
      isActive: true
    });

    return trustedSessions.length > 0;
  }

  // Check for suspicious user agent
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
      /php/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  // Cache session
  private cacheSession(session: any): void {
    const sessionInfo = this.transformSession(session);
    this.sessionCache.set(session.sessionToken, sessionInfo);

    // Set cache expiration
    setTimeout(() => {
      this.sessionCache.delete(session.sessionToken);
    }, this.CACHE_TTL);
  }

  // Transform session to SessionInfo
  private transformSession(session: any): SessionInfo {
    return {
      id: session._id,
      adminId: session.adminId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      device: session.device,
      location: session.location,
      isActive: session.isActive,
      lastActivity: session.lastActivity,
      expiresAt: session.expiresAt,
      isSecure: session.isSecure,
      isTrusted: session.isTrusted,
      riskScore: session.riskScore,
      activityCount: session.activityCount,
      lastAction: session.lastAction,
      lastPage: session.lastPage,
      createdAt: session.createdAt
    };
  }
}
