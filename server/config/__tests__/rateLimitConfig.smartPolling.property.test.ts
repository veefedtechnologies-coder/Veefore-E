/**
 * Property-Based Tests for Smart-Polling Config Range Validation
 *
 * Property 22: Invalid config overrides retain the last valid value
 *
 * For any environment override that is missing, unparseable, or outside its
 * allowed range (e.g. jitter spread outside [0.10, 0.25], or a clear threshold
 * not strictly below its trigger), buildRateLimitConfig rejects the override,
 * retains the prior valid (default) value, and reports the failing key (it is
 * absent from overriddenKeys). Valid in-range overrides DO change the config.
 *
 * **Validates: Requirements 14.5**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the logger to avoid the env-validation chain and silence warnings.
vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { buildRateLimitConfig, RATE_LIMIT_DEFAULTS } from '../rateLimitConfig';

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads a nested numeric value from config given a dotted path. */
function getNested(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    current = (current as Record<string, unknown>)[String(key)];
  }
  return current;
}

const defaults = RATE_LIMIT_DEFAULTS;

describe('Feature: smart-polling-system, Property 22: Invalid config overrides retain the last valid value', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // 22.1: Unparseable numeric overrides are rejected; default retained.
  // -------------------------------------------------------------------------
  describe('22.1: unparseable numeric overrides retain the default value', () => {
    // A sample of representative numeric smart-polling override keys and their
    // config paths.
    const numericKeys: { envKey: string; path: (string | number)[] }[] = [
      { envKey: 'SP_TIER1_BASE_INTERVAL_MS', path: ['smartPolling', 'metricTierBaseIntervalsMs', 1] },
      { envKey: 'SP_JITTER_SPREAD_FRACTION', path: ['smartPolling', 'jitterSpreadFraction'] },
      { envKey: 'SP_FOLLOWER_DEMOGRAPHICS_THRESHOLD', path: ['smartPolling', 'followerDemographicsThreshold'] },
      { envKey: 'SP_STORY_RECURRING_MS', path: ['smartPolling', 'storyRecurringIntervalMs'] },
      { envKey: 'SP_AUDIT_RETENTION_SECONDS', path: ['smartPolling', 'audit', 'retentionSeconds'] },
    ];

    it('non-numeric strings never change the config and never report the key', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...numericKeys),
          // Strings that parse to NaN via Number(): non-numeric tokens.
          fc.string({ minLength: 1, maxLength: 12 }).filter((s) => isNaN(Number(s)) && s.trim() !== ''),
          ({ envKey, path }, garbage) => {
            process.env[envKey] = garbage;

            const { config, overriddenKeys } = buildRateLimitConfig();

            expect(getNested(config, path)).toBe(getNested(defaults, path));
            expect(overriddenKeys).not.toContain(envKey);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 22.2: Out-of-range jitter spread is rejected; in-range is applied.
  // -------------------------------------------------------------------------
  describe('22.2: jitter spread fraction range [0.10, 0.25]', () => {
    const path = ['smartPolling', 'jitterSpreadFraction'];

    it('values outside [0.10, 0.25] retain the default and are not reported', () => {
      fc.assert(
        fc.property(
          fc
            .double({ min: -10, max: 10, noNaN: true })
            .filter((v) => v < 0.1 || v > 0.25),
          (value) => {
            process.env.SP_JITTER_SPREAD_FRACTION = String(value);

            const { config, overriddenKeys } = buildRateLimitConfig();

            expect(getNested(config, path)).toBe(defaults.smartPolling.jitterSpreadFraction);
            expect(overriddenKeys).not.toContain('SP_JITTER_SPREAD_FRACTION');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('values inside [0.10, 0.25] are applied and reported', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.1, max: 0.25, noNaN: true }),
          (value) => {
            process.env.SP_JITTER_SPREAD_FRACTION = String(value);

            const { config, overriddenKeys } = buildRateLimitConfig();

            expect(config.smartPolling.jitterSpreadFraction).toBe(value);
            expect(overriddenKeys).toContain('SP_JITTER_SPREAD_FRACTION');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 22.3: Negative values for min:0 bounded keys are rejected.
  // -------------------------------------------------------------------------
  describe('22.3: numeric overrides below their minimum bound retain the default', () => {
    const minZeroKeys: { envKey: string; path: (string | number)[] }[] = [
      { envKey: 'SP_TIER1_BASE_INTERVAL_MS', path: ['smartPolling', 'metricTierBaseIntervalsMs', 1] },
      { envKey: 'SP_STORY_RECURRING_MS', path: ['smartPolling', 'storyRecurringIntervalMs'] },
      { envKey: 'SP_FOLLOWER_DEMOGRAPHICS_THRESHOLD', path: ['smartPolling', 'followerDemographicsThreshold'] },
      { envKey: 'SP_BP_EVALUATION_INTERVAL_MS', path: ['smartPolling', 'backpressure', 'evaluationIntervalMs'] },
    ];

    it('negative values are rejected and the key is not reported', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...minZeroKeys),
          fc.double({ min: -1_000_000, max: -0.0001, noNaN: true }),
          ({ envKey, path }, negative) => {
            process.env[envKey] = String(negative);

            const { config, overriddenKeys } = buildRateLimitConfig();

            expect(getNested(config, path)).toBe(getNested(defaults, path));
            expect(overriddenKeys).not.toContain(envKey);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 22.4: Backpressure cross-field hysteresis (clear must be < trigger).
  // -------------------------------------------------------------------------
  describe('22.4: backpressure clear threshold must be strictly below trigger', () => {
    it('clear >= trigger reverts the clear threshold to its default', () => {
      fc.assert(
        fc.property(
          // Pick a trigger and a clear value where clear >= trigger.
          fc.integer({ min: 1, max: 5000 }),
          fc.integer({ min: 0, max: 5000 }),
          (trigger, extra) => {
            const clear = trigger + extra; // clear >= trigger always

            process.env.SP_BP_TRIGGER_QUEUE_DEPTH = String(trigger);
            process.env.SP_BP_CLEAR_QUEUE_DEPTH = String(clear);

            const { config, overriddenKeys } = buildRateLimitConfig();

            // Trigger override is valid and applied.
            expect(config.smartPolling.backpressure.triggerQueueDepth).toBe(trigger);
            // Clear violates hysteresis -> reverted to default, not reported.
            expect(config.smartPolling.backpressure.clearQueueDepth).toBe(
              defaults.smartPolling.backpressure.clearQueueDepth
            );
            expect(overriddenKeys).not.toContain('SP_BP_CLEAR_QUEUE_DEPTH');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('clear strictly below trigger is accepted and applied', () => {
      fc.assert(
        fc.property(
          // trigger high enough to leave room for a strictly-smaller clear.
          fc.integer({ min: 2, max: 10000 }),
          (trigger) => {
            const clear = trigger - 1; // strictly below

            process.env.SP_BP_TRIGGER_QUEUE_DEPTH = String(trigger);
            process.env.SP_BP_CLEAR_QUEUE_DEPTH = String(clear);

            const { config, overriddenKeys } = buildRateLimitConfig();

            expect(config.smartPolling.backpressure.triggerQueueDepth).toBe(trigger);
            expect(config.smartPolling.backpressure.clearQueueDepth).toBe(clear);
            expect(overriddenKeys).toContain('SP_BP_CLEAR_QUEUE_DEPTH');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 22.5: Unparseable boolean flags retain the default.
  // -------------------------------------------------------------------------
  describe('22.5: unparseable boolean feature flags retain the default value', () => {
    it('unrecognized boolean strings never change businessDiscovery.enabled', () => {
      fc.assert(
        fc.property(
          // Strings not in the accepted true/false token set.
          fc
            .string({ minLength: 1, maxLength: 10 })
            .filter((s) => {
              const n = s.trim().toLowerCase();
              const accepted = ['true', '1', 'yes', 'on', 'false', '0', 'no', 'off'];
              return n !== '' && !accepted.includes(n);
            }),
          (garbage) => {
            process.env.SP_BUSINESS_DISCOVERY_ENABLED = garbage;

            const { config, overriddenKeys } = buildRateLimitConfig();

            expect(config.smartPolling.businessDiscovery.enabled).toBe(
              defaults.smartPolling.businessDiscovery.enabled
            );
            expect(overriddenKeys).not.toContain('SP_BUSINESS_DISCOVERY_ENABLED');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 22.6: A missing override always retains the default.
  // -------------------------------------------------------------------------
  describe('22.6: missing overrides retain the default value', () => {
    it('with no smart-polling env vars set, smartPolling equals defaults', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          // Strip any SP_* keys to guarantee "missing".
          for (const key of Object.keys(process.env)) {
            if (key.startsWith('SP_')) {
              delete process.env[key];
            }
          }

          const { config } = buildRateLimitConfig();

          expect(config.smartPolling).toEqual(defaults.smartPolling);
        }),
        { numRuns: 10 }
      );
    });
  });
});
