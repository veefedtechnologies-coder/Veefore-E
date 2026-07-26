import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeJitterOffset, stableHash } from '../deterministicJitter';

/**
 * Property-Based Tests for Deterministic Jitter
 *
 * Feature: smart-polling-system, Property 11: Deterministic jitter determinism and bounds
 *
 * Verifies the universal properties of `computeJitterOffset`:
 *  - Determinism: identical (accountId, jobType, baseIntervalMs, spreadFraction)
 *    inputs always produce an identical offset, with no persisted state, so the
 *    value is stable across restarts and across worker instances (Req 7.1, 7.3).
 *  - Bounds: the offset always lies within [0, spreadFraction × baseIntervalMs]
 *    for a positive base interval and positive spread fraction (Req 7.2).
 *  - Zero on non-positive base interval: a missing, zero, or negative base
 *    interval yields an offset of 0 (Req 7.6).
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.6**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Account identifiers — arbitrary non-trivial strings, including unicode. */
const accountIdArb = fc.string({ minLength: 1, maxLength: 64 });

/** Job types used for recurring poll jobs. */
const jobTypeArb = fc.constantFrom(
  'story_insights',
  'new_post_detection',
  'views',
  'reach',
  'follower_demographics',
  'business_discovery',
  'online_followers'
);

/** Positive, finite base intervals in ms (1ms .. ~30 days). */
const positiveBaseIntervalArb = fc.integer({ min: 1, max: 30 * 24 * 60 * 60 * 1000 });

/**
 * Spread fraction. The valid configured range is [0.10, 0.25], but the function
 * accepts any positive fraction, so we test a slightly wider positive band.
 */
const spreadFractionArb = fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true });

/** Non-positive / non-finite base intervals that must produce a 0 offset. */
const nonPositiveBaseIntervalArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: -30 * 24 * 60 * 60 * 1000, max: -1 }),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY)
);

const NUM_RUNS = 200;

// ---------------------------------------------------------------------------
// Property 11: Deterministic jitter determinism and bounds
// ---------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 11: Deterministic jitter determinism and bounds', () => {
  it('is deterministic: identical inputs always produce an identical offset (Req 7.1, 7.3)', () => {
    fc.assert(
      fc.property(
        accountIdArb,
        jobTypeArb,
        positiveBaseIntervalArb,
        spreadFractionArb,
        (accountId, jobType, baseIntervalMs, spreadFraction) => {
          const first = computeJitterOffset(accountId, jobType, baseIntervalMs, spreadFraction);
          const second = computeJitterOffset(accountId, jobType, baseIntervalMs, spreadFraction);
          // No persisted state, pure function: repeated calls match exactly.
          expect(second).toBe(first);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('underlying stableHash is deterministic for identical input (Req 7.3)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(stableHash(input)).toBe(stableHash(input));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('offset is always within [0, spreadFraction × baseIntervalMs] for positive inputs (Req 7.2)', () => {
    fc.assert(
      fc.property(
        accountIdArb,
        jobTypeArb,
        positiveBaseIntervalArb,
        spreadFractionArb,
        (accountId, jobType, baseIntervalMs, spreadFraction) => {
          const offset = computeJitterOffset(accountId, jobType, baseIntervalMs, spreadFraction);
          const maxOffsetMs = spreadFraction * baseIntervalMs;
          expect(offset).toBeGreaterThanOrEqual(0);
          expect(offset).toBeLessThanOrEqual(Math.floor(maxOffsetMs));
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('returns 0 when baseIntervalMs is missing, zero, or negative (Req 7.6)', () => {
    fc.assert(
      fc.property(
        accountIdArb,
        jobTypeArb,
        nonPositiveBaseIntervalArb,
        spreadFractionArb,
        (accountId, jobType, baseIntervalMs, spreadFraction) => {
          expect(
            computeJitterOffset(accountId, jobType, baseIntervalMs, spreadFraction)
          ).toBe(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('returns 0 when the spread fraction is non-positive or non-finite (Req 7.2 guard)', () => {
    const badSpreadArb = fc.oneof(
      fc.constant(0),
      fc.double({ min: -1, max: -0.0001, noNaN: true }),
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY)
    );
    fc.assert(
      fc.property(
        accountIdArb,
        jobTypeArb,
        positiveBaseIntervalArb,
        badSpreadArb,
        (accountId, jobType, baseIntervalMs, spreadFraction) => {
          expect(
            computeJitterOffset(accountId, jobType, baseIntervalMs, spreadFraction)
          ).toBe(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
