/**
 * OAuth Metrics Integration Tests
 * 
 * Tests that OAuth metrics tracking is properly integrated with OAuth routes.
 * 
 * Requirements: 18.9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { oauthMetrics } from '../../services/oauth/OAuthMetrics';

describe('OAuth Metrics Integration', () => {
  beforeEach(() => {
    // Clear metrics before each test
    oauthMetrics.clearMetrics();
  });

  describe('Flow Initiation Tracking', () => {
    it('should record OAuth flow initiation', () => {
      const requestId = 'test_request_123';
      
      oauthMetrics.recordFlowInitiation(requestId);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.recentMetricsCount).toBe(1);
    });
  });

  describe('Flow Success Tracking', () => {
    it('should record successful OAuth flow completion', () => {
      const durationMs = 2500;
      const userId = 'user_123';
      const email = 'test@example.com';
      const requestId = 'test_request_123';
      
      oauthMetrics.recordFlowSuccess(durationMs, userId, email, requestId);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.totalFlows).toBe(1);
      expect(summary.flowSuccessRate).toBe(100);
      expect(summary.averageFlowDurationMs).toBe(durationMs);
    });

    it('should track multiple successful flows', () => {
      oauthMetrics.recordFlowSuccess(1000, 'user_1', 'user1@example.com', 'req_1');
      oauthMetrics.recordFlowSuccess(2000, 'user_2', 'user2@example.com', 'req_2');
      oauthMetrics.recordFlowSuccess(3000, 'user_3', 'user3@example.com', 'req_3');
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.totalFlows).toBe(3);
      expect(summary.flowSuccessRate).toBe(100);
      expect(summary.averageFlowDurationMs).toBe(2000); // Average of 1000, 2000, 3000
    });
  });

  describe('Flow Failure Tracking', () => {
    it('should record OAuth flow failure with error type', () => {
      const errorType = 'invalid_state';
      const stage = 'google_authorization';
      const requestId = 'test_request_123';
      const durationMs = 500;
      
      oauthMetrics.recordFlowFailure(errorType, stage, requestId, durationMs);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.totalFlows).toBe(1);
      expect(summary.flowSuccessRate).toBe(0);
      
      const errorRates = summary.errorRatesByType;
      expect(errorRates.invalid_state).toBe(100); // 100% of errors are invalid_state
    });

    it('should calculate flow success rate correctly with mixed results', () => {
      // Record 3 successful flows
      oauthMetrics.recordFlowSuccess(1000, 'user_1', 'user1@example.com', 'req_1');
      oauthMetrics.recordFlowSuccess(2000, 'user_2', 'user2@example.com', 'req_2');
      oauthMetrics.recordFlowSuccess(3000, 'user_3', 'user3@example.com', 'req_3');
      
      // Record 1 failed flow
      oauthMetrics.recordFlowFailure('token_exchange_failed', 'token_exchange', 'req_4', 500);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.totalFlows).toBe(4);
      expect(summary.flowSuccessRate).toBe(75); // 3 out of 4 successful
    });

    it('should track different error types', () => {
      oauthMetrics.recordFlowFailure('invalid_state', 'google_authorization', 'req_1');
      oauthMetrics.recordFlowFailure('state_expired', 'google_authorization', 'req_2');
      oauthMetrics.recordFlowFailure('token_exchange_failed', 'token_exchange', 'req_3');
      oauthMetrics.recordFlowFailure('token_exchange_failed', 'token_exchange', 'req_4');
      
      const summary = oauthMetrics.getMetricsSummary();
      const errorRates = summary.errorRatesByType;
      
      expect(errorRates.invalid_state).toBe(25); // 1 out of 4 errors
      expect(errorRates.state_expired).toBe(25); // 1 out of 4 errors
      expect(errorRates.token_exchange_failed).toBe(50); // 2 out of 4 errors
    });
  });

  describe('Token Refresh Tracking', () => {
    it('should record successful token refresh', () => {
      const durationMs = 300;
      const userId = 'user_123';
      const requestId = 'refresh_req_123';
      
      oauthMetrics.recordTokenRefresh(true, durationMs, userId, requestId);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.totalRefreshes).toBe(1);
      expect(summary.refreshSuccessRate).toBe(100);
    });

    it('should record failed token refresh', () => {
      const durationMs = 200;
      const requestId = 'refresh_req_123';
      
      oauthMetrics.recordTokenRefresh(false, durationMs, undefined, requestId);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.totalRefreshes).toBe(1);
      expect(summary.refreshSuccessRate).toBe(0);
    });

    it('should calculate refresh success rate correctly with mixed results', () => {
      // Record 4 successful refreshes
      oauthMetrics.recordTokenRefresh(true, 300, 'user_1', 'req_1');
      oauthMetrics.recordTokenRefresh(true, 250, 'user_2', 'req_2');
      oauthMetrics.recordTokenRefresh(true, 400, 'user_3', 'req_3');
      oauthMetrics.recordTokenRefresh(true, 350, 'user_4', 'req_4');
      
      // Record 1 failed refresh
      oauthMetrics.recordTokenRefresh(false, 200, undefined, 'req_5');
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.totalRefreshes).toBe(5);
      expect(summary.refreshSuccessRate).toBe(80); // 4 out of 5 successful
    });
  });

  describe('Logout Tracking', () => {
    it('should record logout operation', () => {
      const userId = 'user_123';
      
      oauthMetrics.recordLogout(userId);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.recentMetricsCount).toBe(1);
    });
  });

  describe('Metrics Summary', () => {
    it('should return comprehensive metrics summary', () => {
      // Record various operations
      oauthMetrics.recordFlowInitiation('req_1');
      oauthMetrics.recordFlowSuccess(2000, 'user_1', 'user1@example.com', 'req_1');
      oauthMetrics.recordFlowFailure('invalid_state', 'google_authorization', 'req_2', 500);
      oauthMetrics.recordTokenRefresh(true, 300, 'user_1', 'refresh_1');
      oauthMetrics.recordTokenRefresh(false, 200, undefined, 'refresh_2');
      oauthMetrics.recordLogout('user_1');
      
      const summary = oauthMetrics.getMetricsSummary();
      
      expect(summary).toHaveProperty('flowSuccessRate');
      expect(summary).toHaveProperty('refreshSuccessRate');
      expect(summary).toHaveProperty('averageFlowDurationMs');
      expect(summary).toHaveProperty('errorRatesByType');
      expect(summary).toHaveProperty('totalFlows');
      expect(summary).toHaveProperty('totalRefreshes');
      expect(summary).toHaveProperty('recentMetricsCount');
      
      expect(summary.totalFlows).toBe(2); // 1 success + 1 failure
      expect(summary.totalRefreshes).toBe(2); // 1 success + 1 failure
      expect(summary.flowSuccessRate).toBe(50); // 1 out of 2 successful
      expect(summary.refreshSuccessRate).toBe(50); // 1 out of 2 successful
    });

    it('should handle empty metrics gracefully', () => {
      const summary = oauthMetrics.getMetricsSummary();
      
      expect(summary.flowSuccessRate).toBe(0);
      expect(summary.refreshSuccessRate).toBe(0);
      expect(summary.averageFlowDurationMs).toBe(0);
      expect(summary.totalFlows).toBe(0);
      expect(summary.totalRefreshes).toBe(0);
      expect(summary.recentMetricsCount).toBe(0);
    });
  });

  describe('Metrics Endpoint Response Format', () => {
    it('should format metrics for monitoring dashboard', () => {
      // Simulate a typical OAuth session
      oauthMetrics.recordFlowInitiation('req_1');
      oauthMetrics.recordFlowSuccess(2500, 'user_1', 'user1@example.com', 'req_1');
      oauthMetrics.recordTokenRefresh(true, 300, 'user_1', 'refresh_1');
      
      const summary = oauthMetrics.getMetricsSummary();
      
      // Verify the structure matches the API endpoint format
      const apiResponse = {
        oauth_flow: {
          success_rate_percent: summary.flowSuccessRate.toFixed(2),
          total_flows: summary.totalFlows,
          average_duration_ms: summary.averageFlowDurationMs.toFixed(0),
        },
        token_refresh: {
          success_rate_percent: summary.refreshSuccessRate.toFixed(2),
          total_refreshes: summary.totalRefreshes,
        },
        errors: {
          error_rates_by_type: summary.errorRatesByType,
        },
      };
      
      expect(apiResponse.oauth_flow.success_rate_percent).toBe('100.00');
      expect(apiResponse.oauth_flow.total_flows).toBe(1);
      expect(apiResponse.oauth_flow.average_duration_ms).toBe('2500');
      expect(apiResponse.token_refresh.success_rate_percent).toBe('100.00');
      expect(apiResponse.token_refresh.total_refreshes).toBe(1);
    });
  });

  describe('Latency Tracking', () => {
    it('should track OAuth flow latency', () => {
      const durations = [1000, 2000, 3000, 4000, 5000];
      
      durations.forEach((duration, index) => {
        oauthMetrics.recordFlowSuccess(
          duration,
          `user_${index}`,
          `user${index}@example.com`,
          `req_${index}`
        );
      });
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.averageFlowDurationMs).toBe(3000); // Average of 1000-5000
    });

    it('should not include failed flows in average duration calculation', () => {
      // Successful flows with durations
      oauthMetrics.recordFlowSuccess(1000, 'user_1', 'user1@example.com', 'req_1');
      oauthMetrics.recordFlowSuccess(3000, 'user_2', 'user2@example.com', 'req_2');
      
      // Failed flow with duration (should not affect average)
      oauthMetrics.recordFlowFailure('token_exchange_failed', 'token_exchange', 'req_3', 5000);
      
      const summary = oauthMetrics.getMetricsSummary();
      expect(summary.averageFlowDurationMs).toBe(2000); // Average of only successful flows
    });
  });
});
