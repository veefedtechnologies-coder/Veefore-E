/**
 * OAuth Alerting Service
 * 
 * Provides proactive alerting for OAuth flow degradation and security incidents.
 * Monitors OAuth metrics and triggers alerts when thresholds are violated.
 * 
 * Requirements: 1.18, 1.19, 2.18, 2.19
 */

import { logger } from '../../config/logger';
import { oauthMetrics } from './OAuthMetrics';

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
 * OAuth Alerting Service
 * 
 * Monitors OAuth metrics and triggers alerts when:
 * - Success rate drops below threshold (default: 95%)
 * - Specific error types spike above threshold (default: 50%)
 * - Success rate drops suddenly (anomaly detection)
 */
export class OAuthAlertingService {
  private config: AlertConfiguration;
  private recentSuccessRates: number[] = [];
  private readonly MAX_HISTORY = 10; // Keep last 10 data points for anomaly detection
  private lastAlertTime: Map<AlertType, Date> = new Map();
  private readonly ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown

  constructor(config?: Partial<AlertConfiguration>) {
    this.config = {
      success_rate_threshold: 95,
      error_spike_threshold: 50,
      anomaly_drop_threshold: 20,
      monitoring_enabled: true,
      ...config,
    };

    logger.info('OAuthAlertingService initialized', {
      component: 'OAuth.Alerting',
      config: this.config,
    });
  }

  /**
   * Check all thresholds and return any alerts that should be triggered
   * 
   * Requirement 2.18: Trigger alert when success rate drops below threshold
   * Requirement 2.19: Trigger alert when error rates spike for specific types
   */
  checkThresholds(): Alert[] {
    if (!this.config.monitoring_enabled) {
      return [];
    }

    const alerts: Alert[] = [];

    // Get current metrics
    const summary = oauthMetrics.getMetricsSummary();
    const currentRate = summary.flowSuccessRate;

    // Check 1: Success rate degradation
    if (currentRate < this.config.success_rate_threshold && summary.totalFlows > 0) {
      const alert = this.createSuccessRateDegradationAlert(currentRate, summary);
      if (this.shouldTriggerAlert('success_rate_degradation')) {
        alerts.push(alert);
        this.recordAlertTime('success_rate_degradation');
        logger.warn('OAuth success rate degradation detected', {
          component: 'OAuth.Alerting',
          currentRate,
          threshold: this.config.success_rate_threshold,
          totalFlows: summary.totalFlows,
        });
      }
    }

    // Check 2: Error type spikes
    const errorRates = summary.errorRatesByType;
    for (const [errorType, percentage] of Object.entries(errorRates)) {
      if (percentage > this.config.error_spike_threshold) {
        const alert = this.createErrorSpikeAlert(errorType, percentage);
        // Use a unique cooldown key per error type
        const cooldownKey = `error_type_spike_${errorType}` as AlertType;
        if (this.shouldTriggerAlert(cooldownKey)) {
          alerts.push(alert);
          this.recordAlertTime(cooldownKey);
          logger.warn('OAuth error type spike detected', {
            component: 'OAuth.Alerting',
            errorType,
            percentage,
            threshold: this.config.error_spike_threshold,
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

      if (rateDrop > this.config.anomaly_drop_threshold) {
        const alert = this.createAnomalyAlert(previousRate, currentRate, rateDrop);
        if (this.shouldTriggerAlert('success_rate_anomaly')) {
          alerts.push(alert);
          this.recordAlertTime('success_rate_anomaly');
          logger.error('OAuth success rate anomaly detected', {
            component: 'OAuth.Alerting',
            previousRate,
            currentRate,
            drop: rateDrop,
            threshold: this.config.anomaly_drop_threshold,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Trigger an alert by sending it to monitoring systems
   * 
   * Requirement 2.19: Generate alerts with error details for investigation
   */
  async triggerAlert(alertData: Alert): Promise<AlertResult> {
    if (!this.config.monitoring_enabled) {
      return {
        sent: false,
        timestamp: new Date(),
      };
    }

    const timestamp = new Date();

    // Log the alert
    logger.error('OAuth alert triggered', {
      component: 'OAuth.Alerting',
      alert: alertData,
    });

    // In production, this would integrate with:
    // - Sentry for error tracking
    // - PagerDuty for on-call alerting
    // - CloudWatch for AWS monitoring
    // - Datadog for metrics and alerting
    // - Slack/Teams for team notifications
    
    // For now, we log and return success
    // Integration points would be added here based on deployment environment

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
        this.config.success_rate_threshold = value;
        break;
      case 'error_spike':
        this.config.error_spike_threshold = value;
        break;
      case 'anomaly_drop':
        this.config.anomaly_drop_threshold = value;
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
    return { ...this.config };
  }

  /**
   * Enable or disable monitoring
   */
  setMonitoringEnabled(enabled: boolean): void {
    this.config.monitoring_enabled = enabled;
    logger.info('OAuth alerting monitoring toggled', {
      component: 'OAuth.Alerting',
      enabled,
    });
  }

  /**
   * Clear alert history (for testing)
   */
  clearAlertHistory(): void {
    this.recentSuccessRates = [];
    this.lastAlertTime.clear();
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
      message: `OAuth success rate dropped to ${currentRate.toFixed(2)}% (threshold: ${this.config.success_rate_threshold}%)`,
      timestamp: new Date(),
      currentRate,
      threshold: this.config.success_rate_threshold,
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
  private shouldTriggerAlert(alertType: AlertType | string): boolean {
    const lastAlert = this.lastAlertTime.get(alertType as AlertType);
    if (!lastAlert) {
      return true;
    }

    const timeSinceLastAlert = Date.now() - lastAlert.getTime();
    return timeSinceLastAlert >= this.ALERT_COOLDOWN_MS;
  }

  /**
   * Record the time an alert was triggered
   */
  private recordAlertTime(alertType: AlertType | string): void {
    this.lastAlertTime.set(alertType as AlertType, new Date());
  }
}

// Export singleton instance with default configuration
export const oauthAlerting = new OAuthAlertingService();

// Export class for testing
export { OAuthAlertingService as OAuthAlertingServiceClass };
