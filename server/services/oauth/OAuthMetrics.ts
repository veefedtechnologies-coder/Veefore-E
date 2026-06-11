/**
 * OAuth Metrics Tracking
 * 
 * Provides metrics tracking for OAuth operations to enable monitoring
 * and observability of the OAuth flow.
 * 
 * Metrics tracked:
 * - OAuth flow success rate
 * - Token refresh success rate
 * - Average OAuth flow duration
 * - Error rates by type
 * 
 * Requirements: 18.9, 1.18, 1.19, 2.18, 2.19
 */

import { logger } from '../../config/logger';

/**
 * OAuth flow stage for tracking
 */
export type OAuthFlowStage = 
  | 'initialization'
  | 'google_authorization'
  | 'token_exchange'
  | 'firebase_token_creation'
  | 'refresh_token_storage'
  | 'complete';

/**
 * OAuth operation type
 */
export type OAuthOperation = 
  | 'flow_initiation'
  | 'flow_completion'
  | 'token_refresh'
  | 'logout';

/**
 * OAuth error type for categorization
 */
export type OAuthErrorType =
  | 'invalid_state'
  | 'state_expired'
  | 'token_exchange_failed'
  | 'authorization_code_used'
  | 'redirect_uri_mismatch'
  | 'firebase_token_failed'
  | 'refresh_token_expired'
  | 'refresh_token_not_found'
  | 'retry_exhaustion'
  | 'network_error'
  | 'unknown';

/**
 * Alert types
 */
export type AlertType = 
  | 'success_rate_degradation'
  | 'error_type_spike'
  | 'success_rate_anomaly';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Alert data structure
 */
export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  currentRate?: number;
  threshold?: number;
  errorBreakdown?: Record<string, number>;
  totalFailures?: number;
  errorType?: string;
  percentage?: number;
  previousRate?: number;
  drop?: number;
}

/**
 * Alert configuration
 */
interface AlertConfiguration {
  success_rate_threshold: number;
  error_spike_threshold: number;
  anomaly_drop_threshold: number;
  monitoring_enabled: boolean;
}

/**
 * Alert result when triggered
 */
export interface AlertResult {
  sent: boolean;
  timestamp: Date;
  alert?: Alert;
}

/**
 * OAuth metrics data structure
 */
interface OAuthMetric {
  operation: OAuthOperation;
  success: boolean;
  durationMs?: number;
  errorType?: OAuthErrorType;
  stage?: OAuthFlowStage;
  userId?: string;
  email?: string;
  requestId?: string;
  timestamp: Date;
}

/**
 * In-memory metrics storage for recent operations
 * In production, this would integrate with a metrics service like Prometheus, Datadog, etc.
 */
class OAuthMetricsTracker {
  private metrics: OAuthMetric[] = [];
  private readonly MAX_METRICS = 1000; // Keep last 1000 metrics in memory
  
  // Alerting configuration
  private alertConfig: AlertConfiguration = {
    success_rate_threshold: 95,
    error_spike_threshold: 50,
    anomaly_drop_threshold: 20,
    monitoring_enabled: true,
  };
  private recentSuccessRates: number[] = [];
  private readonly MAX_HISTORY = 10;
  private lastAlertTime: Map<string, Date> = new Map();
  // Use very short cooldown in test environment, 5 minutes in production
  private readonly ALERT_COOLDOWN_MS = process.env.NODE_ENV === 'test' ? 0 : 5 * 60 * 1000;

  /**
   * Record OAuth flow initiation
   */
  recordFlowInitiation(requestId?: string): void {
    this.addMetric({
      operation: 'flow_initiation',
      success: true,
      stage: 'initialization',
      requestId,
      timestamp: new Date(),
    });

    logger.debug('OAuth metric recorded: flow initiation', {
      component: 'OAuth.Metrics',
      operation: 'flow_initiation',
      requestId,
    });
  }

  /**
   * Record successful OAuth flow completion
   */
  recordFlowSuccess(durationMs: number, userId: string, email: string, requestId?: string): void {
    this.addMetric({
      operation: 'flow_completion',
      success: true,
      durationMs,
      stage: 'complete',
      userId,
      email,
      requestId,
      timestamp: new Date(),
    });

    // Requirement 18.9: OAuth flow success rate metric
    logger.info('OAuth metric recorded: flow success', {
      component: 'OAuth.Metrics',
      operation: 'flow_completion',
      success: true,
      durationMs,
      userId,
      requestId,
    });
  }

  /**
   * Record OAuth flow failure
   */
  recordFlowFailure(
    errorType: OAuthErrorType,
    stage: OAuthFlowStage,
    requestId?: string,
    durationMs?: number
  ): void {
    this.addMetric({
      operation: 'flow_completion',
      success: false,
      errorType,
      stage,
      durationMs,
      requestId,
      timestamp: new Date(),
    });

    // Requirement 18.9: Error rates by type metric
    logger.warn('OAuth metric recorded: flow failure', {
      component: 'OAuth.Metrics',
      operation: 'flow_completion',
      success: false,
      errorType,
      stage,
      requestId,
    });
  }

  /**
   * Record token refresh operation
   */
  recordTokenRefresh(success: boolean, durationMs: number, userId?: string, requestId?: string): void {
    this.addMetric({
      operation: 'token_refresh',
      success,
      durationMs,
      userId,
      requestId,
      timestamp: new Date(),
    });

    // Requirement 18.9: Token refresh success rate metric
    logger.info('OAuth metric recorded: token refresh', {
      component: 'OAuth.Metrics',
      operation: 'token_refresh',
      success,
      durationMs,
      userId,
      requestId,
    });
  }

  /**
   * Record logout operation
   */
  recordLogout(userId?: string): void {
    this.addMetric({
      operation: 'logout',
      success: true,
      userId,
      timestamp: new Date(),
    });

    logger.debug('OAuth metric recorded: logout', {
      component: 'OAuth.Metrics',
      operation: 'logout',
      userId,
    });
  }

  /**
   * Get OAuth flow success rate (percentage)
   */
  getFlowSuccessRate(): number {
    const flowMetrics = this.metrics.filter(m => m.operation === 'flow_completion');
    if (flowMetrics.length === 0) return 0;

    const successCount = flowMetrics.filter(m => m.success).length;
    return (successCount / flowMetrics.length) * 100;
  }

  /**
   * Get token refresh success rate (percentage)
   */
  getRefreshSuccessRate(): number {
    const refreshMetrics = this.metrics.filter(m => m.operation === 'token_refresh');
    if (refreshMetrics.length === 0) return 0;

    const successCount = refreshMetrics.filter(m => m.success).length;
    return (successCount / refreshMetrics.length) * 100;
  }

  /**
   * Get average OAuth flow duration (milliseconds)
   */
  getAverageFlowDuration(): number {
    const flowMetrics = this.metrics.filter(
      m => m.operation === 'flow_completion' && m.success && m.durationMs
    );
    if (flowMetrics.length === 0) return 0;

    const totalDuration = flowMetrics.reduce((sum, m) => sum + (m.durationMs || 0), 0);
    return totalDuration / flowMetrics.length;
  }

  /**
   * Get error rates by type
   */
  getErrorRatesByType(): Record<OAuthErrorType, number> {
    const errorMetrics = this.metrics.filter(m => !m.success && m.errorType);
    const totalErrors = errorMetrics.length;

    const errorCounts: Record<string, number> = {};
    errorMetrics.forEach(m => {
      const type = m.errorType || 'unknown';
      errorCounts[type] = (errorCounts[type] || 0) + 1;
    });

    const errorRates: Record<string, number> = {};
    Object.keys(errorCounts).forEach(type => {
      errorRates[type] = totalErrors > 0 ? (errorCounts[type] / totalErrors) * 100 : 0;
    });

    return errorRates as Record<OAuthErrorType, number>;
  }

  /**
   * Get metrics summary for monitoring dashboard
   */
  getMetricsSummary(): {
    flowSuccessRate: number;
    refreshSuccessRate: number;
    averageFlowDurationMs: number;
    errorRatesByType: Record<OAuthErrorType, number>;
    totalFlows: number;
    totalRefreshes: number;
    recentMetricsCount: number;
  } {
    return {
      flowSuccessRate: this.getFlowSuccessRate(),
      refreshSuccessRate: this.getRefreshSuccessRate(),
      averageFlowDurationMs: this.getAverageFlowDuration(),
      errorRatesByType: this.getErrorRatesByType(),
      totalFlows: this.metrics.filter(m => m.operation === 'flow_completion').length,
      totalRefreshes: this.metrics.filter(m => m.operation === 'token_refresh').length,
      recentMetricsCount: this.metrics.length,
    };
  }

  /**
   * Add metric to storage with size limit
   */
  private addMetric(metric: OAuthMetric): void {
    this.metrics.push(metric);

    // Keep only the most recent metrics to prevent memory growth
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift(); // Remove oldest metric
    }
  }

  /**
   * Clear all metrics (for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
    this.recentSuccessRates = [];
    this.lastAlertTime.clear();
  }

  /**
   * Check thresholds and return alerts
   * 
   * Requirement 2.18: When success rate drops below threshold, trigger alert
   * Requirement 2.19: When error rates spike, trigger alert with error details
   */
  checkThresholds(): Alert[] {
    if (!this.alertConfig.monitoring_enabled) {
      return [];
    }

    const alerts: Alert[] = [];
    const summary = this.getMetricsSummary();
    const currentRate = summary.flowSuccessRate;

    // Check 1: Success rate degradation
    if (currentRate < this.alertConfig.success_rate_threshold && summary.totalFlows > 0) {
      const alert = this.createSuccessRateDegradationAlert(currentRate, summary);
      if (this.shouldTriggerAlert('success_rate_degradation')) {
        alerts.push(alert);
        this.recordAlertTime('success_rate_degradation');
        logger.warn('OAuth success rate degradation detected', {
          component: 'OAuth.Alerting',
          currentRate,
          threshold: this.alertConfig.success_rate_threshold,
          totalFlows: summary.totalFlows,
        });
      }
    }

    // Check 2: Error type spikes
    const errorRates = summary.errorRatesByType;
    for (const [errorType, percentage] of Object.entries(errorRates)) {
      if (percentage > this.alertConfig.error_spike_threshold) {
        const alert = this.createErrorSpikeAlert(errorType, percentage);
        const cooldownKey = `error_type_spike_${errorType}`;
        if (this.shouldTriggerAlert(cooldownKey)) {
          alerts.push(alert);
          this.recordAlertTime(cooldownKey);
          logger.warn('OAuth error type spike detected', {
            component: 'OAuth.Alerting',
            errorType,
            percentage,
            threshold: this.alertConfig.error_spike_threshold,
          });
        }
      }
    }

    // Check 3: Success rate anomaly (sudden drop)
    this.recentSuccessRates.push(currentRate);
    if (this.recentSuccessRates.length > this.MAX_HISTORY) {
      this.recentSuccessRates.shift();
    }

    if (this.recentSuccessRates.length >= 2) {
      const previousRate = this.recentSuccessRates[this.recentSuccessRates.length - 2];
      const rateDrop = previousRate - currentRate;

      if (rateDrop > this.alertConfig.anomaly_drop_threshold) {
        const alert = this.createAnomalyAlert(previousRate, currentRate, rateDrop);
        if (this.shouldTriggerAlert('success_rate_anomaly')) {
          alerts.push(alert);
          this.recordAlertTime('success_rate_anomaly');
          logger.error('OAuth success rate anomaly detected', {
            component: 'OAuth.Alerting',
            previousRate,
            currentRate,
            drop: rateDrop,
            threshold: this.alertConfig.anomaly_drop_threshold,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Trigger an alert
   * 
   * Requirement 2.19: Generate alerts with error details for investigation
   */
  async triggerAlert(alertData: Alert): Promise<AlertResult> {
    if (!this.alertConfig.monitoring_enabled) {
      return {
        sent: false,
        timestamp: new Date(),
      };
    }

    const timestamp = new Date();

    logger.error('OAuth alert triggered', {
      component: 'OAuth.Alerting',
      alert: alertData,
    });

    // In production, integrate with monitoring systems here

    return {
      sent: true,
      timestamp,
      alert: alertData,
    };
  }

  /**
   * Set a custom threshold for alerting
   */
  setThreshold(thresholdType: 'success_rate' | 'error_spike' | 'anomaly_drop', value: number): void {
    switch (thresholdType) {
      case 'success_rate':
        this.alertConfig.success_rate_threshold = value;
        break;
      case 'error_spike':
        this.alertConfig.error_spike_threshold = value;
        break;
      case 'anomaly_drop':
        this.alertConfig.anomaly_drop_threshold = value;
        break;
    }

    logger.info('OAuth alerting threshold updated', {
      component: 'OAuth.Alerting',
      thresholdType,
      value,
    });
  }

  /**
   * Get current alert configuration
   */
  getAlertConfiguration(): AlertConfiguration {
    return { ...this.alertConfig };
  }

  /**
   * Create success rate degradation alert
   */
  private createSuccessRateDegradationAlert(currentRate: number, summary: any): Alert {
    const errorBreakdown: Record<string, number> = {};
    for (const [errorType, percentage] of Object.entries(summary.errorRatesByType)) {
      errorBreakdown[errorType] = percentage as number;
    }

    return {
      type: 'success_rate_degradation',
      severity: 'critical',
      message: `OAuth success rate dropped to ${currentRate.toFixed(2)}% (threshold: ${this.alertConfig.success_rate_threshold}%)`,
      timestamp: new Date(),
      currentRate,
      threshold: this.alertConfig.success_rate_threshold,
      errorBreakdown,
      totalFailures: summary.totalFlows - Math.floor((summary.totalFlows * currentRate) / 100),
    };
  }

  /**
   * Create error type spike alert
   */
  private createErrorSpikeAlert(errorType: string, percentage: number): Alert {
    return {
      type: 'error_type_spike',
      severity: 'high',
      message: `OAuth error type '${errorType}' spiked to ${percentage.toFixed(2)}% of all errors`,
      timestamp: new Date(),
      errorType,
      percentage,
    };
  }

  /**
   * Create anomaly alert for sudden rate drop
   */
  private createAnomalyAlert(previousRate: number, currentRate: number, drop: number): Alert {
    return {
      type: 'success_rate_anomaly',
      severity: 'critical',
      message: `OAuth success rate dropped suddenly from ${previousRate.toFixed(2)}% to ${currentRate.toFixed(2)}% (drop: ${drop.toFixed(2)}%)`,
      timestamp: new Date(),
      previousRate,
      currentRate,
      drop,
    };
  }

  /**
   * Check if an alert should be triggered (considering cooldown)
   */
  private shouldTriggerAlert(alertType: string): boolean {
    const lastAlert = this.lastAlertTime.get(alertType);
    if (!lastAlert) {
      return true;
    }

    const timeSinceLastAlert = Date.now() - lastAlert.getTime();
    return timeSinceLastAlert >= this.ALERT_COOLDOWN_MS;
  }

  /**
   * Record the time an alert was triggered
   */
  private recordAlertTime(alertType: string): void {
    this.lastAlertTime.set(alertType, new Date());
  }
}

// Export singleton instance
export const oauthMetrics = new OAuthMetricsTracker();

// Export class for testing
export { OAuthMetricsTracker };
