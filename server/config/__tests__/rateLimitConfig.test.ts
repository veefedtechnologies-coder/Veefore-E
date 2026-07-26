/**
 * Unit tests for server/config/rateLimitConfig.ts
 *
 * Validates: Requirements 10.6, 10.7, 10.8
 * - 10.6: Config is typed (TypeScript interface) — missing/incorrect values caught at compile time
 * - 10.7: Environment-based overrides without code changes
 * - 10.8: Startup warning when config values are at defaults
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger to avoid env validation chain and capture log calls
vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  buildRateLimitConfig,
  validateRateLimitConfigAtStartup,
  RATE_LIMIT_DEFAULTS,
  mapMetaErrorToUserMessage,
  rateLimitConfig,
  type RateLimitConfig,
} from '../rateLimitConfig';
import { logger } from '../logger';

describe('rateLimitConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore a clean env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // Test 1: Default config satisfies the interface (compile-time + runtime)
  // -------------------------------------------------------------------------
  describe('default config structure', () => {
    it('should have all required top-level fields with correct types', () => {
      const config: RateLimitConfig = RATE_LIMIT_DEFAULTS;

      expect(typeof config.bucMultiplier).toBe('number');
      expect(typeof config.platformRateLimitMultiplier).toBe('number');
      expect(typeof config.publishLimitPerDay).toBe('number');
      expect(typeof config.messagingCeilingPerHour).toBe('number');
      expect(typeof config.highCeilingImpressionThreshold).toBe('number');
      expect(typeof config.usageRecordTtlSeconds).toBe('number');
      expect(typeof config.stalenessThresholdMs).toBe('number');
      expect(typeof config.initialFetchCount).toBe('number');
      expect(typeof config.initialFetchCountLowCeiling).toBe('number');
      expect(typeof config.httpTimeoutMs).toBe('number');
      expect(typeof config.maxRetries).toBe('number');
      expect(typeof config.deduplicationWindowMs).toBe('number');
    });

    it('should have tier thresholds with caution < restricted < critical', () => {
      const { tierThresholds } = RATE_LIMIT_DEFAULTS;
      expect(tierThresholds.caution).toBeLessThan(tierThresholds.restricted);
      expect(tierThresholds.restricted).toBeLessThan(tierThresholds.critical);
    });

    it('should have polling cadence for both high and low ceiling', () => {
      const { polling } = RATE_LIMIT_DEFAULTS;
      expect(polling.highCeiling).toBeDefined();
      expect(polling.lowCeiling).toBeDefined();
      expect(typeof polling.highCeiling.accountInsightsMs).toBe('number');
      expect(typeof polling.highCeiling.postInsightsRecentMs).toBe('number');
      expect(typeof polling.highCeiling.postInsightsOlderMs).toBe('number');
      expect(typeof polling.highCeiling.newPostDetectionMs).toBe('number');
      expect(typeof polling.highCeiling.followerCountMs).toBe('number');
      expect(typeof polling.lowCeiling.accountInsightsMs).toBe('number');
    });

    it('should have queue configuration fields', () => {
      const { queue } = RATE_LIMIT_DEFAULTS;
      expect(typeof queue.webhookConcurrencyPerAccount).toBe('number');
      expect(typeof queue.maxDeferredRetries).toBe('number');
      expect(typeof queue.deferredAlertThresholdHours).toBe('number');
      expect(typeof queue.queueDepthAlertThreshold).toBe('number');
    });

    it('should have errorMessageMap with default and known codes', () => {
      const { errorMessageMap } = RATE_LIMIT_DEFAULTS;
      expect(errorMessageMap['default']).toBeDefined();
      expect(errorMessageMap['80002']).toBeDefined();
      expect(errorMessageMap['429']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Environment variable overrides (flat keys)
  // -------------------------------------------------------------------------
  describe('environment variable overrides', () => {
    it('should override flat numeric values from env vars', () => {
      process.env.RATE_LIMIT_BUC_MULTIPLIER = '9600';
      process.env.RATE_LIMIT_HTTP_TIMEOUT_MS = '5000';

      const { config, overriddenKeys } = buildRateLimitConfig();

      expect(config.bucMultiplier).toBe(9600);
      expect(config.httpTimeoutMs).toBe(5000);
      expect(overriddenKeys).toContain('RATE_LIMIT_BUC_MULTIPLIER');
      expect(overriddenKeys).toContain('RATE_LIMIT_HTTP_TIMEOUT_MS');
    });

    it('should not override when env var is empty string', () => {
      process.env.RATE_LIMIT_BUC_MULTIPLIER = '';

      const { config, overriddenKeys } = buildRateLimitConfig();

      expect(config.bucMultiplier).toBe(RATE_LIMIT_DEFAULTS.bucMultiplier);
      expect(overriddenKeys).not.toContain('RATE_LIMIT_BUC_MULTIPLIER');
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Nested overrides (e.g., tier thresholds)
  // -------------------------------------------------------------------------
  describe('nested environment overrides', () => {
    it('should override tierThresholds.caution via RATE_LIMIT_TIER_CAUTION', () => {
      process.env.RATE_LIMIT_TIER_CAUTION = '50';

      const { config } = buildRateLimitConfig();

      expect(config.tierThresholds.caution).toBe(50);
      // Other tier thresholds should remain at defaults
      expect(config.tierThresholds.restricted).toBe(RATE_LIMIT_DEFAULTS.tierThresholds.restricted);
      expect(config.tierThresholds.critical).toBe(RATE_LIMIT_DEFAULTS.tierThresholds.critical);
    });

    it('should override polling.highCeiling.accountInsightsMs', () => {
      process.env.RATE_LIMIT_POLL_HC_ACCOUNT_MS = '120000';

      const { config } = buildRateLimitConfig();

      expect(config.polling.highCeiling.accountInsightsMs).toBe(120000);
    });

    it('should override queue.webhookConcurrencyPerAccount', () => {
      process.env.RATE_LIMIT_WEBHOOK_CONCURRENCY = '5';

      const { config } = buildRateLimitConfig();

      expect(config.queue.webhookConcurrencyPerAccount).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Test 4: Invalid env values log a warning and keep defaults
  // -------------------------------------------------------------------------
  describe('invalid environment values', () => {
    it('should log a warning and keep default for non-numeric string', () => {
      process.env.RATE_LIMIT_BUC_MULTIPLIER = 'not-a-number';

      const { config } = buildRateLimitConfig();

      expect(config.bucMultiplier).toBe(RATE_LIMIT_DEFAULTS.bucMultiplier);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid numeric value for RATE_LIMIT_BUC_MULTIPLIER'),
        expect.objectContaining({ component: 'RateLimitConfig' }),
      );
    });

    it('should log a warning for each invalid env var but still apply valid ones', () => {
      process.env.RATE_LIMIT_BUC_MULTIPLIER = 'abc';
      process.env.RATE_LIMIT_HTTP_TIMEOUT_MS = '5000';

      const { config, overriddenKeys } = buildRateLimitConfig();

      expect(config.bucMultiplier).toBe(RATE_LIMIT_DEFAULTS.bucMultiplier);
      expect(config.httpTimeoutMs).toBe(5000);
      expect(overriddenKeys).not.toContain('RATE_LIMIT_BUC_MULTIPLIER');
      expect(overriddenKeys).toContain('RATE_LIMIT_HTTP_TIMEOUT_MS');
    });
  });

  // -------------------------------------------------------------------------
  // Test 5: validateRateLimitConfigAtStartup with empty overriddenKeys
  // -------------------------------------------------------------------------
  describe('validateRateLimitConfigAtStartup', () => {
    it('should log a warning when no overrides are provided (all defaults)', () => {
      validateRateLimitConfigAtStartup([]);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('All rate-limit configuration values are using defaults'),
        expect.objectContaining({ component: 'RateLimitConfig' }),
      );
    });

    // -----------------------------------------------------------------------
    // Test 6: validateRateLimitConfigAtStartup with some overrides
    // -----------------------------------------------------------------------
    it('should log info with override count when some overrides are provided', () => {
      validateRateLimitConfigAtStartup(['RATE_LIMIT_BUC_MULTIPLIER', 'RATE_LIMIT_HTTP_TIMEOUT_MS']);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('2 environment override(s)'),
        expect.objectContaining({ component: 'RateLimitConfig' }),
      );
    });

    it('should warn about critical config values still at defaults', () => {
      // Provide some overrides but not the critical ones
      validateRateLimitConfigAtStartup(['RATE_LIMIT_HTTP_TIMEOUT_MS']);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Critical config values still at defaults'),
        expect.objectContaining({ component: 'RateLimitConfig' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test 7: mapMetaErrorToUserMessage for known codes
  // -------------------------------------------------------------------------
  describe('mapMetaErrorToUserMessage', () => {
    it('should return correct message for error code 80002 (BUC throttle)', () => {
      const msg = mapMetaErrorToUserMessage('80002');
      expect(msg).toContain('temporarily pausing data refresh');
      expect(msg).not.toContain('80002');
    });

    it('should return correct message for error code 429', () => {
      const msg = mapMetaErrorToUserMessage('429');
      expect(msg).toContain('spacing out requests');
      expect(msg).not.toContain('429');
    });

    it('should return correct message for error code 190 (token expired)', () => {
      const msg = mapMetaErrorToUserMessage(190);
      expect(msg).toContain('connection needs to be refreshed');
    });

    it('should handle numeric and string error codes equivalently', () => {
      const msgFromString = mapMetaErrorToUserMessage('100');
      const msgFromNumber = mapMetaErrorToUserMessage(100);
      expect(msgFromString).toBe(msgFromNumber);
    });

    // -----------------------------------------------------------------------
    // Test 8: mapMetaErrorToUserMessage for unknown codes
    // -----------------------------------------------------------------------
    it('should return default message for unknown error code', () => {
      const msg = mapMetaErrorToUserMessage('99999');
      expect(msg).toContain('Something went wrong');
    });

    it('should return default message for arbitrary string code', () => {
      const msg = mapMetaErrorToUserMessage('UNKNOWN_ERROR');
      expect(msg).toContain('Something went wrong');
    });

    it('should never return an empty string', () => {
      const msg = mapMetaErrorToUserMessage('');
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 9: Config is frozen (immutable singleton)
  // -------------------------------------------------------------------------
  describe('config immutability', () => {
    it('should export a frozen config object', () => {
      expect(Object.isFrozen(rateLimitConfig)).toBe(true);
    });

    it('should not allow mutation of top-level properties', () => {
      expect(() => {
        (rateLimitConfig as any).bucMultiplier = 0;
      }).toThrow();
    });

    it('should export frozen RATE_LIMIT_DEFAULTS', () => {
      expect(Object.isFrozen(RATE_LIMIT_DEFAULTS)).toBe(true);
    });
  });
});
