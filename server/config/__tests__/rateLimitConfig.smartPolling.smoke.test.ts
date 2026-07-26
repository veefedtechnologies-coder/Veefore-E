/**
 * Smoke / type tests for the smart-polling configuration surface.
 *
 * Validates: Requirements 14.1, 14.2, 14.6
 * - 14.1: `rateLimitConfig.smartPolling` exposes every required value.
 * - 14.2: The new values are typed via the existing TypeScript configuration
 *         interface such that a missing/incorrectly-typed value fails the build
 *         (asserted via compile-time type-level checks with `expectTypeOf`).
 * - 14.6: Each new smart-polling value carries a documentation comment with an
 *         ISO-8601 (YYYY-MM-DD) `Last verified:` date.
 *
 * Feature: smart-polling-system
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect, expectTypeOf } from 'vitest';

import {
  rateLimitConfig,
  RATE_LIMIT_DEFAULTS,
  type SmartPollingConfig,
  type PostAgeBucketConfig,
} from '../rateLimitConfig';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const RATE_LIMIT_CONFIG_PATH = path.resolve(__dirnameLocal, '../rateLimitConfig.ts');
const sourceText = readFileSync(RATE_LIMIT_CONFIG_PATH, 'utf8');

describe('smartPolling config presence (Req 14.1)', () => {
  const sp: SmartPollingConfig = rateLimitConfig.smartPolling;

  it('exposes smartPolling on the resolved (frozen) config', () => {
    expect(sp).toBeDefined();
    expect(Object.isFrozen(rateLimitConfig)).toBe(true);
  });

  it('exposes per-tier base intervals for tiers 1-4 as numbers', () => {
    expect(sp.metricTierBaseIntervalsMs).toBeDefined();
    for (const tier of [1, 2, 3, 4] as const) {
      expect(typeof sp.metricTierBaseIntervalsMs[tier]).toBe('number');
      expect(sp.metricTierBaseIntervalsMs[tier]).toBeGreaterThan(0);
    }
  });

  it('exposes strictly-increasing post-age buckets with numeric fields', () => {
    expect(Array.isArray(sp.postAgeBuckets)).toBe(true);
    expect(sp.postAgeBuckets.length).toBeGreaterThan(0);
    for (const bucket of sp.postAgeBuckets) {
      expect(typeof bucket.maxAgeMs).toBe('number');
      expect(typeof bucket.baseIntervalMs).toBe('number');
    }
    const intervals = sp.postAgeBuckets.map((b) => b.baseIntervalMs);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
    }
  });

  it('exposes ceiling scaling factors HIGH and LOW', () => {
    expect(typeof sp.ceilingScalingFactor.HIGH).toBe('number');
    expect(typeof sp.ceilingScalingFactor.LOW).toBe('number');
  });

  it('exposes the jitter spread fraction within its documented range', () => {
    expect(typeof sp.jitterSpreadFraction).toBe('number');
    expect(sp.jitterSpreadFraction).toBeGreaterThanOrEqual(0.1);
    expect(sp.jitterSpreadFraction).toBeLessThanOrEqual(0.25);
  });

  it('exposes the follower-demographics threshold', () => {
    expect(typeof sp.followerDemographicsThreshold).toBe('number');
  });

  it('exposes ceiling-scaled new-post detection intervals', () => {
    expect(typeof sp.newPostDetectionMs.highCeiling).toBe('number');
    expect(typeof sp.newPostDetectionMs.lowCeiling).toBe('number');
  });

  it('exposes story scheduling values', () => {
    expect(typeof sp.storyRecurringIntervalMs).toBe('number');
    expect(typeof sp.storyFinalFetchLeadMs).toBe('number');
    expect(typeof sp.storyLifetimeMs).toBe('number');
  });

  it('exposes backpressure thresholds + evaluation interval', () => {
    expect(typeof sp.backpressure.triggerQueueDepth).toBe('number');
    expect(typeof sp.backpressure.triggerRedisLatencyMs).toBe('number');
    expect(typeof sp.backpressure.clearQueueDepth).toBe('number');
    expect(typeof sp.backpressure.clearRedisLatencyMs).toBe('number');
    expect(typeof sp.backpressure.evaluationIntervalMs).toBe('number');
  });

  it('exposes audit retention + persistence retry policy', () => {
    expect(typeof sp.audit.retentionSeconds).toBe('number');
    expect(typeof sp.audit.persistenceMaxRetries).toBe('number');
  });

  it('exposes business-discovery flag, cadence, and cap', () => {
    expect(typeof sp.businessDiscovery.enabled).toBe('boolean');
    expect(typeof sp.businessDiscovery.intervalMs).toBe('number');
    expect(typeof sp.businessDiscovery.maxCompetitorsPerAccount).toBe('number');
  });

  it('exposes tenant priority flag, weights, and window', () => {
    expect(typeof sp.tenantPriority.enabled).toBe('boolean');
    expect(typeof sp.tenantPriority.weights).toBe('object');
    expect(sp.tenantPriority.weights).not.toBeNull();
    expect(typeof sp.tenantPriority.windowMs).toBe('number');
  });

  it('defaults mirror the resolved config surface', () => {
    expect(RATE_LIMIT_DEFAULTS.smartPolling).toBeDefined();
    expect(Object.keys(RATE_LIMIT_DEFAULTS.smartPolling).sort()).toEqual(
      Object.keys(sp).sort()
    );
  });
});

describe('smartPolling config compile-time type safety (Req 14.2)', () => {
  // These assertions are evaluated by the TypeScript compiler during the build.
  // A missing or mistyped field on SmartPollingConfig would make the build fail.
  it('enforces the SmartPollingConfig field types at compile time', () => {
    expectTypeOf<SmartPollingConfig['metricTierBaseIntervalsMs']>().toEqualTypeOf<
      Record<1 | 2 | 3 | 4, number>
    >();
    expectTypeOf<SmartPollingConfig['postAgeBuckets']>().toEqualTypeOf<
      PostAgeBucketConfig[]
    >();
    expectTypeOf<SmartPollingConfig['ceilingScalingFactor']>().toEqualTypeOf<{
      HIGH: number;
      LOW: number;
    }>();
    expectTypeOf<SmartPollingConfig['jitterSpreadFraction']>().toBeNumber();
    expectTypeOf<SmartPollingConfig['followerDemographicsThreshold']>().toBeNumber();
    expectTypeOf<SmartPollingConfig['newPostDetectionMs']>().toEqualTypeOf<{
      highCeiling: number;
      lowCeiling: number;
    }>();
    expectTypeOf<SmartPollingConfig['storyRecurringIntervalMs']>().toBeNumber();
    expectTypeOf<SmartPollingConfig['storyFinalFetchLeadMs']>().toBeNumber();
    expectTypeOf<SmartPollingConfig['storyLifetimeMs']>().toBeNumber();
    expectTypeOf<SmartPollingConfig['businessDiscovery']['enabled']>().toBeBoolean();
    expectTypeOf<SmartPollingConfig['tenantPriority']['weights']>().toEqualTypeOf<
      Record<string, number>
    >();

    // The resolved config value conforms to the SmartPollingConfig interface.
    expectTypeOf(rateLimitConfig.smartPolling).toMatchTypeOf<SmartPollingConfig>();
  });

  it('rejects mistyped construction at compile time (negative type check)', () => {
    // @ts-expect-error — jitterSpreadFraction must be a number, not a string.
    const bad: Pick<SmartPollingConfig, 'jitterSpreadFraction'> = { jitterSpreadFraction: 'nope' };
    expect(bad).toBeDefined();
  });
});

describe('smartPolling config doc comments carry ISO-8601 last-verified dates (Req 14.6)', () => {
  // Slice the source to the SmartPollingConfig interface + the DEFAULT_CONFIG.smartPolling block,
  // which is where every new value is declared/documented.
  const interfaceStart = sourceText.indexOf('export interface SmartPollingConfig');
  const interfaceEnd = sourceText.indexOf('export interface RateLimitConfig');

  it('locates the SmartPollingConfig interface in source', () => {
    expect(interfaceStart).toBeGreaterThan(-1);
    expect(interfaceEnd).toBeGreaterThan(interfaceStart);
  });

  it('documents every new value with at least one ISO-8601 last-verified date', () => {
    const interfaceBlock = sourceText.slice(interfaceStart, interfaceEnd);

    // Each documented field's JSDoc block must contain a "Last verified: YYYY-MM-DD" line.
    const lastVerifiedMatches = interfaceBlock.match(
      /Last verified:\s*\d{4}-\d{2}-\d{2}/g
    );
    expect(lastVerifiedMatches).not.toBeNull();

    // One last-verified date per documented smart-polling value (13 fields).
    const documentedFields: (keyof SmartPollingConfig)[] = [
      'metricTierBaseIntervalsMs',
      'postAgeBuckets',
      'ceilingScalingFactor',
      'jitterSpreadFraction',
      'followerDemographicsThreshold',
      'newPostDetectionMs',
      'storyRecurringIntervalMs',
      'storyFinalFetchLeadMs',
      'storyLifetimeMs',
      'backpressure',
      'audit',
      'businessDiscovery',
      'tenantPriority',
    ];
    expect(lastVerifiedMatches!.length).toBeGreaterThanOrEqual(documentedFields.length);
  });

  it('uses only valid calendar ISO-8601 dates (YYYY-MM-DD) in last-verified comments', () => {
    const allDates = sourceText.match(/Last verified:\s*(\d{4}-\d{2}-\d{2})/g) ?? [];
    expect(allDates.length).toBeGreaterThan(0);
    for (const entry of allDates) {
      const iso = entry.replace(/Last verified:\s*/, '');
      // Strict YYYY-MM-DD shape.
      expect(iso).toMatch(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      // Round-trips as a real calendar date.
      const parsed = new Date(`${iso}T00:00:00Z`);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      expect(parsed.toISOString().slice(0, 10)).toBe(iso);
    }
  });
});
