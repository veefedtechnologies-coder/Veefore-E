import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemMetrics extends Document {
  _id: string;
  timestamp: Date;
  
  // Server Performance
  server: {
    cpu: {
      usage: number;
      loadAverage: number[];
      cores: number;
    };
    memory: {
      used: number;
      free: number;
      total: number;
      usagePercentage: number;
    };
    disk: {
      used: number;
      free: number;
      total: number;
      usagePercentage: number;
    };
    uptime: number;
    processId: number;
  };
  
  // Database Performance
  database: {
    connectionCount: number;
    activeConnections: number;
    queryTime: number;
    slowQueries: number;
    indexUsage: number;
    cacheHitRate: number;
    lockWaitTime: number;
  };
  
  // Application Metrics
  application: {
    requestCount: number;
    responseTime: number;
    errorRate: number;
    activeUsers: number;
    memoryUsage: number;
    heapUsed: number;
    heapTotal: number;
    eventLoopLag: number;
  };
  
  // API Performance
  api: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestsPerSecond: number;
  };
  
  // Business Metrics
  business: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    totalRevenue: number;
    dailyRevenue: number;
    subscriptionCount: number;
    churnRate: number;
    conversionRate: number;
  };
  
  // Error Tracking
  errorMetrics: {
    total: number;
    byType: Record<string, number>;
    bySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    recentErrors: Array<{
      message: string;
      stack: string;
      timestamp: Date;
      severity: string;
      count: number;
    }>;
  };
  
  // Security Metrics
  security: {
    failedLogins: number;
    blockedIPs: number;
    suspiciousActivity: number;
    securityAlerts: number;
    lastSecurityScan: Date;
    vulnerabilityCount: number;
  };
  
  // Network Metrics
  network: {
    bandwidthIn: number;
    bandwidthOut: number;
    latency: number;
    packetLoss: number;
    connectionCount: number;
  };
  
  // Custom Metrics
  customMetrics: Record<string, any>;
  
  // Health Status
  healthStatus: {
    overall: 'healthy' | 'warning' | 'critical' | 'down';
    services: {
      database: 'healthy' | 'warning' | 'critical' | 'down';
      api: 'healthy' | 'warning' | 'critical' | 'down';
      cache: 'healthy' | 'warning' | 'critical' | 'down';
      storage: 'healthy' | 'warning' | 'critical' | 'down';
    };
    alerts: Array<{
      type: string;
      message: string;
      severity: 'info' | 'warning' | 'error' | 'critical';
      timestamp: Date;
    }>;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const SystemMetricsSchema = new Schema<ISystemMetrics>({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Server Performance
  server: {
    cpu: {
      usage: { type: Number, required: true, min: 0, max: 100 },
      loadAverage: [{ type: Number }],
      cores: { type: Number, required: true }
    },
    memory: {
      used: { type: Number, required: true },
      free: { type: Number, required: true },
      total: { type: Number, required: true },
      usagePercentage: { type: Number, required: true, min: 0, max: 100 }
    },
    disk: {
      used: { type: Number, required: true },
      free: { type: Number, required: true },
      total: { type: Number, required: true },
      usagePercentage: { type: Number, required: true, min: 0, max: 100 }
    },
    uptime: { type: Number, required: true },
    processId: { type: Number, required: true }
  },
  
  // Database Performance
  database: {
    connectionCount: { type: Number, required: true },
    activeConnections: { type: Number, required: true },
    queryTime: { type: Number, required: true },
    slowQueries: { type: Number, required: true },
    indexUsage: { type: Number, required: true, min: 0, max: 100 },
    cacheHitRate: { type: Number, required: true, min: 0, max: 100 },
    lockWaitTime: { type: Number, required: true }
  },
  
  // Application Metrics
  application: {
    requestCount: { type: Number, required: true },
    responseTime: { type: Number, required: true },
    errorRate: { type: Number, required: true, min: 0, max: 100 },
    activeUsers: { type: Number, required: true },
    memoryUsage: { type: Number, required: true },
    heapUsed: { type: Number, required: true },
    heapTotal: { type: Number, required: true },
    eventLoopLag: { type: Number, required: true }
  },
  
  // API Performance
  api: {
    totalRequests: { type: Number, required: true },
    successfulRequests: { type: Number, required: true },
    failedRequests: { type: Number, required: true },
    averageResponseTime: { type: Number, required: true },
    p95ResponseTime: { type: Number, required: true },
    p99ResponseTime: { type: Number, required: true },
    requestsPerSecond: { type: Number, required: true }
  },
  
  // Business Metrics
  business: {
    totalUsers: { type: Number, required: true },
    activeUsers: { type: Number, required: true },
    newUsers: { type: Number, required: true },
    totalRevenue: { type: Number, required: true },
    dailyRevenue: { type: Number, required: true },
    subscriptionCount: { type: Number, required: true },
    churnRate: { type: Number, required: true, min: 0, max: 100 },
    conversionRate: { type: Number, required: true, min: 0, max: 100 }
  },
  
  // Error Tracking
  errorMetrics: {
    total: { type: Number, required: true },
    byType: { type: Map, of: Number },
    bySeverity: {
      critical: { type: Number, required: true },
      high: { type: Number, required: true },
      medium: { type: Number, required: true },
      low: { type: Number, required: true }
    },
    recentErrors: [{
      message: { type: String, required: true },
      stack: { type: String, required: true },
      timestamp: { type: Date, required: true },
      severity: { type: String, required: true, enum: ['critical', 'high', 'medium', 'low'] },
      count: { type: Number, required: true }
    }]
  },
  
  // Security Metrics
  security: {
    failedLogins: { type: Number, required: true },
    blockedIPs: { type: Number, required: true },
    suspiciousActivity: { type: Number, required: true },
    securityAlerts: { type: Number, required: true },
    lastSecurityScan: { type: Date, required: true },
    vulnerabilityCount: { type: Number, required: true }
  },
  
  // Network Metrics
  network: {
    bandwidthIn: { type: Number, required: true },
    bandwidthOut: { type: Number, required: true },
    latency: { type: Number, required: true },
    packetLoss: { type: Number, required: true, min: 0, max: 100 },
    connectionCount: { type: Number, required: true }
  },
  
  // Custom Metrics
  customMetrics: { type: Map, of: Schema.Types.Mixed },
  
  // Health Status
  healthStatus: {
    overall: {
      type: String,
      required: true,
      enum: ['healthy', 'warning', 'critical', 'down'],
      default: 'healthy'
    },
    services: {
      database: {
        type: String,
        required: true,
        enum: ['healthy', 'warning', 'critical', 'down'],
        default: 'healthy'
      },
      api: {
        type: String,
        required: true,
        enum: ['healthy', 'warning', 'critical', 'down'],
        default: 'healthy'
      },
      cache: {
        type: String,
        required: true,
        enum: ['healthy', 'warning', 'critical', 'down'],
        default: 'healthy'
      },
      storage: {
        type: String,
        required: true,
        enum: ['healthy', 'warning', 'critical', 'down'],
        default: 'healthy'
      }
    },
    alerts: [{
      type: { type: String, required: true },
      message: { type: String, required: true },
      severity: {
        type: String,
        required: true,
        enum: ['info', 'warning', 'error', 'critical']
      },
      timestamp: { type: Date, required: true, default: Date.now }
    }]
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
SystemMetricsSchema.index({ timestamp: -1 });
SystemMetricsSchema.index({ 'healthStatus.overall': 1 });
SystemMetricsSchema.index({ 'server.cpu.usage': 1 });
SystemMetricsSchema.index({ 'server.memory.usagePercentage': 1 });
SystemMetricsSchema.index({ 'database.queryTime': 1 });
SystemMetricsSchema.index({ 'api.averageResponseTime': 1 });
SystemMetricsSchema.index({ 'errorMetrics.total': 1 });

// Compound indexes for common queries
SystemMetricsSchema.index({ timestamp: -1, 'healthStatus.overall': 1 });
SystemMetricsSchema.index({ timestamp: -1, 'server.cpu.usage': 1 });
SystemMetricsSchema.index({ timestamp: -1, 'api.averageResponseTime': 1 });

export default mongoose.model<ISystemMetrics>('SystemMetrics', SystemMetricsSchema);
