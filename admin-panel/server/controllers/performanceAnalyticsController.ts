import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import SystemMetrics from '../models/SystemMetrics';
import { SystemMonitoringService } from '../services/systemMonitoringService';

export class PerformanceAnalyticsController {
  private monitoringService: SystemMonitoringService;

  constructor() {
    this.monitoringService = SystemMonitoringService.getInstance();
  }

  // Get real-time system metrics
  static async getRealTimeMetrics(req: AuthRequest, res: Response) {
    try {
      const monitoringService = SystemMonitoringService.getInstance();
      const metrics = await monitoringService.getLatestMetrics();

      if (!metrics) {
        return res.status(404).json({
          success: false,
          message: 'No metrics data available'
        });
      }

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Error fetching real-time metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch real-time metrics'
      });
    }
  }

  // Get system health status
  static async getHealthStatus(req: AuthRequest, res: Response) {
    try {
      const monitoringService = SystemMonitoringService.getInstance();
      const healthStatus = await monitoringService.getHealthStatus();

      res.json({
        success: true,
        data: healthStatus
      });
    } catch (error) {
      console.error('Error fetching health status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch health status'
      });
    }
  }

  // Get performance trends
  static async getPerformanceTrends(req: AuthRequest, res: Response) {
    try {
      const { days = 7 } = req.query;
      const monitoringService = SystemMonitoringService.getInstance();
      const trends = await monitoringService.getPerformanceTrends(Number(days));

      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      console.error('Error fetching performance trends:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance trends'
      });
    }
  }

  // Get metrics history with filtering
  static async getMetricsHistory(req: AuthRequest, res: Response) {
    try {
      const {
        startDate,
        endDate,
        limit = 100,
        skip = 0,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = req.query;

      const filter: any = {};

      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) {
          filter.timestamp.$gte = new Date(startDate as string);
        }
        if (endDate) {
          filter.timestamp.$lte = new Date(endDate as string);
        }
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

      const metrics = await SystemMetrics.find(filter)
        .sort(sort)
        .skip(Number(skip))
        .limit(Number(limit));

      const total = await SystemMetrics.countDocuments(filter);

      res.json({
        success: true,
        data: {
          metrics,
          pagination: {
            total,
            limit: Number(limit),
            skip: Number(skip),
            hasMore: Number(skip) + Number(limit) < total
          }
        }
      });
    } catch (error) {
      console.error('Error fetching metrics history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch metrics history'
      });
    }
  }

  // Get system performance summary
  static async getPerformanceSummary(req: AuthRequest, res: Response) {
    try {
      const { period = '24h' } = req.query;
      
      let startTime: Date;
      switch (period) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      const metrics = await SystemMetrics.find({
        timestamp: { $gte: startTime }
      }).sort({ timestamp: 1 });

      if (metrics.length === 0) {
        return res.json({
          success: true,
          data: {
            period,
            summary: {
              avgCpuUsage: 0,
              maxCpuUsage: 0,
              avgMemoryUsage: 0,
              maxMemoryUsage: 0,
              avgResponseTime: 0,
              maxResponseTime: 0,
              totalErrors: 0,
              uptime: 0,
              healthScore: 0
            },
            trends: {
              cpu: [],
              memory: [],
              responseTime: [],
              errors: []
            }
          }
        });
      }

      // Calculate summary statistics
      const cpuUsages = metrics.map(m => m.server.cpu.usage);
      const memoryUsages = metrics.map(m => m.server.memory.usagePercentage);
      const responseTimes = metrics.map(m => m.api.averageResponseTime);
      const errorCounts = metrics.map(m => m.errorMetrics.total);

      const summary = {
        avgCpuUsage: cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length,
        maxCpuUsage: Math.max(...cpuUsages),
        avgMemoryUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        maxMemoryUsage: Math.max(...memoryUsages),
        avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
        maxResponseTime: Math.max(...responseTimes),
        totalErrors: errorCounts.reduce((a, b) => a + b, 0),
        uptime: metrics[metrics.length - 1]?.server.uptime || 0,
        healthScore: this.calculateHealthScore(metrics)
      };

      // Prepare trend data
      const trends = {
        cpu: metrics.map(m => ({
          timestamp: m.timestamp,
          usage: m.server.cpu.usage
        })),
        memory: metrics.map(m => ({
          timestamp: m.timestamp,
          usage: m.server.memory.usagePercentage
        })),
        responseTime: metrics.map(m => ({
          timestamp: m.timestamp,
          time: m.api.averageResponseTime
        })),
        errors: metrics.map(m => ({
          timestamp: m.timestamp,
          count: m.errorMetrics.total
        }))
      };

      res.json({
        success: true,
        data: {
          period,
          summary,
          trends
        }
      });
    } catch (error) {
      console.error('Error fetching performance summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance summary'
      });
    }
  }

  // Get database performance metrics
  static async getDatabaseMetrics(req: AuthRequest, res: Response) {
    try {
      const { period = '24h' } = req.query;
      
      let startTime: Date;
      switch (period) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      const metrics = await SystemMetrics.find({
        timestamp: { $gte: startTime }
      }).sort({ timestamp: 1 });

      const dbMetrics = metrics.map(m => ({
        timestamp: m.timestamp,
        connectionCount: m.database.connectionCount,
        activeConnections: m.database.activeConnections,
        queryTime: m.database.queryTime,
        slowQueries: m.database.slowQueries,
        indexUsage: m.database.indexUsage,
        cacheHitRate: m.database.cacheHitRate,
        lockWaitTime: m.database.lockWaitTime
      }));

      res.json({
        success: true,
        data: {
          period,
          metrics: dbMetrics,
          summary: {
            avgQueryTime: dbMetrics.reduce((sum, m) => sum + m.queryTime, 0) / dbMetrics.length,
            maxQueryTime: Math.max(...dbMetrics.map(m => m.queryTime)),
            avgConnections: dbMetrics.reduce((sum, m) => sum + m.connectionCount, 0) / dbMetrics.length,
            maxConnections: Math.max(...dbMetrics.map(m => m.connectionCount)),
            totalSlowQueries: dbMetrics.reduce((sum, m) => sum + m.slowQueries, 0),
            avgCacheHitRate: dbMetrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / dbMetrics.length
          }
        }
      });
    } catch (error) {
      console.error('Error fetching database metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch database metrics'
      });
    }
  }

  // Get error analytics
  static async getErrorAnalytics(req: AuthRequest, res: Response) {
    try {
      const { period = '24h' } = req.query;
      
      let startTime: Date;
      switch (period) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      const metrics = await SystemMetrics.find({
        timestamp: { $gte: startTime }
      }).sort({ timestamp: 1 });

      const errorData = metrics.map(m => ({
        timestamp: m.timestamp,
        total: m.errorMetrics.total,
        critical: m.errorMetrics.bySeverity.critical,
        high: m.errorMetrics.bySeverity.high,
        medium: m.errorMetrics.bySeverity.medium,
        low: m.errorMetrics.bySeverity.low,
        recentErrors: m.errorMetrics.recentErrors
      }));

      // Aggregate error data
      const totalErrors = errorData.reduce((sum, e) => sum + e.total, 0);
      const criticalErrors = errorData.reduce((sum, e) => sum + e.critical, 0);
      const highErrors = errorData.reduce((sum, e) => sum + e.high, 0);
      const mediumErrors = errorData.reduce((sum, e) => sum + e.medium, 0);
      const lowErrors = errorData.reduce((sum, e) => sum + e.low, 0);

      res.json({
        success: true,
        data: {
          period,
          summary: {
            totalErrors,
            criticalErrors,
            highErrors,
            mediumErrors,
            lowErrors,
            errorRate: totalErrors / errorData.length || 0
          },
          trends: errorData,
          recentErrors: errorData.flatMap(e => e.recentErrors).slice(0, 50)
        }
      });
    } catch (error) {
      console.error('Error fetching error analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch error analytics'
      });
    }
  }

  // Get business metrics
  static async getBusinessMetrics(req: AuthRequest, res: Response) {
    try {
      const { period = '30d' } = req.query;
      
      let startTime: Date;
      switch (period) {
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const metrics = await SystemMetrics.find({
        timestamp: { $gte: startTime }
      }).sort({ timestamp: 1 });

      const businessData = metrics.map(m => ({
        timestamp: m.timestamp,
        totalUsers: m.business.totalUsers,
        activeUsers: m.business.activeUsers,
        newUsers: m.business.newUsers,
        totalRevenue: m.business.totalRevenue,
        dailyRevenue: m.business.dailyRevenue,
        subscriptionCount: m.business.subscriptionCount,
        churnRate: m.business.churnRate,
        conversionRate: m.business.conversionRate
      }));

      res.json({
        success: true,
        data: {
          period,
          metrics: businessData,
          summary: {
            totalUsers: businessData[businessData.length - 1]?.totalUsers || 0,
            activeUsers: businessData[businessData.length - 1]?.activeUsers || 0,
            newUsers: businessData.reduce((sum, m) => sum + m.newUsers, 0),
            totalRevenue: businessData[businessData.length - 1]?.totalRevenue || 0,
            avgDailyRevenue: businessData.reduce((sum, m) => sum + m.dailyRevenue, 0) / businessData.length,
            subscriptionCount: businessData[businessData.length - 1]?.subscriptionCount || 0,
            avgChurnRate: businessData.reduce((sum, m) => sum + m.churnRate, 0) / businessData.length,
            avgConversionRate: businessData.reduce((sum, m) => sum + m.conversionRate, 0) / businessData.length
          }
        }
      });
    } catch (error) {
      console.error('Error fetching business metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch business metrics'
      });
    }
  }

  // Start/Stop monitoring
  static async toggleMonitoring(req: AuthRequest, res: Response) {
    try {
      const { action } = req.body;
      const monitoringService = SystemMonitoringService.getInstance();

      if (action === 'start') {
        monitoringService.startCollection();
        res.json({
          success: true,
          message: 'System monitoring started'
        });
      } else if (action === 'stop') {
        monitoringService.stopCollection();
        res.json({
          success: true,
          message: 'System monitoring stopped'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Invalid action. Use "start" or "stop"'
        });
      }
    } catch (error) {
      console.error('Error toggling monitoring:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle monitoring'
      });
    }
  }

  // Calculate health score based on metrics
  private static calculateHealthScore(metrics: any[]): number {
    if (metrics.length === 0) return 0;

    const latest = metrics[metrics.length - 1];
    let score = 100;

    // CPU usage penalty
    if (latest.server.cpu.usage > 90) score -= 30;
    else if (latest.server.cpu.usage > 80) score -= 15;
    else if (latest.server.cpu.usage > 70) score -= 5;

    // Memory usage penalty
    if (latest.server.memory.usagePercentage > 95) score -= 30;
    else if (latest.server.memory.usagePercentage > 85) score -= 15;
    else if (latest.server.memory.usagePercentage > 75) score -= 5;

    // Response time penalty
    if (latest.api.averageResponseTime > 2000) score -= 20;
    else if (latest.api.averageResponseTime > 1000) score -= 10;
    else if (latest.api.averageResponseTime > 500) score -= 5;

    // Error rate penalty
    if (latest.errorMetrics.total > 100) score -= 20;
    else if (latest.errorMetrics.total > 50) score -= 10;
    else if (latest.errorMetrics.total > 10) score -= 5;

    return Math.max(0, Math.min(100, score));
  }
}
