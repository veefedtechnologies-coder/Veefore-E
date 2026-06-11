/**
 * OAuth Metrics Endpoint Integration Tests
 * 
 * Tests the /api/auth/metrics endpoint functionality.
 * 
 * Requirements: 18.9
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../auth';
import { oauthMetrics } from '../../services/oauth/OAuthMetrics';

// Create a minimal Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('GET /api/auth/metrics', () => {
  beforeEach(() => {
    // Clear metrics before each test
    oauthMetrics.clearMetrics();
  });

  it('should return metrics summary', async () => {
    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('metrics');
    
    const { metrics } = response.body;
    expect(metrics).toHaveProperty('oauth_flow');
    expect(metrics).toHaveProperty('token_refresh');
    expect(metrics).toHaveProperty('errors');
    expect(metrics).toHaveProperty('metadata');
  });

  it('should return correct structure for oauth_flow metrics', async () => {
    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { oauth_flow } = response.body.metrics;
    expect(oauth_flow).toHaveProperty('success_rate_percent');
    expect(oauth_flow).toHaveProperty('total_flows');
    expect(oauth_flow).toHaveProperty('average_duration_ms');
    
    // Verify types
    expect(typeof oauth_flow.success_rate_percent).toBe('string');
    expect(typeof oauth_flow.total_flows).toBe('number');
    expect(typeof oauth_flow.average_duration_ms).toBe('string');
  });

  it('should return correct structure for token_refresh metrics', async () => {
    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { token_refresh } = response.body.metrics;
    expect(token_refresh).toHaveProperty('success_rate_percent');
    expect(token_refresh).toHaveProperty('total_refreshes');
    
    // Verify types
    expect(typeof token_refresh.success_rate_percent).toBe('string');
    expect(typeof token_refresh.total_refreshes).toBe('number');
  });

  it('should return correct structure for errors metrics', async () => {
    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { errors } = response.body.metrics;
    expect(errors).toHaveProperty('error_rates_by_type');
    expect(typeof errors.error_rates_by_type).toBe('object');
  });

  it('should return metadata with note', async () => {
    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { metadata } = response.body.metrics;
    expect(metadata).toHaveProperty('recent_metrics_count');
    expect(metadata).toHaveProperty('note');
    expect(metadata.note).toContain('1000 operations');
  });

  it('should return zero metrics when no operations recorded', async () => {
    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { metrics } = response.body;
    expect(metrics.oauth_flow.success_rate_percent).toBe('0.00');
    expect(metrics.oauth_flow.total_flows).toBe(0);
    expect(metrics.oauth_flow.average_duration_ms).toBe('0');
    expect(metrics.token_refresh.success_rate_percent).toBe('0.00');
    expect(metrics.token_refresh.total_refreshes).toBe(0);
    expect(metrics.metadata.recent_metrics_count).toBe(0);
  });

  it('should reflect recorded operations in metrics', async () => {
    // Record some operations
    oauthMetrics.recordFlowSuccess(2500, 'user_1', 'user1@example.com', 'req_1');
    oauthMetrics.recordFlowSuccess(3000, 'user_2', 'user2@example.com', 'req_2');
    oauthMetrics.recordTokenRefresh(true, 300, 'user_1', 'refresh_1');

    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { metrics } = response.body;
    expect(metrics.oauth_flow.success_rate_percent).toBe('100.00');
    expect(metrics.oauth_flow.total_flows).toBe(2);
    expect(metrics.oauth_flow.average_duration_ms).toBe('2750'); // Average of 2500 and 3000
    expect(metrics.token_refresh.success_rate_percent).toBe('100.00');
    expect(metrics.token_refresh.total_refreshes).toBe(1);
  });

  it('should reflect errors in metrics', async () => {
    // Record successful and failed operations
    oauthMetrics.recordFlowSuccess(2000, 'user_1', 'user1@example.com', 'req_1');
    oauthMetrics.recordFlowFailure('invalid_state', 'google_authorization', 'req_2', 500);
    oauthMetrics.recordFlowFailure('token_exchange_failed', 'token_exchange', 'req_3', 800);

    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { metrics } = response.body;
    
    // Success rate should be 33.33% (1 success out of 3 total)
    expect(parseFloat(metrics.oauth_flow.success_rate_percent)).toBeCloseTo(33.33, 1);
    expect(metrics.oauth_flow.total_flows).toBe(3);
    
    // Error rates
    const errorRates = metrics.errors.error_rates_by_type;
    expect(errorRates).toHaveProperty('invalid_state');
    expect(errorRates).toHaveProperty('token_exchange_failed');
    expect(errorRates.invalid_state).toBe(50); // 1 out of 2 errors
    expect(errorRates.token_exchange_failed).toBe(50); // 1 out of 2 errors
  });

  it('should include timestamp in response', async () => {
    const beforeRequest = new Date().toISOString();
    
    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const afterRequest = new Date().toISOString();
    
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    // Timestamp should be between before and after
    expect(new Date(response.body.timestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeRequest).getTime() - 1000 // Allow 1 second tolerance
    );
    expect(new Date(response.body.timestamp).getTime()).toBeLessThanOrEqual(
      new Date(afterRequest).getTime() + 1000 // Allow 1 second tolerance
    );
  });

  it('should format percentages with 2 decimal places', async () => {
    // Record operations that will result in non-round percentages
    oauthMetrics.recordFlowSuccess(1000, 'user_1', 'user1@example.com', 'req_1');
    oauthMetrics.recordFlowSuccess(2000, 'user_2', 'user2@example.com', 'req_2');
    oauthMetrics.recordFlowFailure('invalid_state', 'google_authorization', 'req_3', 500);

    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { metrics } = response.body;
    
    // 2 successes out of 3 = 66.666...%
    expect(metrics.oauth_flow.success_rate_percent).toMatch(/^\d+\.\d{2}$/);
    expect(metrics.oauth_flow.success_rate_percent).toBe('66.67');
  });

  it('should format duration as integer string', async () => {
    oauthMetrics.recordFlowSuccess(2555, 'user_1', 'user1@example.com', 'req_1');

    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { metrics } = response.body;
    
    // Duration should be rounded to integer
    expect(metrics.oauth_flow.average_duration_ms).toMatch(/^\d+$/);
    expect(metrics.oauth_flow.average_duration_ms).toBe('2555');
  });

  it('should handle high volume of metrics', async () => {
    // Record many operations
    for (let i = 0; i < 100; i++) {
      oauthMetrics.recordFlowSuccess(
        1000 + i * 10,
        `user_${i}`,
        `user${i}@example.com`,
        `req_${i}`
      );
    }

    const response = await request(app)
      .get('/api/auth/metrics')
      .expect(200);

    const { metrics } = response.body;
    expect(metrics.oauth_flow.total_flows).toBe(100);
    expect(metrics.oauth_flow.success_rate_percent).toBe('100.00');
  });

  it('should handle concurrent requests', async () => {
    // Make multiple concurrent requests
    const requests = Array(10).fill(null).map(() =>
      request(app).get('/api/auth/metrics')
    );

    const responses = await Promise.all(requests);

    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
