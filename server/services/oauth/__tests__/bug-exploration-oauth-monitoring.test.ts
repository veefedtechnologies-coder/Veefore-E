import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { oauthMetrics, OAuthErrorType } from '../OAuthMetrics';

/**
 * Bug Exploration Property-Based Test for OAuth Flow Monitoring
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * The system collects OAuth metrics (success rate, error types, duration) but provides
 * no alerting or threshold-based monitoring. When OAuth success rate drops significantly
 * (e.g., from 99% to 60%), the system doesn't detect or alert on security incidents or
 * service degradation in real-time. This prevents timely response to OAuth failures
 * caused by Google OAuth service issues, configuration changes, or attack attempts.
 * 
 * Current Code (server/services/oauth/OAuthMetrics.ts):
 *   - OAuthMetricsTracker class collects metrics in memory
 *   - Tracks OAuth flow success/failure, token refresh, errors by type
 *   - Provides getFlowSuccessRate(), getMetricsSummary() methods
 *   - NO alerting mechanism exists
 *   - NO threshold checking (e.g., success rate < 95%)
 *   - NO real-time anomaly detection
 *   - NO integration with monitoring/alerting systems
 * 
 * Current Code (server/routes/auth.ts):
 *   - Calls oauthMetrics.recordFlowSuccess() on successful OAuth
 *   - Calls oauthMetrics.recordFlowFailure() on OAuth errors
 *   - Metrics are passively collected, never analyzed for thresholds
 *   - No alerts triggered regardless of success rate
 * 
 * Bug Condition:
 * 1. OAuth operations occur (mix of successes and failures)
 * 2. Success rate drops below 95% (indicating degraded service)
 * 3. System collects metrics but performs no threshold analysis
 * 4. No alert is triggered for monitoring systems
 * 5. Service degradation goes undetected until manual dashboard review
 * 6. Security incidents (attack attempts) are not detected in real-time
 * 
 * Expected Behavior (after fix):
 * - System should continuously monitor OAuth success rate
 * - When success rate drops below 95% for 5+ minutes, trigger alert
 * - Alert should include: current rate, error breakdown, severity level
 * - When specific error types spike (>20% of errors), trigger error-specific alert
 * - Alerting should integrate with monitoring systems (Sentry, PagerDuty, etc.)
 * - Alert should provide actionable details for investigation
 * 
 * Requirements tested: 1.18, 1.19, 2.18, 2.19
 * 
 * **Validates: Requirements 1.18, 1.19, 2.18, 2.19**
 */

describe('OAuth Metrics - Bug Exploration: No Monitoring for Failed Flows', () => {
  beforeEach(() => {
    // Clear metrics before each test
    oauthMetrics.clearMetrics();
  });

  /**
   * Property 1: Bug Condition - No Monitoring for Failed Flows
   * 
   * **Validates: Requirements 1.18, 1.19, 2.18, 2.19**
   * 
   * This property tests the concrete scenario where OAuth success rate drops to 60%
   * (40% failure rate), which should trigger an alert but doesn't in the current code.
   * 
   * SCOPED PBT APPROACH:
   * - Generate metrics with low success rate (60% success, 40% failures)
   * - Simulate realistic OAuth flow patterns with various error types
   * - Check if system detects threshold violation and triggers alert
   * - Verify alert contains appropriate severity and error details
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - checkThresholds() method analyzes current success rate
   * - When rate < 95%, alert is generated with severity: 'critical'
   * - Alert includes: current rate, failure count, error breakdown
   * - Alert is logged/sent to monitoring system
   * - System provides actionable diagnostic information
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - No checkThresholds() method exists
   * - Metrics are collected but never analyzed
   * - No alert mechanism exists in OAuthMetrics
   * - Success rate can drop to 0% without any notification
   * - Security incidents and service degradation go undetected
   * 
   * CRITICAL: This test MUST FAIL on unfixed code to confirm the bug exists
   */
  it('PROPERTY 1: Bug Condition - No alerts triggered when success rate drops below 95%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate a degraded OAuth scenario: 60% success rate
          successCount: fc.constant(60), // Exactly 60 successes
          failureCount: fc.constant(40), // Exactly 40 failures = 60% success rate
        }),
        async ({ successCount, failureCount }) => {
          // Clear metrics to ensure clean state for this test run
          oauthMetrics.clearMetrics();
          
          // PHASE 1: Simulate OAuth operations with 60% success rate
          
          // Record successful OAuth flows
          for (let i = 0; i < successCount; i++) {
            oauthMetrics.recordFlowSuccess(
              150 + Math.random() * 100, // Duration: 150-250ms
              `user-${i}`,
              `user${i}@example.com`,
              `request-success-${i}`
            );
          }

          // Record failed OAuth flows with various error types distributed evenly
          const errorTypes: OAuthErrorType[] = [
            'token_exchange_failed',
            'state_expired',
            'invalid_state',
            'network_error',
          ];

          for (let i = 0; i < failureCount; i++) {
            oauthMetrics.recordFlowFailure(
              errorTypes[i % errorTypes.length],
              'token_exchange',
              `request-failure-${i}`,
              200 + Math.random() * 150 // Duration: 200-350ms
            );
          }

          // PHASE 2: Verify current metrics show degraded service
          const summary = oauthMetrics.getMetricsSummary();
          
          // Verify success rate is exactly 60% (60 successes / 100 total)
          expect(summary.flowSuccessRate).toBeCloseTo(60, 1);
          
          // PHASE 3: Check for alerting mechanism
          
          // EXPECTED BEHAVIOR (after fix):
          // The OAuthMetricsTracker should have a checkThresholds() method that:
          // 1. Analyzes current success rate
          // 2. Compares against threshold (95%)
          // 3. Triggers alert when rate < 95%
          // 4. Returns alert object with severity and details
          
          // Attempt to call checkThresholds() method
          const metricsTracker = oauthMetrics as any;
          
          // BUG CONFIRMATION: checkThresholds method doesn't exist
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE - confirms the bug exists
          expect(metricsTracker.checkThresholds).toBeDefined();
          expect(typeof metricsTracker.checkThresholds).toBe('function');
          
          // Call the threshold checking method
          const alerts = metricsTracker.checkThresholds();
          
          // Verify alert is generated for degraded success rate
          expect(alerts).toBeDefined();
          expect(Array.isArray(alerts)).toBe(true);
          expect(alerts.length).toBeGreaterThan(0);
          
          // Verify alert contains required information
          const successRateAlert = alerts.find((alert: any) => 
            alert.type === 'success_rate_degradation'
          );
          
          expect(successRateAlert).toBeDefined();
          expect(successRateAlert.severity).toBe('critical');
          expect(successRateAlert.currentRate).toBeLessThan(95);
          expect(successRateAlert.threshold).toBe(95);
          expect(successRateAlert.errorBreakdown).toBeDefined();
          expect(successRateAlert.message).toContain('success rate');
          
          // Verify alert includes actionable details
          expect(successRateAlert.errorBreakdown.token_exchange_failed).toBeGreaterThan(0);
          expect(successRateAlert.totalFailures).toBe(failureCount);
          
          return true;
        }
      ),
      {
        numRuns: 10, // Run 10 different degraded scenarios
        verbose: true,
      }
    );
  });

  /**
   * Property 2: Bug Condition - No Error Type Spike Detection
   * 
   * This property verifies that the system doesn't detect when a specific error type
   * spikes above normal levels, which could indicate a targeted issue (e.g., Google
   * OAuth service issue, configuration problem, or attack).
   */
  it('PROPERTY 2: Bug Condition - No alerts for specific error type spikes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate a scenario where token_exchange_failed dominates
          successCount: fc.integer({ min: 90, max: 95 }),
          tokenExchangeFailures: fc.integer({ min: 80, max: 90 }), // 80-90% of failures
          otherFailures: fc.integer({ min: 5, max: 10 }), // 10-20% of failures
        }),
        async ({ successCount, tokenExchangeFailures, otherFailures }) => {
          // Record successful flows
          for (let i = 0; i < successCount; i++) {
            oauthMetrics.recordFlowSuccess(
              150 + Math.random() * 100,
              `user-${i}`,
              `user${i}@example.com`,
              `request-${i}`
            );
          }

          // Record dominant error type (token_exchange_failed)
          for (let i = 0; i < tokenExchangeFailures; i++) {
            oauthMetrics.recordFlowFailure(
              'token_exchange_failed',
              'token_exchange',
              `request-token-fail-${i}`
            );
          }

          // Record other error types
          const otherErrorTypes: OAuthErrorType[] = [
            'state_expired',
            'invalid_state',
            'network_error',
          ];
          for (let i = 0; i < otherFailures; i++) {
            oauthMetrics.recordFlowFailure(
              otherErrorTypes[i % otherErrorTypes.length],
              'token_exchange',
              `request-other-fail-${i}`
            );
          }

          // Get error breakdown
          const summary = oauthMetrics.getMetricsSummary();
          const errorRates = summary.errorRatesByType;
          
          // Verify token_exchange_failed dominates (>80% of errors)
          expect(errorRates.token_exchange_failed).toBeGreaterThan(80);

          // EXPECTED BEHAVIOR (after fix):
          // checkThresholds() should detect error type spike
          // When a single error type > 50% of all errors, trigger specific alert
          
          const metricsTracker = oauthMetrics as any;
          
          // BUG CONFIRMATION: No error spike detection
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE
          expect(metricsTracker.checkThresholds).toBeDefined();
          
          const alerts = metricsTracker.checkThresholds();
          
          // Verify error-specific alert is generated
          const errorSpikeAlert = alerts.find((alert: any) => 
            alert.type === 'error_type_spike'
          );
          
          expect(errorSpikeAlert).toBeDefined();
          expect(errorSpikeAlert.errorType).toBe('token_exchange_failed');
          expect(errorSpikeAlert.percentage).toBeGreaterThan(50);
          expect(errorSpikeAlert.severity).toBe('high');
          expect(errorSpikeAlert.message).toContain('token_exchange_failed');
          
          return true;
        }
      ),
      {
        numRuns: 5,
        verbose: true,
      }
    );
  });

  /**
   * Property 3: Bug Condition - No Real-Time Anomaly Detection
   * 
   * This property verifies that the system doesn't detect sudden drops in success rate
   * over time windows (e.g., success rate was 99%, now suddenly 60%).
   */
  it('PROPERTY 3: Bug Condition - No detection of sudden success rate drops', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant({ phase1Total: 100, phase2Total: 100 }), // Fixed totals for predictable rates
        async ({ phase1Total, phase2Total }) => {
          // Clear metrics to ensure clean state
          oauthMetrics.clearMetrics();
          
          // PHASE 1: Normal operations (96% success rate)
          const phase1Successes = 96;
          const phase1Failures = 4;

          for (let i = 0; i < phase1Successes; i++) {
            oauthMetrics.recordFlowSuccess(
              150 + Math.random() * 100,
              `user-p1-${i}`,
              `user${i}@example.com`,
              `request-p1-${i}`
            );
          }

          for (let i = 0; i < phase1Failures; i++) {
            oauthMetrics.recordFlowFailure(
              'network_error',
              'token_exchange',
              `request-p1-fail-${i}`
            );
          }

          const summaryPhase1 = oauthMetrics.getMetricsSummary();
          const phase1Rate = summaryPhase1.flowSuccessRate;

          // Verify Phase 1 has high success rate (should be 96%)
          expect(phase1Rate).toBeCloseTo(96, 1);

          // IMPORTANT: Call checkThresholds() here to store the phase1 rate
          // This captures the baseline high success rate before degradation
          oauthMetrics.checkThresholds();

          // PHASE 2: Sudden degradation (35% success rate)
          const phase2Successes = 35;
          const phase2Failures = 65;

          for (let i = 0; i < phase2Successes; i++) {
            oauthMetrics.recordFlowSuccess(
              150 + Math.random() * 100,
              `user-p2-${i}`,
              `user${i}@example.com`,
              `request-p2-${i}`
            );
          }

          for (let i = 0; i < phase2Failures; i++) {
            oauthMetrics.recordFlowFailure(
              'token_exchange_failed',
              'token_exchange',
              `request-p2-fail-${i}`
            );
          }

          const summaryPhase2 = oauthMetrics.getMetricsSummary();
          const phase2Rate = summaryPhase2.flowSuccessRate;

          // The overall rate now includes both phases
          // Phase 1: 96 successes out of 100 = 96%
          // Phase 2: 35 successes out of 100 = 35%
          // Combined: 131 successes out of 200 = 65.5%
          expect(phase2Rate).toBeCloseTo(65.5, 1);

          // Calculate rate drop
          // For anomaly detection, we need to check the recent rates tracked internally
          // The system tracks recent rates and compares consecutive rates
          // Phase 1 rate was 96%, overall rate after phase 2 is 65.5%
          // We called checkThresholds() after phase 1 to store the 96% rate
          // Now when we call it again, it will compare 65.5% to 96% and detect anomaly
          
          // The drop from phase1Rate (96%) to phase2Rate (65.5%) should be detected
          // as an anomaly since it's > 20% drop
          const expectedDrop = phase1Rate - phase2Rate;
          expect(expectedDrop).toBeGreaterThan(20); // Should be around 30.5%

          // EXPECTED BEHAVIOR (after fix):
          // checkThresholds() should detect sudden anomaly
          // When success rate drops >20% in recent window, trigger anomaly alert

          const metricsTracker = oauthMetrics as any;

          // BUG CONFIRMATION: No anomaly detection
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE
          expect(metricsTracker.checkThresholds).toBeDefined();

          // Call checkThresholds() again - this will detect the anomaly
          const alerts = metricsTracker.checkThresholds();

          // Verify anomaly alert is generated
          const anomalyAlert = alerts.find((alert: any) => 
            alert.type === 'success_rate_anomaly'
          );

          expect(anomalyAlert).toBeDefined();
          expect(anomalyAlert.previousRate).toBeCloseTo(96, 1);
          expect(anomalyAlert.currentRate).toBeCloseTo(65.5, 1);
          expect(anomalyAlert.drop).toBeGreaterThan(20);
          expect(anomalyAlert.severity).toBe('critical');

          return true;
        }
      ),
      {
        numRuns: 5,
        verbose: true,
      }
    );
  });

  /**
   * Property 4: Bug Condition - No Alert Integration
   * 
   * This property verifies that even if thresholds are checked, there's no mechanism
   * to send alerts to external monitoring systems (Sentry, PagerDuty, logs, etc.).
   */
  it('PROPERTY 4: Bug Condition - No integration with monitoring/alerting systems', async () => {
    // Simulate degraded service
    for (let i = 0; i < 60; i++) {
      oauthMetrics.recordFlowSuccess(
        150 + Math.random() * 100,
        `user-${i}`,
        `user${i}@example.com`,
        `request-${i}`
      );
    }

    for (let i = 0; i < 40; i++) {
      oauthMetrics.recordFlowFailure(
        'token_exchange_failed',
        'token_exchange',
        `request-fail-${i}`
      );
    }

    const summary = oauthMetrics.getMetricsSummary();
    expect(summary.flowSuccessRate).toBeLessThan(65);

    // EXPECTED BEHAVIOR (after fix):
    // triggerAlert() method should exist to send alerts to monitoring systems
    // Should integrate with: Sentry, PagerDuty, CloudWatch, Datadog, etc.
    // Should log alerts with appropriate severity levels

    const metricsTracker = oauthMetrics as any;

    // BUG CONFIRMATION: No triggerAlert method exists
    // THIS ASSERTION WILL FAIL ON UNFIXED CODE
    expect(metricsTracker.triggerAlert).toBeDefined();
    expect(typeof metricsTracker.triggerAlert).toBe('function');

    // Simulate triggering an alert
    const alertData = {
      type: 'success_rate_degradation',
      severity: 'critical',
      currentRate: summary.flowSuccessRate,
      threshold: 95,
      message: `OAuth success rate dropped to ${summary.flowSuccessRate.toFixed(2)}%`,
    };

    // Verify triggerAlert can be called
    const alertResult = await metricsTracker.triggerAlert(alertData);

    // Verify alert was sent (should return success confirmation)
    expect(alertResult).toBeDefined();
    expect(alertResult.sent).toBe(true);
    expect(alertResult.timestamp).toBeDefined();
  });

  /**
   * Property 5: Bug Condition - No Configurable Thresholds
   * 
   * This property verifies that the system doesn't support configurable alert thresholds
   * (e.g., allowing ops team to set success rate threshold to 90% instead of 95%).
   */
  it('PROPERTY 5: Bug Condition - No configurable alert thresholds', async () => {
    const metricsTracker = oauthMetrics as any;

    // EXPECTED BEHAVIOR (after fix):
    // Should allow configuration of alert thresholds
    // e.g., setThreshold('success_rate', 90) to trigger at 90% instead of 95%

    // BUG CONFIRMATION: No threshold configuration support
    // THIS ASSERTION WILL FAIL ON UNFIXED CODE
    expect(metricsTracker.setThreshold).toBeDefined();
    expect(typeof metricsTracker.setThreshold).toBe('function');

    // Verify can set custom threshold to 93% (will alert when rate < 93%)
    metricsTracker.setThreshold('success_rate', 93);
    
    const config = metricsTracker.getAlertConfiguration();
    expect(config.success_rate_threshold).toBe(93);

    // Simulate scenario at 92% success (should alert with 93% threshold since 92% < 93%)
    for (let i = 0; i < 92; i++) {
      oauthMetrics.recordFlowSuccess(150, `user-${i}`, `user${i}@example.com`, `req-${i}`);
    }
    for (let i = 0; i < 8; i++) {
      oauthMetrics.recordFlowFailure('network_error', 'token_exchange', `req-fail-${i}`);
    }

    const alerts = metricsTracker.checkThresholds();
    
    // Should trigger alert because 92% < 93% threshold
    const successRateAlert = alerts.find((a: any) => a.type === 'success_rate_degradation');
    expect(successRateAlert).toBeDefined();
  });

  /**
   * Property 6: Preservation - Metrics Collection Unaffected
   * 
   * This property documents that the fix should not break existing metrics collection.
   * Recording operations and querying metrics should continue to work correctly.
   */
  it('PROPERTY 6: Preservation - Existing metrics collection continues to work', async () => {
    // Record some operations
    oauthMetrics.recordFlowSuccess(200, 'user-1', 'user1@example.com', 'req-1');
    oauthMetrics.recordFlowSuccess(180, 'user-2', 'user2@example.com', 'req-2');
    oauthMetrics.recordFlowFailure('invalid_state', 'initialization', 'req-3');
    oauthMetrics.recordTokenRefresh(true, 50, 'user-1', 'req-4');

    // Verify metrics collection still works
    const summary = oauthMetrics.getMetricsSummary();
    
    expect(summary.totalFlows).toBe(3); // 2 success + 1 failure
    expect(summary.totalRefreshes).toBe(1);
    expect(summary.flowSuccessRate).toBeCloseTo(66.67, 1);
    expect(summary.averageFlowDurationMs).toBeGreaterThan(0);
    expect(summary.errorRatesByType.invalid_state).toBeGreaterThan(0);

    // The fix should add alerting WITHOUT breaking existing functionality
  });
});
