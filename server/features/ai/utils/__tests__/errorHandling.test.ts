/**
 * Unit tests for errorHandling utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyAIError,
  calculateBackoffDelay,
  sleep,
  retryWithBackoff,
  DEFAULT_RETRY_CONFIG,
  CircuitBreaker,
  createErrorResponse,
  type RetryConfig
} from '../errorHandling';

describe('errorHandling', () => {
  describe('classifyAIError', () => {
    it('should classify quota exceeded error', () => {
      const error = { code: 'insufficient_quota', message: 'Quota exceeded' };
      const result = classifyAIError(error, 'OpenAI');

      expect(result.code).toBe('QUOTA_EXCEEDED');
      expect(result.isRetryable).toBe(false);
      expect(result.provider).toBe('OpenAI');
    });

    it('should classify rate limit error', () => {
      const error = { status: 429, message: 'Rate limit' };
      const result = classifyAIError(error);

      expect(result.code).toBe('RATE_LIMIT');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify auth error', () => {
      const error = { code: 'invalid_api_key', message: 'Invalid key' };
      const result = classifyAIError(error);

      expect(result.code).toBe('AUTH_ERROR');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify timeout error', () => {
      const error = { code: 'timeout', message: 'Request timeout' };
      const result = classifyAIError(error);

      expect(result.code).toBe('TIMEOUT');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify service unavailable error', () => {
      const error = { status: 503, message: 'Service unavailable' };
      const result = classifyAIError(error);

      expect(result.code).toBe('SERVICE_UNAVAILABLE');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify Google AI safety block', () => {
      const error = { message: 'Content blocked by SAFETY filters' };
      const result = classifyAIError(error);

      expect(result.code).toBe('SAFETY_BLOCK');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify network error', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const result = classifyAIError(error);

      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify unknown error', () => {
      const error = { message: 'Unknown problem' };
      const result = classifyAIError(error);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.originalError).toEqual(error);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff', () => {
      const config: RetryConfig = {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        retryableErrors: []
      };

      const delay1 = calculateBackoffDelay(1, config);
      const delay2 = calculateBackoffDelay(2, config);
      const delay3 = calculateBackoffDelay(3, config);

      expect(delay1).toBeGreaterThanOrEqual(700); // ~1000ms with jitter
      expect(delay1).toBeLessThanOrEqual(1300);
      
      expect(delay2).toBeGreaterThanOrEqual(1400); // ~2000ms with jitter
      expect(delay2).toBeLessThanOrEqual(2600);
      
      expect(delay3).toBeGreaterThanOrEqual(2800); // ~4000ms with jitter
      expect(delay3).toBeLessThanOrEqual(5200);
    });

    it('should cap at max delay', () => {
      const config: RetryConfig = {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        retryableErrors: []
      };

      const delay = calculateBackoffDelay(10, config);

      expect(delay).toBeLessThanOrEqual(6500); // maxDelay + jitter
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3
      };

      const result = await retryWithBackoff(operation, config, 'test');

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce({ status: 503, message: 'Unavailable' })
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        initialDelayMs: 10 // Fast for testing
      };

      const result = await retryWithBackoff(operation, config, 'test');

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable error', async () => {
      const operation = vi.fn()
        .mockRejectedValue({ code: 'invalid_api_key', message: 'Invalid key' });

      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3
      };

      const result = await retryWithBackoff(operation, config, 'test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_ERROR');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should fail after max attempts', async () => {
      const operation = vi.fn()
        .mockRejectedValue({ status: 503, message: 'Unavailable' });

      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 2,
        initialDelayMs: 10
      };

      const result = await retryWithBackoff(operation, config, 'test');

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker(2, 100, 1); // Low thresholds for testing
    });

    it('should execute operation when closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(operation, 'test');

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open circuit after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // First failure
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      expect(breaker.getState()).toBe('CLOSED');

      // Second failure - circuit opens
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should reject immediately when open', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger circuit to open
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Next call should fail immediately without calling operation
      const callCount = operation.mock.calls.length;
      await expect(breaker.execute(operation, 'test')).rejects.toThrow('Circuit breaker is OPEN');
      expect(operation).toHaveBeenCalledTimes(callCount); // No new calls
    });

    it('should transition to half-open after timeout', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce('success');

      // Open circuit
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await sleep(150);

      // Should transition to half-open and succeed
      const result = await breaker.execute(operation, 'test');
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reset manually', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open circuit
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Manual reset
      breaker.reset();
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reset on success in half-open', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce('success');

      // Open circuit
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      await expect(breaker.execute(operation, 'test')).rejects.toThrow();
      
      // Wait and transition to half-open
      await sleep(150);
      
      // Success should close circuit
      await breaker.execute(operation, 'test');
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response', () => {
      const aiError = {
        code: 'RATE_LIMIT',
        message: 'Rate limit exceeded',
        provider: 'OpenAI',
        isRetryable: true,
        originalError: new Error('Original')
      };

      const response = createErrorResponse(aiError);

      expect(response.error).toBe('Rate limit exceeded');
      expect(response.code).toBe('RATE_LIMIT');
      expect(response.retryable).toBe(true);
      expect(response.details).toBe('Original');
    });

    it('should handle error without details', () => {
      const aiError = {
        code: 'UNKNOWN',
        message: 'Unknown error',
        isRetryable: false
      };

      const response = createErrorResponse(aiError);

      expect(response.error).toBe('Unknown error');
      expect(response.details).toBeUndefined();
    });
  });
});
