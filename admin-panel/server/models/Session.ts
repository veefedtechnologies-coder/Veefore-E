import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  _id: string;
  adminId: string;
  sessionToken: string;
  refreshToken?: string;
  
  // Session details
  ipAddress: string;
  userAgent: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  };
  
  // Device information
  device: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
    version: string;
  };
  
  // Session status
  isActive: boolean;
  lastActivity: Date;
  expiresAt: Date;
  
  // Security
  isSecure: boolean; // HTTPS connection
  isTrusted: boolean; // Trusted device/location
  riskScore: number; // 0-100, higher = more risky
  
  // Activity tracking
  activityCount: number;
  lastAction?: string;
  lastPage?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>({
  adminId: {
    type: String,
    required: true,
    ref: 'Admin',
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
  
  // Session details
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
  
  // Device information
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
  
  // Session status
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
  
  // Security
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
  
  // Activity tracking
  activityCount: {
    type: Number,
    default: 0
  },
  lastAction: String,
  lastPage: String
}, {
  timestamps: true
});

// Indexes (removed duplicate - expiresAt already has index: true)
SessionSchema.index({ adminId: 1, isActive: 1 });
SessionSchema.index({ lastActivity: -1 });
SessionSchema.index({ ipAddress: 1, adminId: 1 });
SessionSchema.index({ sessionToken: 1, isActive: 1 });

// Compound indexes
SessionSchema.index({ adminId: 1, lastActivity: -1 });
SessionSchema.index({ isActive: 1, expiresAt: 1 });

export default mongoose.model<ISession>('Session', SessionSchema);
