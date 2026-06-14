import mongoose, { Document, Schema } from 'mongoose';
import { ISessionStore, SessionInfo } from '../controllers/SessionController';

/**
 * MongoDB Session Store Implementation
 * 
 * Implements ISessionStore interface using MongoDB for persistence.
 * Compatible with existing Session models in both Main_App and Admin_Panel.
 * 
 * Validates: Requirements 5.2, 6.3
 */

// ============================================================================
// MongoDB Session Schema
// ============================================================================

export interface IMongoSession extends Document {
  userId: string;
  userType: 'user' | 'admin';
  sessionToken: string;
  refreshToken?: string;
  ipAddress: string;
  userAgent: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  };
  device: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
    version: string;
  };
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
  updatedAt: Date;
}

const MongoSessionSchema = new Schema<IMongoSession>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  userType: {
    type: String,
    enum: ['user', 'admin'],
    required: true,
    index: true
  },
  sessionToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  refreshToken: {
    type: String,
    index: true
  },
  ipAddress: {
    type: String,
    required: true,
    index: true
  },
  userAgent: {
    type: String,
    required: true
  },
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String
  },
  device: {
    type: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet'],
      required: true
    },
    os: {
      type: String,
      required: true
    },
    browser: {
      type: String,
      required: true
    },
    version: {
      type: String,
      required: true
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  isSecure: {
    type: Boolean,
    default: false
  },
  isTrusted: {
    type: Boolean,
    default: false
  },
  riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  activityCount: {
    type: Number,
    default: 0
  },
  lastAction: String,
  lastPage: String
}, {
  timestamps: true
});

// Compound indexes for efficient queries
MongoSessionSchema.index({ userId: 1, isActive: 1 });
MongoSessionSchema.index({ lastActivity: -1 });
MongoSessionSchema.index({ ipAddress: 1, userId: 1 });
MongoSessionSchema.index({ sessionToken: 1, isActive: 1 });
MongoSessionSchema.index({ userId: 1, lastActivity: -1 });
MongoSessionSchema.index({ isActive: 1, expiresAt: 1 });

// Create model
const MongoSessionModel = mongoose.model<IMongoSession>('SharedSession', MongoSessionSchema);

// ============================================================================
// MongoSessionStore Implementation
// ============================================================================

export class MongoSessionStore implements ISessionStore {
  private static instance: MongoSessionStore;

  private constructor() {}

  public static getInstance(): MongoSessionStore {
    if (!MongoSessionStore.instance) {
      MongoSessionStore.instance = new MongoSessionStore();
    }
    return MongoSessionStore.instance;
  }

  /**
   * Save a session to MongoDB
   */
  async saveSession(session: SessionInfo): Promise<void> {
    try {
      await MongoSessionModel.create({
        userId: session.userId,
        userType: session.userType,
        sessionToken: (session as any).sessionToken,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        location: session.location,
        device: session.device,
        isActive: session.isActive,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        isSecure: session.isSecure,
        isTrusted: session.isTrusted,
        riskScore: session.riskScore,
        activityCount: session.activityCount,
        lastAction: session.lastAction,
        lastPage: session.lastPage
      });
    } catch (error) {
      console.error('[MongoSessionStore] Error saving session:', error);
      throw error;
    }
  }

  /**
   * Get a session by token
   */
  async getSession(sessionToken: string): Promise<SessionInfo | null> {
    try {
      const session = await MongoSessionModel.findOne({
        sessionToken,
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        return null;
      }

      return this.transformSession(session);
    } catch (error) {
      console.error('[MongoSessionStore] Error getting session:', error);
      return null;
    }
  }

  /**
   * Update a session
   */
  async updateSession(sessionToken: string, updates: Partial<SessionInfo>): Promise<void> {
    try {
      await MongoSessionModel.updateOne(
        { sessionToken, isActive: true },
        { $set: updates }
      );
    } catch (error) {
      console.error('[MongoSessionStore] Error updating session:', error);
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionToken: string): Promise<boolean> {
    try {
      const result = await MongoSessionModel.updateOne(
        { sessionToken },
        { $set: { isActive: false } }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error('[MongoSessionStore] Error deleting session:', error);
      return false;
    }
  }

  /**
   * Get sessions for a user
   */
  async getSessionsByUser(userId: string, limit: number = 10): Promise<SessionInfo[]> {
    try {
      const sessions = await MongoSessionModel.find({ userId })
        .sort({ lastActivity: -1 })
        .limit(limit);

      return sessions.map(s => this.transformSession(s));
    } catch (error) {
      console.error('[MongoSessionStore] Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const sessions = await MongoSessionModel.find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).sort({ lastActivity: -1 });

      return sessions.map(s => this.transformSession(s));
    } catch (error) {
      console.error('[MongoSessionStore] Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteAllUserSessions(userId: string, excludeToken?: string): Promise<number> {
    try {
      const query: any = { userId, isActive: true };
      if (excludeToken) {
        query.sessionToken = { $ne: excludeToken };
      }

      const result = await MongoSessionModel.updateMany(
        query,
        { $set: { isActive: false } }
      );

      return result.modifiedCount;
    } catch (error) {
      console.error('[MongoSessionStore] Error deleting user sessions:', error);
      return 0;
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await MongoSessionModel.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      return result.deletedCount || 0;
    } catch (error) {
      console.error('[MongoSessionStore] Error cleaning up sessions:', error);
      return 0;
    }
  }

  /**
   * Transform MongoDB document to SessionInfo
   */
  private transformSession(session: IMongoSession): SessionInfo {
    return {
      id: session._id.toString(),
      userId: session.userId,
      userType: session.userType,
      sessionToken: session.sessionToken,
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
    } as any;
  }
}

// Export singleton instance
export const mongoSessionStore = MongoSessionStore.getInstance();
