import mongoose, { Document, Schema } from 'mongoose';

export interface IMaintenanceMode extends Document {
  _id: string;
  isActive: boolean;
  
  // Maintenance details
  title: string;
  message: string;
  description?: string;
  
  // Scheduling
  scheduledStart: Date;
  scheduledEnd: Date;
  estimatedDuration: number; // in minutes
  timezone: string;
  
  // Maintenance type
  type: 'scheduled' | 'emergency' | 'update' | 'migration' | 'security';
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  // Affected services
  affectedServices: Array<{
    name: string;
    status: 'down' | 'degraded' | 'maintenance';
    description?: string;
  }>;
  
  // User experience
  userExperience: {
    showMaintenancePage: boolean;
    allowReadOnlyAccess: boolean;
    redirectUrl?: string;
    customPageContent?: string;
    showProgress: boolean;
    progressPercentage?: number;
  };
  
  // Notifications
  notifications: {
    emailUsers: boolean;
    emailAdmins: boolean;
    inAppNotification: boolean;
    socialMedia: boolean;
    statusPage: boolean;
    customMessage?: string;
    notifyBefore: number; // minutes before maintenance
  };
  
  // Access control
  accessControl: {
    allowAdminAccess: boolean;
    allowSpecificUsers: string[]; // User IDs
    allowSpecificIPs: string[]; // IP addresses
    allowSpecificRoles: string[]; // Role names
    bypassToken?: string; // Secret token for bypass
  };
  
  // Progress tracking
  progress: {
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
    status: 'preparing' | 'in_progress' | 'completing' | 'completed' | 'failed';
    lastUpdate: Date;
    notes: Array<{
      timestamp: Date;
      message: string;
      author: string;
    }>;
  };
  
  // Rollback
  rollback: {
    canRollback: boolean;
    rollbackSteps: string[];
    rollbackTriggered: boolean;
    rollbackReason?: string;
    rollbackInitiatedBy?: string;
    rollbackInitiatedAt?: Date;
  };
  
  // Monitoring
  monitoring: {
    monitorSystemHealth: boolean;
    alertThresholds: {
      cpu: number;
      memory: number;
      disk: number;
      responseTime: number;
    };
    alerts: Array<{
      timestamp: Date;
      type: 'warning' | 'error' | 'critical';
      message: string;
      resolved: boolean;
    }>;
  };
  
  // Communication
  communication: {
    statusPageUrl?: string;
    socialMediaPosts: Array<{
      platform: string;
      content: string;
      postedAt: Date;
      url?: string;
    }>;
    supportChannels: Array<{
      type: 'email' | 'chat' | 'phone';
      contact: string;
      available: boolean;
    }>;
  };
  
  // Analytics
  analytics: {
    usersAffected: number;
    pageViews: number;
    bounceRate: number;
    userFeedback: Array<{
      rating: number;
      comment: string;
      timestamp: Date;
      userId?: string;
    }>;
  };
  
  // Audit
  createdBy: string; // Admin ID
  lastModifiedBy: string; // Admin ID
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceModeSchema = new Schema<IMaintenanceMode>({
  isActive: {
    type: Boolean,
    default: false
  },
  
  // Maintenance details
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  description: {
    type: String,
    maxlength: 2000
  },
  
  // Scheduling
  scheduledStart: {
    type: Date,
    required: true
  },
  scheduledEnd: {
    type: Date,
    required: true
  },
  estimatedDuration: {
    type: Number,
    required: true,
    min: 1
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  
  // Maintenance type
  type: {
    type: String,
    required: true,
    enum: ['scheduled', 'emergency', 'update', 'migration', 'security'],
    default: 'scheduled'
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Affected services
  affectedServices: [{
    name: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['down', 'degraded', 'maintenance'],
      required: true
    },
    description: String
  }],
  
  // User experience
  userExperience: {
    showMaintenancePage: {
      type: Boolean,
      default: true
    },
    allowReadOnlyAccess: {
      type: Boolean,
      default: false
    },
    redirectUrl: String,
    customPageContent: String,
    showProgress: {
      type: Boolean,
      default: true
    },
    progressPercentage: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  
  // Notifications
  notifications: {
    emailUsers: {
      type: Boolean,
      default: true
    },
    emailAdmins: {
      type: Boolean,
      default: true
    },
    inAppNotification: {
      type: Boolean,
      default: true
    },
    socialMedia: {
      type: Boolean,
      default: false
    },
    statusPage: {
      type: Boolean,
      default: true
    },
    customMessage: String,
    notifyBefore: {
      type: Number,
      default: 60 // 1 hour
    }
  },
  
  // Access control
  accessControl: {
    allowAdminAccess: {
      type: Boolean,
      default: true
    },
    allowSpecificUsers: [{
      type: String,
      ref: 'User'
    }],
    allowSpecificIPs: [{
      type: String
    }],
    allowSpecificRoles: [{
      type: String
    }],
    bypassToken: String
  },
  
  // Progress tracking
  progress: {
    currentStep: {
      type: String,
      default: 'preparing'
    },
    totalSteps: {
      type: Number,
      default: 1
    },
    completedSteps: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['preparing', 'in_progress', 'completing', 'completed', 'failed'],
      default: 'preparing'
    },
    lastUpdate: {
      type: Date,
      default: Date.now
    },
    notes: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      message: {
        type: String,
        required: true
      },
      author: {
        type: String,
        required: true
      }
    }]
  },
  
  // Rollback
  rollback: {
    canRollback: {
      type: Boolean,
      default: false
    },
    rollbackSteps: [{
      type: String
    }],
    rollbackTriggered: {
      type: Boolean,
      default: false
    },
    rollbackReason: String,
    rollbackInitiatedBy: {
      type: String,
      ref: 'Admin'
    },
    rollbackInitiatedAt: Date
  },
  
  // Monitoring
  monitoring: {
    monitorSystemHealth: {
      type: Boolean,
      default: true
    },
    alertThresholds: {
      cpu: {
        type: Number,
        default: 80
      },
      memory: {
        type: Number,
        default: 85
      },
      disk: {
        type: Number,
        default: 90
      },
      responseTime: {
        type: Number,
        default: 5000 // 5 seconds
      }
    },
    alerts: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      type: {
        type: String,
        enum: ['warning', 'error', 'critical'],
        required: true
      },
      message: {
        type: String,
        required: true
      },
      resolved: {
        type: Boolean,
        default: false
      }
    }]
  },
  
  // Communication
  communication: {
    statusPageUrl: String,
    socialMediaPosts: [{
      platform: {
        type: String,
        required: true
      },
      content: {
        type: String,
        required: true
      },
      postedAt: {
        type: Date,
        default: Date.now
      },
      url: String
    }],
    supportChannels: [{
      type: {
        type: String,
        enum: ['email', 'chat', 'phone'],
        required: true
      },
      contact: {
        type: String,
        required: true
      },
      available: {
        type: Boolean,
        default: true
      }
    }]
  },
  
  // Analytics
  analytics: {
    usersAffected: {
      type: Number,
      default: 0
    },
    pageViews: {
      type: Number,
      default: 0
    },
    bounceRate: {
      type: Number,
      default: 0
    },
    userFeedback: [{
      rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
      },
      comment: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      userId: {
        type: String,
        ref: 'User'
      }
    }]
  },
  
  // Audit
  createdBy: {
    type: String,
    required: true,
    ref: 'Admin'
  },
  lastModifiedBy: {
    type: String,
    required: true,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes
MaintenanceModeSchema.index({ isActive: 1 });
MaintenanceModeSchema.index({ scheduledStart: 1, scheduledEnd: 1 });
MaintenanceModeSchema.index({ type: 1, priority: 1 });
MaintenanceModeSchema.index({ createdAt: -1 });

// Virtual for duration in minutes
MaintenanceModeSchema.virtual('duration').get(function() {
  return Math.floor((this.scheduledEnd.getTime() - this.scheduledStart.getTime()) / (1000 * 60));
});

// Virtual for time remaining
MaintenanceModeSchema.virtual('timeRemaining').get(function() {
  if (!this.isActive) return 0;
  const now = new Date();
  const remaining = this.scheduledEnd.getTime() - now.getTime();
  return Math.max(0, Math.floor(remaining / (1000 * 60)));
});

// Virtual for progress percentage
MaintenanceModeSchema.virtual('progressPercentage').get(function() {
  if (this.progress.totalSteps === 0) return 0;
  return Math.round((this.progress.completedSteps / this.progress.totalSteps) * 100);
});

// Method to start maintenance
MaintenanceModeSchema.methods.startMaintenance = function() {
  this.isActive = true;
  this.progress.status = 'in_progress';
  this.progress.lastUpdate = new Date();
  return this.save();
};

// Method to end maintenance
MaintenanceModeSchema.methods.endMaintenance = function() {
  this.isActive = false;
  this.progress.status = 'completed';
  this.progress.completedSteps = this.progress.totalSteps;
  this.progress.lastUpdate = new Date();
  return this.save();
};

// Method to add progress note
MaintenanceModeSchema.methods.addProgressNote = function(message: string, author: string) {
  this.progress.notes.push({
    timestamp: new Date(),
    message,
    author
  });
  this.progress.lastUpdate = new Date();
  return this.save();
};

// Method to update progress
MaintenanceModeSchema.methods.updateProgress = function(step: string, completedSteps: number) {
  this.progress.currentStep = step;
  this.progress.completedSteps = completedSteps;
  this.progress.lastUpdate = new Date();
  
  if (completedSteps >= this.progress.totalSteps) {
    this.progress.status = 'completing';
  }
  
  return this.save();
};

// Method to trigger rollback
MaintenanceModeSchema.methods.triggerRollback = function(reason: string, initiatedBy: string) {
  this.rollback.rollbackTriggered = true;
  this.rollback.rollbackReason = reason;
  this.rollback.rollbackInitiatedBy = initiatedBy;
  this.rollback.rollbackInitiatedAt = new Date();
  this.progress.status = 'failed';
  return this.save();
};

// Method to add alert
MaintenanceModeSchema.methods.addAlert = function(type: string, message: string) {
  this.monitoring.alerts.push({
    timestamp: new Date(),
    type,
    message,
    resolved: false
  });
  return this.save();
};

// Method to resolve alert
MaintenanceModeSchema.methods.resolveAlert = function(alertIndex: number) {
  if (this.monitoring.alerts[alertIndex]) {
    this.monitoring.alerts[alertIndex].resolved = true;
  }
  return this.save();
};

// Static method to get current maintenance
MaintenanceModeSchema.statics.getCurrentMaintenance = function() {
  return this.findOne({ isActive: true });
};

// Static method to get upcoming maintenance
MaintenanceModeSchema.statics.getUpcomingMaintenance = function() {
  const now = new Date();
  return this.find({
    isActive: false,
    scheduledStart: { $gt: now }
  }).sort({ scheduledStart: 1 });
};

// Static method to get maintenance history
MaintenanceModeSchema.statics.getMaintenanceHistory = function(limit: number = 10) {
  return this.find({
    isActive: false,
    scheduledEnd: { $lt: new Date() }
  }).sort({ scheduledEnd: -1 }).limit(limit);
};

export default mongoose.model<IMaintenanceMode>('MaintenanceMode', MaintenanceModeSchema);
