import os from 'os';
import process from 'process';
import mongoose from 'mongoose';
import SystemMetrics from '../models/SystemMetrics';
import { performance } from 'perf_hooks';

export class SystemMonitoringService {
  private static instance: SystemMonitoringService;
  private metricsInterval: NodeJS.Timeout | null = null;
  private isCollecting = false;

  private constructor() {}

  public static getInstance(): SystemMonitoringService {
    if (!SystemMonitoringService.instance) {
      SystemMonitoringService.instance = new SystemMonitoringService();
    }
    return SystemMonitoringService.instance;
  }

  public startCollection(intervalMs: number = 60000): void {
    if (this.isCollecting) {
      console.log('⚠️ System monitoring already running');
      return;
    }

    this.isCollecting = true;
    console.log('🔍 Starting system monitoring collection...');

    // Collect initial metrics
    this.collectMetrics();

    // Set up interval
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
  }

  public stopCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    this.isCollecting = false;
    console.log('⏹️ System monitoring stopped');
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.gatherSystemMetrics();
      await this.saveMetrics(metrics);
    } catch (error) {
      console.error('❌ Error collecting system metrics:', error);
    }
  }

  private async gatherSystemMetrics(): Promise<any> {
    const startTime = performance.now();

    // Server Performance
    const serverMetrics = this.getServerMetrics();
    
    // Database Performance
    const databaseMetrics = await this.getDatabaseMetrics();
    
    // Application Metrics
    const applicationMetrics = this.getApplicationMetrics();
    
    // API Performance
    const apiMetrics = await this.getAPIMetrics();
    
    // Business Metrics
    const businessMetrics = await this.getBusinessMetrics();
    
    // Error Tracking
    const errorMetrics = await this.getErrorMetrics();
    
    // Security Metrics
    const securityMetrics = await this.getSecurityMetrics();
    
    // Network Metrics
    const networkMetrics = this.getNetworkMetrics();
    
    // Health Status
    const healthStatus = this.calculateHealthStatus({
      server: serverMetrics,
      database: databaseMetrics,
      application: applicationMetrics,
      api: apiMetrics,
      errorMetrics: errorMetrics
    });

    const collectionTime = performance.now() - startTime;

    return {
      timestamp: new Date(),
      server: serverMetrics,
      database: databaseMetrics,
      application: applicationMetrics,
      api: apiMetrics,
      business: businessMetrics,
      errorMetrics: errorMetrics,
      security: securityMetrics,
      network: networkMetrics,
      healthStatus,
      customMetrics: {
        collectionTime,
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch()
      }
    };
  }

  private getServerMetrics(): any {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      cpu: {
        usage: this.getCPUUsage(),
        loadAverage: os.loadavg(),
        cores: cpus.length
      },
      memory: {
        used: usedMem,
        free: freeMem,
        total: totalMem,
        usagePercentage: (usedMem / totalMem) * 100
      },
      disk: {
        used: 0, // Would need additional library for disk usage
        free: 0,
        total: 0,
        usagePercentage: 0
      },
      uptime: os.uptime(),
      processId: process.pid
    };
  }

  private getCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    });

    return 100 - Math.round((totalIdle / totalTick) * 100);
  }

  private async getDatabaseMetrics(): Promise<any> {
    try {
      const admin = mongoose.connection.db?.admin();
      const serverStatus = await admin?.serverStatus();
      const dbStats = await mongoose.connection.db?.stats();

      return {
        connectionCount: mongoose.connections.length,
        activeConnections: serverStatus?.connections?.current || 0,
        queryTime: serverStatus?.opcounters?.query || 0,
        slowQueries: serverStatus?.opcounters?.command || 0,
        indexUsage: 0, // Would need additional queries
        cacheHitRate: 0, // Would need additional queries
        lockWaitTime: 0 // Would need additional queries
      };
    } catch (error) {
      console.error('Error getting database metrics:', error);
      return {
        connectionCount: 0,
        activeConnections: 0,
        queryTime: 0,
        slowQueries: 0,
        indexUsage: 0,
        cacheHitRate: 0,
        lockWaitTime: 0
      };
    }
  }

  private getApplicationMetrics(): any {
    const memUsage = process.memoryUsage();
    const eventLoopLag = this.getEventLoopLag();

    return {
      requestCount: 0, // Would need to track in middleware
      responseTime: 0, // Would need to track in middleware
      errorRate: 0, // Would need to track in middleware
      activeUsers: 0, // Would need to track active sessions
      memoryUsage: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      eventLoopLag
    };
  }

  private getEventLoopLag(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
      return lag;
    });
    return 0; // Simplified for now
  }

  private async getAPIMetrics(): Promise<any> {
    // These would typically be tracked in middleware
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      requestsPerSecond: 0
    };
  }

  private async getBusinessMetrics(): Promise<any> {
    try {
      // These would typically come from your business logic
      const User = mongoose.model('User');
      const Subscription = mongoose.model('Subscription');
      
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
      const newUsers = await User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
      const subscriptionCount = await Subscription.countDocuments({ status: 'active' });

      return {
        totalUsers,
        activeUsers,
        newUsers,
        totalRevenue: 0, // Would need to calculate from payments
        dailyRevenue: 0, // Would need to calculate from payments
        subscriptionCount,
        churnRate: 0, // Would need to calculate
        conversionRate: 0 // Would need to calculate
      };
    } catch (error) {
      console.error('Error getting business metrics:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        totalRevenue: 0,
        dailyRevenue: 0,
        subscriptionCount: 0,
        churnRate: 0,
        conversionRate: 0
      };
    }
  }

  private async getErrorMetrics(): Promise<any> {
    try {
      // These would typically come from your error tracking system
      const errorMetrics = {
        total: 0,
        byType: {},
        bySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        recentErrors: []
      };
      
      return errorMetrics;
    } catch (error) {
      console.error('Error getting error metrics:', error);
      return {
        total: 0,
        byType: {},
        bySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        recentErrors: []
      };
    }
  }

  private async getSecurityMetrics(): Promise<any> {
    try {
      // These would typically come from your security monitoring
      return {
        failedLogins: 0,
        blockedIPs: 0,
        suspiciousActivity: 0,
        securityAlerts: 0,
        lastSecurityScan: new Date(),
        vulnerabilityCount: 0
      };
    } catch (error) {
      console.error('Error getting security metrics:', error);
      return {
        failedLogins: 0,
        blockedIPs: 0,
        suspiciousActivity: 0,
        securityAlerts: 0,
        lastSecurityScan: new Date(),
        vulnerabilityCount: 0
      };
    }
  }

  private getNetworkMetrics(): any {
    const networkInterfaces = os.networkInterfaces();
    let bandwidthIn = 0;
    let bandwidthOut = 0;
    let connectionCount = 0;

    // Simplified network metrics
    Object.values(networkInterfaces).forEach(interfaces => {
      if (interfaces) {
        interfaces.forEach(iface => {
          if (iface.internal === false) {
            connectionCount++;
          }
        });
      }
    });

    return {
      bandwidthIn,
      bandwidthOut,
      latency: 0, // Would need to ping external service
      packetLoss: 0, // Would need to ping external service
      connectionCount
    };
  }

  private calculateHealthStatus(metrics: any): any {
    const alerts = [];
    let overallStatus = 'healthy';

    // Check CPU usage
    if (metrics.server.cpu.usage > 90) {
      alerts.push({
        type: 'cpu',
        message: 'High CPU usage detected',
        severity: 'critical',
        timestamp: new Date()
      });
      overallStatus = 'critical';
    } else if (metrics.server.cpu.usage > 80) {
      alerts.push({
        type: 'cpu',
        message: 'Elevated CPU usage',
        severity: 'warning',
        timestamp: new Date()
      });
      if (overallStatus === 'healthy') overallStatus = 'warning';
    }

    // Check memory usage
    if (metrics.server.memory.usagePercentage > 95) {
      alerts.push({
        type: 'memory',
        message: 'Critical memory usage',
        severity: 'critical',
        timestamp: new Date()
      });
      overallStatus = 'critical';
    } else if (metrics.server.memory.usagePercentage > 85) {
      alerts.push({
        type: 'memory',
        message: 'High memory usage',
        severity: 'warning',
        timestamp: new Date()
      });
      if (overallStatus === 'healthy') overallStatus = 'warning';
    }

    // Check database performance
    const dbStatus = metrics.database.queryTime > 1000 ? 'critical' : 
                    metrics.database.queryTime > 500 ? 'warning' : 'healthy';

    // Check API performance
    const apiStatus = metrics.api.averageResponseTime > 2000 ? 'critical' :
                     metrics.api.averageResponseTime > 1000 ? 'warning' : 'healthy';

    return {
      overall: overallStatus,
      services: {
        database: dbStatus,
        api: apiStatus,
        cache: 'healthy', // Would need cache monitoring
        storage: 'healthy' // Would need storage monitoring
      },
      alerts
    };
  }

  private async saveMetrics(metrics: any): Promise<void> {
    try {
      const systemMetrics = new SystemMetrics(metrics);
      await systemMetrics.save();
    } catch (error) {
      console.error('Error saving system metrics:', error);
    }
  }

  // Public methods for getting metrics
  public async getLatestMetrics(): Promise<any> {
    try {
      return await SystemMetrics.findOne().sort({ timestamp: -1 });
    } catch (error) {
      console.error('Error getting latest metrics:', error);
      return null;
    }
  }

  public async getMetricsHistory(hours: number = 24): Promise<any[]> {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      return await SystemMetrics.find({
        timestamp: { $gte: startTime }
      }).sort({ timestamp: -1 });
    } catch (error) {
      console.error('Error getting metrics history:', error);
      return [];
    }
  }

  public async getHealthStatus(): Promise<any> {
    try {
      const latest = await this.getLatestMetrics();
      return latest?.healthStatus || { overall: 'unknown', services: {}, alerts: [] };
    } catch (error) {
      console.error('Error getting health status:', error);
      return { overall: 'unknown', services: {}, alerts: [] };
    }
  }

  public async getPerformanceTrends(days: number = 7): Promise<any> {
    try {
      const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const metrics = await SystemMetrics.find({
        timestamp: { $gte: startTime }
      }).sort({ timestamp: 1 });

      return {
        cpu: metrics.map(m => ({ timestamp: m.timestamp, usage: m.server.cpu.usage })),
        memory: metrics.map(m => ({ timestamp: m.timestamp, usage: m.server.memory.usagePercentage })),
        responseTime: metrics.map(m => ({ timestamp: m.timestamp, time: m.api.averageResponseTime })),
        errors: metrics.map(m => ({ timestamp: m.timestamp, count: m.errorMetrics.total }))
      };
    } catch (error) {
      console.error('Error getting performance trends:', error);
      return { cpu: [], memory: [], responseTime: [], errors: [] };
    }
  }
}
