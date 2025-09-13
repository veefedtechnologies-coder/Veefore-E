import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface IAdmin extends Document {
  _id: string;
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  level: number;
  team: string;
  permissions: string[];
  isActive: boolean;
  isEmailVerified: boolean;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  ipWhitelist: string[];
  deviceFingerprints: string[];
  
  // Advanced authentication features
  ssoProviders: {
    google?: {
      id: string;
      email: string;
    };
    github?: {
      id: string;
      username: string;
      email: string;
    };
  };
  
  // Enhanced device tracking
  deviceHistory: Array<{
    fingerprint: string;
    userAgent: string;
    ipAddress: string;
    location?: {
      country: string;
      city: string;
      region: string;
    };
    lastSeen: Date;
    isTrusted: boolean;
    deviceName?: string;
  }>;
  
  // Magic link authentication
  magicLinkTokens: Array<{
    token: string;
    expiresAt: Date;
    used: boolean;
    createdAt: Date;
  }>;
  
  // Session management
  sessions: Array<{
    sessionId: string;
    deviceInfo: string;
    ipAddress: string;
    location?: string;
    lastActivity: Date;
    isActive: boolean;
    userAgent: string;
  }>;
  
  // Security settings
  securitySettings: {
    require2FA: boolean;
    sessionTimeout: number; // in minutes
    maxSessions: number;
    allowConcurrentSessions: boolean;
    enableLocationTracking: boolean;
    enableDeviceTracking: boolean;
  };
  
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
  incLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  generateMagicLink(): string;
  addDeviceToHistory(fingerprint: string, userAgent: string, ipAddress: string, location?: any, deviceName?: string): void;
  isDeviceTrusted(fingerprint: string): boolean;
  isIPWhitelisted(ipAddress: string): boolean;
  addSession(sessionId: string, deviceInfo: string, ipAddress: string, location?: string, userAgent?: string): void;
  removeSession(sessionId: string): void;
  getActiveSessions(): any[];
  cleanupExpiredTokens(): void;
}

const AdminSchema = new Schema<IAdmin>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  username: {
    type: String,
    required: false, // Make it optional for existing records
    unique: true,
    sparse: true, // Allow multiple null values
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  role: {
    type: String,
    required: true,
    enum: ['superadmin', 'admin', 'support', 'billing', 'moderator', 'product', 'marketing', 'developer', 'sales', 'legal', 'aiops'],
    default: 'admin'
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 3
  },
  team: {
    type: String,
    required: true,
    enum: ['executive', 'support', 'billing', 'product', 'marketing', 'development', 'sales', 'legal', 'aiops'],
    default: 'support'
  },
  permissions: [{
    type: String,
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  ipWhitelist: [{
    type: String
  }],
  deviceFingerprints: [{
    type: String
  }],
  
  // Advanced authentication features
  ssoProviders: {
    google: {
      id: String,
      email: String
    },
    github: {
      id: String,
      username: String,
      email: String
    }
  },
  
  // Enhanced device tracking
  deviceHistory: [{
    fingerprint: {
      type: String,
      required: true
    },
    userAgent: {
      type: String,
      required: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    location: {
      country: String,
      city: String,
      region: String
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    isTrusted: {
      type: Boolean,
      default: false
    },
    deviceName: String
  }],
  
  // Magic link authentication
  magicLinkTokens: [{
    token: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    used: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Session management
  sessions: [{
    sessionId: {
      type: String,
      required: true
    },
    deviceInfo: {
      type: String,
      required: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    location: String,
    lastActivity: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    },
    userAgent: {
      type: String,
      required: true
    }
  }],
  
  // Security settings
  securitySettings: {
    require2FA: {
      type: Boolean,
      default: false
    },
    sessionTimeout: {
      type: Number,
      default: 480 // 8 hours in minutes
    },
    maxSessions: {
      type: Number,
      default: 5
    },
    allowConcurrentSessions: {
      type: Boolean,
      default: true
    },
    enableLocationTracking: {
      type: Boolean,
      default: true
    },
    enableDeviceTracking: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.twoFactorSecret;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes (removed duplicates - email already has unique: true, others defined in schema)
AdminSchema.index({ role: 1 });
AdminSchema.index({ team: 1 });
AdminSchema.index({ isActive: 1 });
AdminSchema.index({ createdAt: -1 });

// Virtual for full name
AdminSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save middleware to hash password
AdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare password
AdminSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if account is locked
AdminSchema.methods.isLocked = function(): boolean {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment login attempts
AdminSchema.methods.incLoginAttempts = async function(): Promise<void> {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates: any = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
AdminSchema.methods.resetLoginAttempts = async function(): Promise<void> {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Generate magic link
AdminSchema.methods.generateMagicLink = function(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
  this.magicLinkTokens.push({
    token,
    expiresAt,
    used: false,
    createdAt: new Date()
  });
  
  // Keep only last 5 magic link tokens
  if (this.magicLinkTokens.length > 5) {
    this.magicLinkTokens = this.magicLinkTokens.slice(-5);
  }
  
  return token;
};

// Add device to history
AdminSchema.methods.addDeviceToHistory = function(fingerprint: string, userAgent: string, ipAddress: string, location?: any, deviceName?: string) {
  const existingDevice = this.deviceHistory.find((device: any) => device.fingerprint === fingerprint);
  
  if (existingDevice) {
    existingDevice.lastSeen = new Date();
    existingDevice.ipAddress = ipAddress;
    if (location) {
      existingDevice.location = location;
    }
    if (deviceName) {
      existingDevice.deviceName = deviceName;
    }
  } else {
    this.deviceHistory.push({
      fingerprint,
      userAgent,
      ipAddress,
      location,
      lastSeen: new Date(),
      isTrusted: false,
      deviceName
    });
  }
  
  // Keep only last 20 devices
  if (this.deviceHistory.length > 20) {
    this.deviceHistory = this.deviceHistory.slice(-20);
  }
};

// Check if device is trusted
AdminSchema.methods.isDeviceTrusted = function(fingerprint: string): boolean {
  const device = this.deviceHistory.find((device: any) => device.fingerprint === fingerprint);
  return device ? device.isTrusted : false;
};

// Check if IP is whitelisted
AdminSchema.methods.isIPWhitelisted = function(ipAddress: string): boolean {
  if (this.ipWhitelist.length === 0) return true; // No whitelist means all IPs allowed
  return this.ipWhitelist.includes(ipAddress);
};

// Add session
AdminSchema.methods.addSession = function(sessionId: string, deviceInfo: string, ipAddress: string, location?: string, userAgent?: string) {
  // Remove old sessions if max sessions reached
  if (this.sessions.length >= this.securitySettings.maxSessions) {
    this.sessions = this.sessions.slice(-(this.securitySettings.maxSessions - 1));
  }
  
  this.sessions.push({
    sessionId,
    deviceInfo,
    ipAddress,
    location,
    lastActivity: new Date(),
    isActive: true,
    userAgent: userAgent || 'Unknown'
  });
};

// Remove session
AdminSchema.methods.removeSession = function(sessionId: string) {
  this.sessions = this.sessions.filter((session: any) => session.sessionId !== sessionId);
};

// Get active sessions
AdminSchema.methods.getActiveSessions = function() {
  return this.sessions.filter((session: any) => session.isActive);
};

// Cleanup expired tokens
AdminSchema.methods.cleanupExpiredTokens = function() {
  const now = new Date();
  this.magicLinkTokens = this.magicLinkTokens.filter((token: any) => token.expiresAt > now);
};

export default mongoose.model<IAdmin>('Admin', AdminSchema);
