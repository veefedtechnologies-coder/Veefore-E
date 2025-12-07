/**
 * P4-3: Metrics Collection System
 * 
 * Production-grade metrics collection for monitoring application performance,
 * business metrics, and operational insights with Prometheus-compatible format
 */

import { Request, Response, NextFunction } from 'express';
import { logger, StructuredLogger } from './structured-logger';

/**
 * P4-3.1: Metrics types and interfaces
 */
interface Metric {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels: Record<string, string>;
  timestamp: number;
  help?: string;
}

interface CounterMetric extends Metric {
  type: 'counter';
}

interface GaugeMetric extends Metric {
  type: 'gauge';
}

interface HistogramBucket {
  le: number; // Less than or equal to
  count: number;
}

interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

/**
 * P4-3.2: Built-in metrics collector (Prometheus-compatible)
 */
export class MetricsCollector {
  private static metrics = new Map<string, Metric>();
  private static counters = new Map<string, number>();
  private static gauges = new Map<string, number>();
  private static histograms = new Map<string, {
    buckets: Map<number, number>;
    sum: number;
    count: number;
  }>();

  /**
   * P4-3.2a: Counter metrics (always increasing)
   */
  static incrementCounter(
    name: string,
    labels: Record<string, string> = {},
    value: number = 1,
    help?: string
  ): void {
    const key = this.generateMetricKey(name, labels);
    const currentValue = this.counters.get(key) || 0;
    const newValue = currentValue + value;
    
    this.counters.set(key, newValue);
    this.metrics.set(key, {
      name,
      value: newValue,
      type: 'counter',
      labels,
      timestamp: Date.now(),
      help
    });

    logger.debug({
      event: 'METRIC_COUNTER',
      metric: name,
      value: newValue,
      increment: value,
      labels
    });
  }

  /**
   * P4-3.2b: Gauge metrics (can go up or down)
   */
  static setGauge(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    help?: string
  ): void {
    const key = this.generateMetricKey(name, labels);
    
    this.gauges.set(key, value);
    this.metrics.set(key, {
      name,
      value,
      type: 'gauge',
      labels,
      timestamp: Date.now(),
      help
    });

    logger.debug({
      event: 'METRIC_GAUGE',
      metric: name,
      value,
      labels
    });
  }

  /**
   * P4-3.2c: Histogram metrics (for measuring distributions)
   */
  static observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    buckets: number[] = [0.1, 0.5, 1, 2.5, 5, 10],
    help?: string
  ): void {
    const key = this.generateMetricKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        buckets: new Map(buckets.map(bucket => [bucket, 0])),
        sum: 0,
        count: 0
      });
    }

    const histogram = this.histograms.get(key)!;
    histogram.sum += value;
    histogram.count += 1;

    // Update buckets
    for (const bucket of buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
      }
    }

    // Convert to metric format
    const histogramBuckets: HistogramBucket[] = Array.from(histogram.buckets.entries())
      .map(([le, count]) => ({ le, count }));

    this.metrics.set(key, {
      name,
      value: histogram.sum,
      type: 'histogram',
      labels,
      timestamp: Date.now(),
      help,
      buckets: histogramBuckets,
      sum: histogram.sum,
      count: histogram.count
    } as HistogramMetric);

    logger.debug({
      event: 'METRIC_HISTOGRAM',
      metric: name,
      value,
      count: histogram.count,
      labels
    });
  }

  /**
   * P4-3.3: Application-specific metrics
   */
  
  // API request metrics
  static recordAPIRequest(
    method: string,
    endpoint: string,
    statusCode: number,
    responseTime: number,
    userId?: string
  ): void {
    const labels = {
      method,
      endpoint: endpoint.replace(/\/\d+/g, '/:id'), // Normalize dynamic paths
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`
    };

    // Request counter
    this.incrementCounter('http_requests_total', labels, 1, 'Total HTTP requests');
    
    // Response time histogram
    this.observeHistogram(
      'http_request_duration_seconds',
      responseTime / 1000,
      { method, endpoint: labels.endpoint },
      [0.001, 0.01, 0.1, 0.5, 1, 2.5, 5, 10],
      'HTTP request duration in seconds'
    );

    // Active users gauge (if user provided)
    if (userId) {
      this.recordActiveUser(userId);
    }
  }

  // Database operation metrics
  static recordDatabaseOperation(
    operation: string,
    table: string,
    duration: number,
    success: boolean = true
  ): void {
    const labels = {
      operation,
      table,
      status: success ? 'success' : 'error'
    };

    this.incrementCounter('database_operations_total', labels, 1, 'Total database operations');
    this.observeHistogram(
      'database_operation_duration_seconds',
      duration / 1000,
      { operation, table },
      [0.001, 0.01, 0.1, 0.5, 1, 2],
      'Database operation duration in seconds'
    );
  }

  // Business metrics
  static recordUserAction(action: string, userId: string, workspaceId: string): void {
    const labels = { action, workspace_id: workspaceId };
    
    this.incrementCounter('user_actions_total', labels, 1, 'Total user actions');
    this.recordActiveUser(userId);
    this.recordActiveWorkspace(workspaceId);
  }

  // Social media metrics
  static recordSocialMediaOperation(
    platform: string,
    operation: string,
    success: boolean,
    responseTime: number
  ): void {
    const labels = {
      platform,
      operation,
      status: success ? 'success' : 'error'
    };

    this.incrementCounter('social_media_operations_total', labels, 1, 'Total social media API operations');
    this.observeHistogram(
      'social_media_response_time_seconds',
      responseTime / 1000,
      { platform, operation },
      [0.1, 0.5, 1, 2, 5, 10, 30],
      'Social media API response time in seconds'
    );
  }

  // Active users tracking
  private static activeUsers = new Set<string>();
  private static activeWorkspaces = new Set<string>();

  static recordActiveUser(userId: string): void {
    this.activeUsers.add(userId);
    this.setGauge('active_users_total', this.activeUsers.size, {}, 'Number of active users');
  }

  static recordActiveWorkspace(workspaceId: string): void {
    this.activeWorkspaces.add(workspaceId);
    this.setGauge('active_workspaces_total', this.activeWorkspaces.size, {}, 'Number of active workspaces');
  }

  // System metrics
  static recordSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.setGauge('nodejs_memory_usage_bytes', memUsage.rss, { type: 'rss' }, 'Node.js memory usage');
    this.setGauge('nodejs_memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' }, 'Node.js memory usage');
    this.setGauge('nodejs_memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' }, 'Node.js memory usage');
    
    const uptime = process.uptime();
    this.setGauge('nodejs_process_uptime_seconds', uptime, {}, 'Node.js process uptime in seconds');
  }

  /**
   * P4-3.4: Metrics export (Prometheus format)
   */
  static exportPrometheusMetrics(): string {
    let output = '';
    const metricGroups = new Map<string, Metric[]>();

    // Group metrics by name
    for (const metric of this.metrics.values()) {
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, []);
      }
      metricGroups.get(metric.name)!.push(metric);
    }

    // Generate Prometheus format
    for (const [name, metrics] of metricGroups.entries()) {
      const firstMetric = metrics[0];
      
      if (firstMetric.help) {
        output += `# HELP ${name} ${firstMetric.help}\n`;
      }
      output += `# TYPE ${name} ${firstMetric.type}\n`;

      for (const metric of metrics) {
        const labelsStr = Object.entries(metric.labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        
        const labelsPart = labelsStr ? `{${labelsStr}}` : '';
        
        if (metric.type === 'histogram') {
          const histogramMetric = metric as HistogramMetric;
          
          // Buckets
          for (const bucket of histogramMetric.buckets) {
            output += `${name}_bucket${labelsPart.replace('}', `,le="${bucket.le}"}`)} ${bucket.count}\n`;
          }
          
          // Sum and count
          output += `${name}_sum${labelsPart} ${histogramMetric.sum}\n`;
          output += `${name}_count${labelsPart} ${histogramMetric.count}\n`;
        } else {
          output += `${name}${labelsPart} ${metric.value}\n`;
        }
      }
      
      output += '\n';
    }

    return output;
  }

  /**
   * P4-3.5: Metrics export (JSON format)
   */
  static exportJSONMetrics(): any {
    const metrics: any = {
      timestamp: new Date().toISOString(),
      metrics: {}
    };

    for (const [key, metric] of this.metrics.entries()) {
      metrics.metrics[key] = {
        name: metric.name,
        value: metric.value,
        type: metric.type,
        labels: metric.labels,
        timestamp: new Date(metric.timestamp).toISOString()
      };

      if (metric.type === 'histogram') {
        const histogramMetric = metric as HistogramMetric;
        metrics.metrics[key].buckets = histogramMetric.buckets;
        metrics.metrics[key].sum = histogramMetric.sum;
        metrics.metrics[key].count = histogramMetric.count;
      }
    }

    return metrics;
  }

  /**
   * P4-3.6: Utility methods
   */
  private static generateMetricKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join(',');
    
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  /**
   * P4-3.7: Reset metrics (for testing)
   */
  static reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.activeUsers.clear();
    this.activeWorkspaces.clear();
  }

  /**
   * P4-3.8: Get metrics summary
   */
  static getSummary(): {
    totalMetrics: number;
    counters: number;
    gauges: number;
    histograms: number;
    activeUsers: number;
    activeWorkspaces: number;
  } {
    const typeCount = { counter: 0, gauge: 0, histogram: 0 };
    
    for (const metric of this.metrics.values()) {
      typeCount[metric.type as keyof typeof typeCount]++;
    }

    return {
      totalMetrics: this.metrics.size,
      counters: typeCount.counter,
      gauges: typeCount.gauge,
      histograms: typeCount.histogram,
      activeUsers: this.activeUsers.size,
      activeWorkspaces: this.activeWorkspaces.size
    };
  }
}

/**
 * P4-3.9: Metrics middleware for Express
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      
      MetricsCollector.recordAPIRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        responseTime,
        req.user?.id
      );
    });

    next();
  };
}

/**
 * P4-3.10: System metrics collection interval
 */
export function startSystemMetricsCollection(): void {
  // Collect system metrics every 30 seconds
  const interval = setInterval(() => {
    MetricsCollector.recordSystemMetrics();
  }, 30000);

  // Initial collection
  MetricsCollector.recordSystemMetrics();

  logger.info({
    event: 'SYSTEM_METRICS_STARTED',
    interval: '30 seconds',
    message: 'System metrics collection started'
  }, '📊 P4-3: System metrics collection active');

  return interval;
}

/**
 * P4-3.11: Initialize metrics system
 */
export function initializeMetricsSystem(): void {
  startSystemMetricsCollection();

  logger.info({
    event: 'METRICS_SYSTEM_INITIALIZED',
    features: [
      'Prometheus-compatible metrics',
      'Counter, gauge, and histogram metrics',
      'API request tracking',
      'Database operation monitoring',
      'Business metrics collection',
      'System resource monitoring',
      'Active user/workspace tracking'
    ]
  }, '🔐 P4-3: Metrics collection system ready for production');
}