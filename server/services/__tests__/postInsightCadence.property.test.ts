import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TieredJobScheduler } from '../TieredJobScheduler';
import { CeilingClassification } from '../UsageStore';
import { rateLimitConfig, type RateLimitConfig, type PostAgeBucketConfig } from '../../config/rateLimitConfig';

/**
 * Property-Based Tests for Age-Based Post-Insight Cadence (smart-polling-system).
 *
 * Property 7: Age-bucket interval ordering and ceiling scaling
 *   For any post age and ceiling classification, the post-insight refresh
 *   interval computed by `TieredJobScheduler.computePostInterval`:
 *     (a) is monotonic non-decreasing with post age — an older post never
 *         refreshes more frequently than a younger one (given the config's
 *         strictly-increasing bucket base intervals);
 *     (b) is >= the HIGH-ceiling interval when the account is LOW ceiling
 *         (the LOW scaling factor is >= the HIGH scaling factor);
 *     (c) equals the selected age bucket's base interval multiplied by the
 *         ceiling scaling factor for the classification.
 *   **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

const ITERATIONS = 200;

const config: RateLimitConfig = rateLimitConfig;
const buckets: PostAgeBucketConfig[] = config.smartPolling.postAgeBuckets;
const { HIGH: highFactor, LOW: lowFactor } = config.smartPolling.ceilingScalingFactor;

/**
 * Largest finite bucket boundary, used to bound generated post ages to a
 * realistic range that still exercises every bucket including the final
 * unbounded (>30d) bucket.
 */
const maxFiniteBoundary = buckets
  .map((b) => b.maxAgeMs)
  .filter((ms) => Number.isFinite(ms))
  .reduce((a, b) => Math.max(a, b), 0);

// Generate ages from clock-skew negatives up to well beyond the last finite boundary.
const ageArb = fc.integer({ min: -7 * 24 * 3_600_000, max: Math.round(maxFiniteBoundary * 2) });
const classificationArb = fc.constantFrom(CeilingClassification.HIGH, CeilingClassification.LOW);

describe('Feature: smart-polling-system, Property 7: Age-bucket interval ordering and ceiling scaling', () => {
  it('(a) interval is monotonic non-decreasing as post age increases', () => {
    fc.assert(
      fc.property(ageArb, ageArb, classificationArb, (a, b, classification) => {
        const younger = Math.min(a, b);
        const older = Math.max(a, b);

        const youngerInterval = TieredJobScheduler.computePostInterval(younger, classification, config);
        const olderInterval = TieredJobScheduler.computePostInterval(older, classification, config);

        // Older posts refresh no more frequently than younger posts.
        expect(olderInterval).toBeGreaterThanOrEqual(youngerInterval);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('(b) LOW-ceiling interval is >= HIGH-ceiling interval for the same age', () => {
    // Precondition from config: the LOW scaling factor protects LOW accounts
    // with intervals at least as wide as HIGH accounts.
    expect(lowFactor).toBeGreaterThanOrEqual(highFactor);

    fc.assert(
      fc.property(ageArb, (age) => {
        const highInterval = TieredJobScheduler.computePostInterval(age, CeilingClassification.HIGH, config);
        const lowInterval = TieredJobScheduler.computePostInterval(age, CeilingClassification.LOW, config);

        expect(lowInterval).toBeGreaterThanOrEqual(highInterval);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('(c) interval equals selected bucket base interval × ceiling scaling factor', () => {
    fc.assert(
      fc.property(ageArb, classificationArb, (age, classification) => {
        const bucketIndex = TieredJobScheduler.selectAgeBucket(age, buckets);
        const baseIntervalMs = buckets[bucketIndex].baseIntervalMs;
        const factor = config.smartPolling.ceilingScalingFactor[classification];

        const interval = TieredJobScheduler.computePostInterval(age, classification, config);

        expect(interval).toBe(baseIntervalMs * factor);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('selects ascending bucket indices for ascending ages (bucket ordering)', () => {
    fc.assert(
      fc.property(ageArb, ageArb, (a, b) => {
        const younger = Math.min(a, b);
        const older = Math.max(a, b);

        const youngerBucket = TieredJobScheduler.selectAgeBucket(younger, buckets);
        const olderBucket = TieredJobScheduler.selectAgeBucket(older, buckets);

        // A bucket's base interval is strictly increasing, so a non-decreasing
        // bucket index guarantees the monotonic-interval property (a).
        expect(olderBucket).toBeGreaterThanOrEqual(youngerBucket);
      }),
      { numRuns: ITERATIONS }
    );
  });
});
