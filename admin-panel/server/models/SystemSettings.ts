import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemSettings extends Document {
  _id: string;
  
  // Maintenance Mode
  maintenanceMode: {
    enabled: boolean;
    message: string;
    startTime?: Date;
    endTime?: Date;
    allowedIPs: string[]; // IPs that can bypass maintenance
    allowedAdmins: string[]; // Admin IDs that can bypass
    showCountdown: boolean;
    customPage?: string; // Custom maintenance page HTML
  };
  
  // Global Settings
  globalSettings: {
    appName: string;
    appVersion: string;
    timezone: string;
    currency: string;
    language: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
    theme: 'light' | 'dark' | 'auto';
  };
  
  // Security Settings
  security: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
      maxAge: number; // days
    };
    sessionSettings: {
      timeout: number; // minutes
      maxSessions: number;
      allowConcurrent: boolean;
      requireReauth: boolean; // for sensitive actions
    };
    twoFactorSettings: {
      required: boolean;
      backupCodes: boolean;
      smsEnabled: boolean;
      emailEnabled: boolean;
    };
    ipWhitelist: {
      enabled: boolean;
      ips: string[];
    };
    rateLimiting: {
      enabled: boolean;
      maxRequests: number;
      windowSize: number; // minutes
    };
  };
  
  // Email Settings
  emailSettings: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password: string;
    };
    from: {
      name: string;
      email: string;
    };
    templates: {
      welcome: string;
      passwordReset: string;
      ticketCreated: string;
      ticketUpdated: string;
      refundApproved: string;
      refundDenied: string;
    };
  };
  
  // Notification Settings
  notificationSettings: {
    channels: {
      email: boolean;
      push: boolean;
      sms: boolean;
      inApp: boolean;
    };
    preferences: {
      ticketUpdates: boolean;
      refundUpdates: boolean;
      systemAlerts: boolean;
      securityAlerts: boolean;
      marketingUpdates: boolean;
    };
    schedules: {
      quietHours: {
        enabled: boolean;
        start: string; // HH:MM
        end: string; // HH:MM
        timezone: string;
      };
      weekends: {
        enabled: boolean;
        days: number[]; // 0-6 (Sunday-Saturday)
      };
    };
  };
  
  // Analytics Settings
  analyticsSettings: {
    tracking: {
      enabled: boolean;
      googleAnalytics?: string;
      mixpanel?: string;
      amplitude?: string;
    };
    retention: {
      userData: number; // days
      adminData: number; // days
      logs: number; // days
    };
    reports: {
      autoGenerate: boolean;
      frequency: 'daily' | 'weekly' | 'monthly';
      recipients: string[];
    };
  };
  
  // AI Settings
  aiSettings: {
    openai: {
      apiKey: string;
      model: string;
      maxTokens: number;
      temperature: number;
      enabled: boolean;
    };
    moderation: {
      enabled: boolean;
      threshold: number; // 0-1
      autoBlock: boolean;
      notifyAdmins: boolean;
    };
    autoReply: {
      enabled: boolean;
      confidence: number; // 0-1
      maxLength: number;
    };
  };
  
  // Backup Settings
  backupSettings: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    retention: number; // days
    cloudStorage: {
      provider: 'aws' | 'gcp' | 'azure';
      bucket: string;
      region: string;
    };
    encryption: {
      enabled: boolean;
      key: string;
    };
  };
  
  // Feature Flags
  featureFlags: {
    [key: string]: {
      enabled: boolean;
      description: string;
      rolloutPercentage: number; // 0-100
      targetUsers?: string[]; // Specific user IDs
      targetRoles?: string[]; // Specific roles
    };
  };
  
  // API Settings
  apiSettings: {
    rateLimiting: {
      enabled: boolean;
      maxRequests: number;
      windowSize: number; // minutes
    };
    cors: {
      enabled: boolean;
      origins: string[];
      credentials: boolean;
    };
    versioning: {
      enabled: boolean;
      currentVersion: string;
      deprecatedVersions: string[];
    };
  };
  
  // Audit
  audit: {
    lastModifiedBy: string; // Admin ID
    lastModifiedAt: Date;
    changeHistory: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      changedBy: string; // Admin ID
      changedAt: Date;
      reason?: string;
    }>;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const SystemSettingsSchema = new Schema<ISystemSettings>({
  // Maintenance Mode
  maintenanceMode: {
    enabled: {
      type: Boolean,
      default: false
    },
    message: {
      type: String,
      default: 'We are currently performing scheduled maintenance. Please check back later.'
    },
    startTime: Date,
    endTime: Date,
    allowedIPs: [{
      type: String
    }],
    allowedAdmins: [{
      type: String,
      ref: 'Admin'
    }],
    showCountdown: {
      type: Boolean,
      default: true
    },
    customPage: String
  },
  
  // Global Settings
  globalSettings: {
    appName: {
      type: String,
      default: 'VeeFore Admin Panel'
    },
    appVersion: {
      type: String,
      default: '1.0.0'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    currency: {
      type: String,
      default: 'USD'
    },
    language: {
      type: String,
      default: 'en'
    },
    dateFormat: {
      type: String,
      default: 'YYYY-MM-DD'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '24h'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },
  
  // Security Settings
  security: {
    passwordPolicy: {
      minLength: {
        type: Number,
        default: 8
      },
      requireUppercase: {
        type: Boolean,
        default: true
      },
      requireLowercase: {
        type: Boolean,
        default: true
      },
      requireNumbers: {
        type: Boolean,
        default: true
      },
      requireSymbols: {
        type: Boolean,
        default: false
      },
      maxAge: {
        type: Number,
        default: 90 // days
      }
    },
    sessionSettings: {
      timeout: {
        type: Number,
        default: 480 // 8 hours in minutes
      },
      maxSessions: {
        type: Number,
        default: 5
      },
      allowConcurrent: {
        type: Boolean,
        default: true
      },
      requireReauth: {
        type: Boolean,
        default: true
      }
    },
    twoFactorSettings: {
      required: {
        type: Boolean,
        default: false
      },
      backupCodes: {
        type: Boolean,
        default: true
      },
      smsEnabled: {
        type: Boolean,
        default: false
      },
      emailEnabled: {
        type: Boolean,
        default: true
      }
    },
    ipWhitelist: {
      enabled: {
        type: Boolean,
        default: false
      },
      ips: [{
        type: String
      }]
    },
    rateLimiting: {
      enabled: {
        type: Boolean,
        default: true
      },
      maxRequests: {
        type: Number,
        default: 1000
      },
      windowSize: {
        type: Number,
        default: 15 // minutes
      }
    }
  },
  
  // Email Settings
  emailSettings: {
    smtp: {
      host: String,
      port: {
        type: Number,
        default: 587
      },
      secure: {
        type: Boolean,
        default: false
      },
      username: String,
      password: String
    },
    from: {
      name: {
        type: String,
        default: 'VeeFore Support'
      },
      email: {
        type: String,
        default: 'support@veefore.com'
      }
    },
    templates: {
      welcome: String,
      passwordReset: String,
      ticketCreated: String,
      ticketUpdated: String,
      refundApproved: String,
      refundDenied: String
    }
  },
  
  // Notification Settings
  notificationSettings: {
    channels: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: false
      },
      sms: {
        type: Boolean,
        default: false
      },
      inApp: {
        type: Boolean,
        default: true
      }
    },
    preferences: {
      ticketUpdates: {
        type: Boolean,
        default: true
      },
      refundUpdates: {
        type: Boolean,
        default: true
      },
      systemAlerts: {
        type: Boolean,
        default: true
      },
      securityAlerts: {
        type: Boolean,
        default: true
      },
      marketingUpdates: {
        type: Boolean,
        default: false
      }
    },
    schedules: {
      quietHours: {
        enabled: {
          type: Boolean,
          default: false
        },
        start: {
          type: String,
          default: '22:00'
        },
        end: {
          type: String,
          default: '08:00'
        },
        timezone: {
          type: String,
          default: 'UTC'
        }
      },
      weekends: {
        enabled: {
          type: Boolean,
          default: false
        },
        days: [{
          type: Number,
          min: 0,
          max: 6
        }]
      }
    }
  },
  
  // Analytics Settings
  analyticsSettings: {
    tracking: {
      enabled: {
        type: Boolean,
        default: true
      },
      googleAnalytics: String,
      mixpanel: String,
      amplitude: String
    },
    retention: {
      userData: {
        type: Number,
        default: 2555 // 7 years in days
      },
      adminData: {
        type: Number,
        default: 2555 // 7 years in days
      },
      logs: {
        type: Number,
        default: 90 // 90 days
      }
    },
    reports: {
      autoGenerate: {
        type: Boolean,
        default: false
      },
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'weekly'
      },
      recipients: [{
        type: String
      }]
    }
  },
  
  // AI Settings
  aiSettings: {
    openai: {
      apiKey: String,
      model: {
        type: String,
        default: 'gpt-4'
      },
      maxTokens: {
        type: Number,
        default: 1000
      },
      temperature: {
        type: Number,
        default: 0.7
      },
      enabled: {
        type: Boolean,
        default: false
      }
    },
    moderation: {
      enabled: {
        type: Boolean,
        default: true
      },
      threshold: {
        type: Number,
        default: 0.8
      },
      autoBlock: {
        type: Boolean,
        default: false
      },
      notifyAdmins: {
        type: Boolean,
        default: true
      }
    },
    autoReply: {
      enabled: {
        type: Boolean,
        default: false
      },
      confidence: {
        type: Number,
        default: 0.8
      },
      maxLength: {
        type: Number,
        default: 500
      }
    }
  },
  
  // Backup Settings
  backupSettings: {
    enabled: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'daily'
    },
    retention: {
      type: Number,
      default: 30 // days
    },
    cloudStorage: {
      provider: {
        type: String,
        enum: ['aws', 'gcp', 'azure']
      },
      bucket: String,
      region: String
    },
    encryption: {
      enabled: {
        type: Boolean,
        default: true
      },
      key: String
    }
  },
  
  // Feature Flags
  featureFlags: {
    type: Map,
    of: {
      enabled: Boolean,
      description: String,
      rolloutPercentage: {
        type: Number,
        min: 0,
        max: 100
      },
      targetUsers: [String],
      targetRoles: [String]
    },
    default: {}
  },
  
  // API Settings
  apiSettings: {
    rateLimiting: {
      enabled: {
        type: Boolean,
        default: true
      },
      maxRequests: {
        type: Number,
        default: 1000
      },
      windowSize: {
        type: Number,
        default: 15 // minutes
      }
    },
    cors: {
      enabled: {
        type: Boolean,
        default: true
      },
      origins: [{
        type: String
      }],
      credentials: {
        type: Boolean,
        default: true
      }
    },
    versioning: {
      enabled: {
        type: Boolean,
        default: false
      },
      currentVersion: {
        type: String,
        default: 'v1'
      },
      deprecatedVersions: [{
        type: String
      }]
    }
  },
  
  // Audit
  audit: {
    lastModifiedBy: {
      type: String,
      ref: 'Admin'
    },
    lastModifiedAt: {
      type: Date,
      default: Date.now
    },
    changeHistory: [{
      field: {
        type: String,
        required: true
      },
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
      changedBy: {
        type: String,
        required: true,
        ref: 'Admin'
      },
      changedAt: {
        type: Date,
        default: Date.now
      },
      reason: String
    }]
  }
}, {
  timestamps: true
});

// Ensure only one system settings document exists
SystemSettingsSchema.index({}, { unique: true });

export default mongoose.model<ISystemSettings>('SystemSettings', SystemSettingsSchema);
