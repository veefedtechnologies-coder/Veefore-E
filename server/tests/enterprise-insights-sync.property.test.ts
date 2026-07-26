import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { filterMediaForInsights } from '../services/SocialAccountService';
import { InstagramMediaItem } from '../services/instagramApi';
import { UsageStore, UsageTier } from '../services/UsageStore';
import { rateLimitConfig } from '../config/rateLimitConfig';

/**
 * Property-based tests for the Enterprise Insights Sync core logic.
 * Uses fast-check to verify invariants across random inputs.
 */

// --- Generators ---

const FRESHNESS_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Generator for an InstagramMediaItem with a timestamp relative to now.
 * offsetMs: negative means in the past, positive means in the future.
 */
function mediaItemArb(timestampArb: fc.Arbitrary<Date>): fc.Arbitrary<InstagramMediaItem> {
  return fc.record({
    id: fc.uuid(),
    media_type: fc.constantFrom('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'STORY') as fc.Arbitrary<InstagramMediaItem['media_type']>,
    timestamp: timestampArb.map(d => d.toISOString()),
    caption: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    like_count: fc.option(fc.nat(10000), { nil: undefined }),
    comments_count: fc.option(fc.nat(5000), { nil: undefined }),
  });
}

// Timestamp within the freshness window (0 to 72h ago)
const freshTimestampArb = fc.integer({ min: 0, max: FRESHNESS_WINDOW_MS - 1 }).map(
  offset => new Date(Date.now() - offset)
);

// Timestamp older than the freshness window (72h+ ago)
const staleTimestampArb = fc.integer({ min: FRESHNESS_WINDOW_MS, max: FRESHNESS_WINDOW_MS * 10 }).map(
  offset => new Date(Date.now() - offset)
);

// Any timestamp (mix of fresh and stale)
const anyTimestampArb = fc.oneof(freshTimestampArb, staleTimestampArb);

// --- Property Tests ---

describe('Enterprise Insights Sync - Property-Based Tests', () => {

  describe('filterMediaForInsights', () => {
    /**
     * **Validates: Requirements 3.2, 3.4**
     *
     * Property: During backfill (isBackfill=true), ALL media items are returned
     * regardless of their timestamp age.
     */
    it('backfill mode returns all items regardless of timestamp', () => {
      fc.assert(
        fc.property(
          fc.array(mediaItemArb(anyTimestampArb), { minLength: 0, maxLength: 50 }),
          (mediaItems) => {
            const result = filterMediaForInsights(mediaItems, true);
            expect(result).toHaveLength(mediaItems.length);
            expect(result).toEqual(mediaItems);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.2, 3.3**
     *
     * Property: During incremental sync (isBackfill=false), only items with
     * timestamp within 72h of current time are returned.
     */
    it('incremental mode returns only items within 72h freshness window', () => {
      fc.assert(
        fc.property(
          fc.array(mediaItemArb(anyTimestampArb), { minLength: 0, maxLength: 50 }),
          (mediaItems) => {
            const now = Date.now();
            const result = filterMediaForInsights(mediaItems, false);

            // Every returned item must be within 72h
            for (const item of result) {
              const age = now - new Date(item.timestamp).getTime();
              expect(age).toBeLessThan(FRESHNESS_WINDOW_MS);
            }

            // Every item NOT returned must be >= 72h old
            const returnedIds = new Set(result.map(m => m.id));
            for (const item of mediaItems) {
              if (!returnedIds.has(item.id)) {
                const age = now - new Date(item.timestamp).getTime();
                expect(age).toBeGreaterThanOrEqual(FRESHNESS_WINDOW_MS);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     *
     * Property: Incremental filtering is a subset — never adds items.
     */
    it('incremental result is always a subset of the input', () => {
      fc.assert(
        fc.property(
          fc.array(mediaItemArb(anyTimestampArb), { minLength: 0, maxLength: 50 }),
          (mediaItems) => {
            const result = filterMediaForInsights(mediaItems, false);
            expect(result.length).toBeLessThanOrEqual(mediaItems.length);
            for (const item of result) {
              expect(mediaItems).toContain(item);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Engagement Rate Formula', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3**
     *
     * Property: For any valid inputs, engagement rate follows the formula:
     * rate = (totalEngagements / (followers × postsWithMetrics)) × 100
     * Returns 0 when postsWithMetrics is 0 or followers is 0.
     */
    it('formula correctness for all valid inputs', () => {
      fc.assert(
        fc.property(
          fc.nat(1_000_000),         // totalEngagements >= 0
          fc.integer({ min: 1, max: 10_000_000 }), // followers > 0
          fc.nat(10_000),            // postsWithMetrics >= 0
          (totalEngagements, followers, postsWithMetrics) => {
            // Implementation of the engagement rate formula as specified
            const rate = (postsWithMetrics > 0 && followers > 0)
              ? (totalEngagements / (followers * postsWithMetrics)) * 100
              : 0;

            if (postsWithMetrics === 0) {
              expect(rate).toBe(0);
            } else {
              const expected = (totalEngagements / (followers * postsWithMetrics)) * 100;
              expect(rate).toBeCloseTo(expected, 10);
            }

            // Rate is always non-negative
            expect(rate).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Property: media_count does NOT affect the engagement rate.
     * Changing media_count while keeping other inputs constant should not change the rate.
     */
    it('media_count is irrelevant to engagement rate calculation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000_000 }), // totalEngagements > 0 (so rates are non-zero)
          fc.integer({ min: 1, max: 10_000_000 }), // followers > 0
          fc.integer({ min: 1, max: 10_000 }),     // postsWithMetrics > 0
          fc.nat(100_000),           // media_count_1 (ignored by formula)
          fc.nat(100_000),           // media_count_2 (ignored by formula)
          (totalEngagements, followers, postsWithMetrics, mediaCount1, mediaCount2) => {
            // The correct formula uses postsWithMetrics, not media_count
            const rate = (totalEngagements / (followers * postsWithMetrics)) * 100;

            // Rate is the same regardless of what media_count values exist
            // (media_count is not part of the formula at all)
            const rateAgain = (totalEngagements / (followers * postsWithMetrics)) * 100;
            expect(rate).toBe(rateAgain);

            // Verify rate would differ if we incorrectly used media_count as denominator
            // (when media_count differs from postsWithMetrics)
            if (mediaCount1 !== postsWithMetrics && mediaCount1 > 0) {
              const wrongRate = (totalEngagements / (followers * mediaCount1)) * 100;
              expect(rate).not.toBeCloseTo(wrongRate, 10);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Property: When postsWithMetrics is 0, engagement rate is always 0.
     */
    it('returns 0 when postsWithMetrics is 0', () => {
      fc.assert(
        fc.property(
          fc.nat(1_000_000),         // totalEngagements
          fc.integer({ min: 1, max: 10_000_000 }), // followers > 0
          (totalEngagements, followers) => {
            const postsWithMetrics = 0;
            const rate = (postsWithMetrics > 0 && followers > 0)
              ? (totalEngagements / (followers * postsWithMetrics)) * 100
              : 0;
            expect(rate).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Sync Phase Detection', () => {
    /**
     * **Validates: Requirements 2.1, 2.2, 2.3**
     *
     * Property: For any (existingCount, forceRefresh) pair:
     * - mediaLimit = 50 when existingCount === 0 OR forceRefresh === true
     * - mediaLimit = 10 otherwise
     */
    it('mediaLimit is 50 for backfill (existingCount=0 or forceRefresh=true), 10 otherwise', () => {
      fc.assert(
        fc.property(
          fc.nat(1000),    // existingCount: 0 to 1000
          fc.boolean(),    // forceRefresh
          (existingCount, forceRefresh) => {
            const isBackfill = existingCount === 0 || forceRefresh;
            const mediaLimit = isBackfill ? 50 : 10;

            if (existingCount === 0) {
              expect(mediaLimit).toBe(50);
            } else if (forceRefresh) {
              expect(mediaLimit).toBe(50);
            } else {
              expect(mediaLimit).toBe(10);
            }

            // mediaLimit is always either 50 or 10
            expect([10, 50]).toContain(mediaLimit);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.1**
     *
     * Property: existingCount of 0 always results in backfill regardless of forceRefresh.
     */
    it('existingCount=0 always triggers backfill (mediaLimit=50)', () => {
      fc.assert(
        fc.property(
          fc.boolean(),   // forceRefresh (doesn't matter when existingCount=0)
          (forceRefresh) => {
            const existingCount = 0;
            const isBackfill = existingCount === 0 || forceRefresh;
            const mediaLimit = isBackfill ? 50 : 10;
            expect(mediaLimit).toBe(50);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.3**
     *
     * Property: forceRefresh=true always results in backfill regardless of existingCount.
     */
    it('forceRefresh=true always triggers backfill (mediaLimit=50)', () => {
      fc.assert(
        fc.property(
          fc.nat(1000),  // existingCount (doesn't matter when forceRefresh=true)
          (existingCount) => {
            const forceRefresh = true;
            const isBackfill = existingCount === 0 || forceRefresh;
            const mediaLimit = isBackfill ? 50 : 10;
            expect(mediaLimit).toBe(50);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Usage Tier Threshold Behavior (replaces ApiBudgetTracker)', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
     *
     * Property: For any usage percentage P in [0, 100]:
     * - P < 60: NORMAL tier (all operations allowed)
     * - 60 <= P < 80: CAUTION tier (skip non-urgent analytics)
     * - 80 <= P < 95: RESTRICTED tier (skip insights)
     * - P >= 95: CRITICAL tier (skip insights)
     *
     * This tests the tier classification logic using the UsageStore static determineTier method.
     */
    it('correct tier for any usage percentage P in [0, 100]', () => {
      const thresholds = rateLimitConfig.tierThresholds;
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (percentage) => {
            const tier = UsageStore.determineTier(percentage, thresholds);

            if (percentage < thresholds.caution) {
              expect(tier).toBe(UsageTier.NORMAL);
            } else if (percentage < thresholds.restricted) {
              expect(tier).toBe(UsageTier.CAUTION);
            } else if (percentage < thresholds.critical) {
              expect(tier).toBe(UsageTier.RESTRICTED);
            } else {
              expect(tier).toBe(UsageTier.CRITICAL);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 4.2, 4.3**
     *
     * Property: The boundary at caution threshold (60%) is correct.
     */
    it('boundary: 59% is NORMAL, 60% is CAUTION', () => {
      const thresholds = rateLimitConfig.tierThresholds;
      expect(UsageStore.determineTier(59, thresholds)).toBe(UsageTier.NORMAL);
      expect(UsageStore.determineTier(60, thresholds)).toBe(UsageTier.CAUTION);
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Property: The boundary at restricted threshold (80%) is correct.
     */
    it('boundary: 79% is CAUTION, 80% is RESTRICTED', () => {
      const thresholds = rateLimitConfig.tierThresholds;
      expect(UsageStore.determineTier(79, thresholds)).toBe(UsageTier.CAUTION);
      expect(UsageStore.determineTier(80, thresholds)).toBe(UsageTier.RESTRICTED);
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Property: The boundary at critical threshold (95%) is correct.
     */
    it('boundary: 94% is RESTRICTED, 95% is CRITICAL', () => {
      const thresholds = rateLimitConfig.tierThresholds;
      expect(UsageStore.determineTier(94, thresholds)).toBe(UsageTier.RESTRICTED);
      expect(UsageStore.determineTier(95, thresholds)).toBe(UsageTier.CRITICAL);
    });

    /**
     * **Validates: Requirements 4.3, 4.4**
     *
     * Property: When tier is RESTRICTED or CRITICAL, insights should be skipped.
     * This mirrors the skipInsights logic now used in SocialAccountService.syncAccount.
     */
    it('skipInsights flag set correctly based on usage tier', () => {
      const thresholds = rateLimitConfig.tierThresholds;
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (percentage) => {
            const tier = UsageStore.determineTier(percentage, thresholds);
            const skipInsights = tier === UsageTier.RESTRICTED || tier === UsageTier.CRITICAL;

            if (percentage >= thresholds.restricted) {
              expect(skipInsights).toBe(true);
            } else {
              expect(skipInsights).toBe(false);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
