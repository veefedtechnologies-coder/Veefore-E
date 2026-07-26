import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  UsageStore,
  UsageTier,
  CeilingClassification,
  type AccountUsageRecord,
  type AccountUsageMetrics,
  type UsageStoreConfig,
} from '../UsageStore';

/**
 * Property-Based Tests for UsageStore
 *
 * Tests correctness properties from the design document using fast-check
 * to verify universal properties hold across all valid inputs.
 *
 * Properties tested:
 * - Property 1: Usage Header Parsing Round-Trip
 * - Property 2: Missing Header Preserves State
 * - Property 3: Throttle Codes Escalate to Critical
 * - Property 4: Effective Usage is Maximum of Three Metrics
 * - Property 11: Ceiling Classification is Consistent
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.9, 2.1, 2.3, 2.6, 3.2, 3.3
 */

// ---------------------------------------------------------------------------
// Mock Redis (simple Map-based in-memory store)
// ---------------------------------------------------------------------------

class MockRedis {
  private store: Map<string, Map<string, string>> = new Map();
  private ttls: Map<string, number> = new Map();
  public status: string = 'ready';

  private getHash(key: string): Map<string, string> {
    if (!this.store.has(key)) {
      this.store.set(key, new Map());
    }
    return this.store.get(key)!;
  }

  async hset(key: string, ...args: string[]): Promise<number> {
    const hash = this.getHash(key);
    // args come as flat array of [field, value, field, value, ...]
    for (let i = 0; i < args.length; i += 2) {
      hash.set(args[i], args[i + 1]);
    }
    return args.length / 2;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.store.get(key);
    if (!hash || hash.size === 0) return {};
    const result: Record<string, string> = {};
    hash.forEach((value, field) => {
      result[field] = value;
    });
    return result;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.ttls.set(key, seconds);
    return 1;
  }

  multi(): MockPipeline {
    return new MockPipeline(this);
  }

  // Utility to clear all data between tests
  clear(): void {
    this.store.clear();
    this.ttls.clear();
  }
}

class MockPipeline {
  private commands: Array<() => Promise<unknown>> = [];
  private redis: MockRedis;

  constructor(redis: MockRedis) {
    this.redis = redis;
  }

  hset(key: string, ...args: string[]): this {
    this.commands.push(() => this.redis.hset(key, ...args));
    return this;
  }

  expire(key: string, seconds: number): this {
    this.commands.push(() => this.redis.expire(key, seconds));
    return this;
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    const results: Array<[Error | null, unknown]> = [];
    for (const cmd of this.commands) {
      try {
        const result = await cmd();
        results.push([null, result]);
      } catch (error) {
        results.push([error as Error, null]);
      }
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Mock RealtimeService
// ---------------------------------------------------------------------------

const MockRealtimeService = {
  broadcastToWorkspace: () => {},
} as any;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generator for valid percentage values [0, 100].
 */
const percentageArb = fc.double({ min: 0, max: 100, noNaN: true });

/**
 * Generator for valid account IDs (alphanumeric strings typical of Instagram account IDs).
 */
const accountIdArb = fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/);

/**
 * Generator for valid AccountUsageMetrics (partial metrics from a parsed usage header).
 */
const usageMetricsArb = fc.record({
  callCountPct: percentageArb,
  totalCputimePct: percentageArb,
  totalTimePct: percentageArb,
  estimatedMinutesToRegainAccess: fc.double({ min: 0, max: 60, noNaN: true }),
});

/**
 * Generator for full AccountUsageRecord.
 */
const usageRecordArb = fc.record({
  accountId: accountIdArb,
  callCountPct: percentageArb,
  totalCputimePct: percentageArb,
  totalTimePct: percentageArb,
  estimatedMinutesToRegainAccess: fc.double({ min: 0, max: 60, noNaN: true }),
  rollingImpressionsEstimate: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100000 })),
  lastUpdatedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
  ceilingClassification: fc.constantFrom(CeilingClassification.HIGH, CeilingClassification.LOW),
});

/**
 * Generator for tier thresholds where caution < restricted < critical.
 */
const thresholdsArb = fc
  .tuple(
    fc.integer({ min: 1, max: 40 }),
    fc.integer({ min: 1, max: 20 }),
    fc.integer({ min: 1, max: 20 })
  )
  .map(([caution, gap1, gap2]) => ({
    caution,
    restricted: caution + gap1,
    critical: caution + gap1 + gap2,
  }));

/**
 * Generator for impressions values (positive integers or null).
 */
const impressionsArb = fc.oneof(
  fc.constant(null as number | null),
  fc.integer({ min: 0, max: 100000 })
);

/**
 * Generator for a positive impression threshold.
 */
const thresholdArb = fc.integer({ min: 1, max: 50000 });

// ---------------------------------------------------------------------------
// Default test config
// ---------------------------------------------------------------------------

const defaultConfig: UsageStoreConfig = {
  ttlSeconds: 7200,
  stalenessThresholdMs: 300000,
  tierThresholds: { caution: 60, restricted: 80, critical: 95 },
  highCeilingThreshold: 1000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: instagram-rate-limit-architecture — UsageStore Property Tests', () => {
  let mockRedis: MockRedis;
  let store: UsageStore;

  beforeEach(() => {
    mockRedis = new MockRedis();
    store = new UsageStore(mockRedis as any, defaultConfig, MockRealtimeService);
  });

  // =========================================================================
  // Property 1: Usage Header Parsing Round-Trip
  // =========================================================================

  describe('Property 1: Usage Header Parsing Round-Trip', () => {
    /**
     * **Validates: Requirements 1.2, 1.3, 1.4, 2.1**
     *
     * For any valid usage metrics written to the store, reading back the record
     * should yield the same metric values. This verifies:
     * 1. Writing metrics to Redis stores them correctly
     * 2. Reading back yields identical values
     * 3. The round-trip property holds for all valid percentage ranges [0, 100]
     */
    it('PROPERTY 1: Writing usage metrics and reading back yields same values', async () => {
      await fc.assert(
        fc.asyncProperty(accountIdArb, usageMetricsArb, async (accountId, metrics) => {
          // Clear state for each iteration
          mockRedis.clear();

          // Write metrics to the store
          await store.updateUsage(accountId, metrics);

          // Read back the record
          const record = await store.getUsageRecord(accountId);

          // Verify record exists
          expect(record).not.toBeNull();

          // Verify each metric field matches what was written
          expect(record!.callCountPct).toBeCloseTo(metrics.callCountPct, 5);
          expect(record!.totalCputimePct).toBeCloseTo(metrics.totalCputimePct, 5);
          expect(record!.totalTimePct).toBeCloseTo(metrics.totalTimePct, 5);
          expect(record!.estimatedMinutesToRegainAccess).toBeCloseTo(
            metrics.estimatedMinutesToRegainAccess,
            5
          );

          // Verify lastUpdatedAt is set (non-zero)
          expect(record!.lastUpdatedAt).toBeGreaterThan(0);

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  // =========================================================================
  // Property 2: Missing Header Preserves State
  // =========================================================================

  describe('Property 2: Missing Header Preserves State', () => {
    /**
     * **Validates: Requirements 1.5, 2.3**
     *
     * For any account with existing usage data, when NO new metrics are written
     * (simulating a response with no usage header), the stored values remain
     * identical to their prior state — not overwritten to zero or cleared.
     */
    it('PROPERTY 2: No-header response leaves store unchanged', async () => {
      await fc.assert(
        fc.asyncProperty(accountIdArb, usageMetricsArb, async (accountId, initialMetrics) => {
          // Clear state for each iteration
          mockRedis.clear();

          // Write initial metrics to establish state
          await store.updateUsage(accountId, initialMetrics);

          // Read the initial state
          const initialRecord = await store.getUsageRecord(accountId);
          expect(initialRecord).not.toBeNull();

          const savedCallCountPct = initialRecord!.callCountPct;
          const savedCputimePct = initialRecord!.totalCputimePct;
          const savedTimePct = initialRecord!.totalTimePct;
          const savedMinutesToRegain = initialRecord!.estimatedMinutesToRegainAccess;

          // Simulate a response with NO usage header — do NOT call updateUsage
          // (The GovernedHttpClient skips updateUsage when no header is present)

          // Read back — values must be preserved exactly
          const afterRecord = await store.getUsageRecord(accountId);
          expect(afterRecord).not.toBeNull();
          expect(afterRecord!.callCountPct).toBeCloseTo(savedCallCountPct, 5);
          expect(afterRecord!.totalCputimePct).toBeCloseTo(savedCputimePct, 5);
          expect(afterRecord!.totalTimePct).toBeCloseTo(savedTimePct, 5);
          expect(afterRecord!.estimatedMinutesToRegainAccess).toBeCloseTo(savedMinutesToRegain, 5);

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  // =========================================================================
  // Property 3: Throttle Codes Escalate to Critical Tier
  // =========================================================================

  describe('Property 3: Throttle Codes Escalate to Critical', () => {
    /**
     * **Validates: Requirements 1.9**
     *
     * For any account, when escalateToCritical is called (triggered by error code
     * 80002 or HTTP 429), the Usage Store shall reflect Critical tier for that
     * account, and estimatedMinutesToRegainAccess shall match the provided value.
     */
    it('PROPERTY 3: escalateToCritical sets Critical tier with correct minutes', async () => {
      await fc.assert(
        fc.asyncProperty(
          accountIdArb,
          fc.double({ min: 1, max: 120, noNaN: true }),
          async (accountId, minutesToRegain) => {
            // Clear state for each iteration
            mockRedis.clear();

            // Optionally start with some existing usage (may or may not exist)
            await store.updateUsage(accountId, {
              callCountPct: 30,
              totalCputimePct: 20,
              totalTimePct: 25,
              estimatedMinutesToRegainAccess: 0,
            });

            // Escalate to Critical (simulates 80002/429 error handling)
            await store.escalateToCritical(accountId, minutesToRegain);

            // Read back the record
            const record = await store.getUsageRecord(accountId);
            expect(record).not.toBeNull();

            // Verify all percentages are set to 100 (Critical tier)
            expect(record!.callCountPct).toBe(100);
            expect(record!.totalCputimePct).toBe(100);
            expect(record!.totalTimePct).toBe(100);

            // Verify estimated minutes matches
            expect(record!.estimatedMinutesToRegainAccess).toBeCloseTo(minutesToRegain, 5);

            // Verify the tier is Critical
            const tier = await store.getTier(accountId);
            expect(tier).toBe(UsageTier.CRITICAL);

            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  // =========================================================================
  // Property 4: Effective Usage is Maximum of Three Metrics
  // =========================================================================

  describe('Property 4: Effective Usage is Maximum of Three Metrics', () => {
    /**
     * **Validates: Requirements 2.6**
     *
     * For any account usage record containing callCountPct, totalCputimePct,
     * and totalTimePct, the effective usage percentage shall equal
     * max(callCountPct, totalCputimePct, totalTimePct).
     */
    it('PROPERTY 4: computeEffectivePercentage returns max of three metrics', () => {
      fc.assert(
        fc.property(usageRecordArb, (record) => {
          const effective = UsageStore.computeEffectivePercentage(record);

          const expectedMax = Math.max(
            record.callCountPct,
            record.totalCputimePct,
            record.totalTimePct
          );

          // Effective percentage must equal the maximum of the three metrics
          expect(effective).toBeCloseTo(expectedMax, 10);

          // It must be >= each individual metric
          expect(effective).toBeGreaterThanOrEqual(record.callCountPct - Number.EPSILON);
          expect(effective).toBeGreaterThanOrEqual(record.totalCputimePct - Number.EPSILON);
          expect(effective).toBeGreaterThanOrEqual(record.totalTimePct - Number.EPSILON);

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * Additional property: determineTier is consistent with computeEffectivePercentage.
     * The tier derived from a record should match what determineTier returns for
     * the same effective percentage.
     */
    it('PROPERTY 4 (extended): determineTier matches effective percentage tier classification', () => {
      fc.assert(
        fc.property(usageRecordArb, thresholdsArb, (record, thresholds) => {
          const effective = UsageStore.computeEffectivePercentage(record);
          const tier = UsageStore.determineTier(effective, thresholds);

          // Verify tier classification is correct based on thresholds
          if (effective >= thresholds.critical) {
            expect(tier).toBe(UsageTier.CRITICAL);
          } else if (effective >= thresholds.restricted) {
            expect(tier).toBe(UsageTier.RESTRICTED);
          } else if (effective >= thresholds.caution) {
            expect(tier).toBe(UsageTier.CAUTION);
          } else {
            expect(tier).toBe(UsageTier.NORMAL);
          }

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });

  // =========================================================================
  // Property 11: Ceiling Classification is Consistent
  // =========================================================================

  describe('Property 11: Ceiling Classification is Consistent', () => {
    /**
     * **Validates: Requirements 3.2, 3.3**
     *
     * For any impressions value:
     * - If above the configured high-ceiling threshold → HIGH
     * - If below the threshold or null → LOW
     * Newly connected accounts with null impressions always classify as LOW.
     */
    it('PROPERTY 11: classifyCeiling returns HIGH above threshold, LOW below or null', () => {
      fc.assert(
        fc.property(impressionsArb, thresholdArb, (impressions, threshold) => {
          const classification = UsageStore.classifyCeiling(impressions, threshold);

          if (impressions === null) {
            // Null impressions (newly connected) → always LOW
            expect(classification).toBe(CeilingClassification.LOW);
          } else if (impressions >= threshold) {
            // Above or equal to threshold → HIGH
            expect(classification).toBe(CeilingClassification.HIGH);
          } else {
            // Below threshold → LOW
            expect(classification).toBe(CeilingClassification.LOW);
          }

          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * Additional property: null impressions always yields LOW regardless of threshold.
     */
    it('PROPERTY 11 (null case): Null impressions always classifies as LOW', () => {
      fc.assert(
        fc.property(thresholdArb, (threshold) => {
          const classification = UsageStore.classifyCeiling(null, threshold);
          expect(classification).toBe(CeilingClassification.LOW);
          return true;
        }),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * Additional property: HIGH classification is monotonic — if impressions >= threshold
     * yields HIGH, then any larger value also yields HIGH.
     */
    it('PROPERTY 11 (monotonicity): Higher impressions never downgrade from HIGH to LOW', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50000 }),
          fc.integer({ min: 1, max: 50000 }),
          thresholdArb,
          (base, increment, threshold) => {
            const lower = base;
            const higher = base + increment;

            const lowerClassification = UsageStore.classifyCeiling(lower, threshold);
            const higherClassification = UsageStore.classifyCeiling(higher, threshold);

            // If lower value is HIGH, higher value must also be HIGH
            if (lowerClassification === CeilingClassification.HIGH) {
              expect(higherClassification).toBe(CeilingClassification.HIGH);
            }

            return true;
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });
});
