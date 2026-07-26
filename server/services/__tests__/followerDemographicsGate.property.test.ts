import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TieredJobScheduler } from '../TieredJobScheduler';
import { rateLimitConfig, type RateLimitConfig } from '../../config/rateLimitConfig';

/**
 * Property-Based Tests for the Follower-Demographics Threshold Gate
 * (smart-polling-system).
 *
 * Property 10: Follower-demographics threshold gate
 *   For any most-recent follower count and threshold, the pure gate
 *   `TieredJobScheduler.demographicsGateOpen(lastFollowerCount, threshold)`:
 *     (a) is open if and only if lastFollowerCount >= threshold — counts
 *         strictly below the threshold close the gate, counts at or above
 *         the threshold open it (Req 6.1, 6.5);
 *     (b) re-enables (closed -> open) on an upward crossing: a count below
 *         the threshold yields a closed gate, and the same account whose
 *         count later rises to at/above the threshold yields an open gate
 *         (Req 6.7).
 *   **Validates: Requirements 6.1, 6.5, 6.7**
 */

const ITERATIONS = 200;

const config: RateLimitConfig = rateLimitConfig;
const configuredThreshold = config.smartPolling.followerDemographicsThreshold;

// A realistic follower-count range that brackets the configured threshold so
// generated values fall both below and at/above it.
const followerCountArb = fc.integer({ min: 0, max: 1_000_000 });

// Arbitrary non-negative thresholds, plus the configured threshold (100) is
// asserted explicitly below.
const thresholdArb = fc.integer({ min: 0, max: 1_000_000 });

describe('Feature: smart-polling-system, Property 10: Follower-demographics threshold gate', () => {
  it('(a) gate is open iff lastFollowerCount >= threshold (arbitrary thresholds)', () => {
    fc.assert(
      fc.property(followerCountArb, thresholdArb, (count, threshold) => {
        const open = TieredJobScheduler.demographicsGateOpen(count, threshold);
        expect(open).toBe(count >= threshold);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('(a) gate is open iff lastFollowerCount >= configured threshold (Req 6.5)', () => {
    // Sanity check the configured value is the documented default contract.
    expect(typeof configuredThreshold).toBe('number');
    expect(configuredThreshold).toBeGreaterThanOrEqual(0);

    fc.assert(
      fc.property(followerCountArb, (count) => {
        const open = TieredJobScheduler.demographicsGateOpen(count, configuredThreshold);
        expect(open).toBe(count >= configuredThreshold);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('(a) below threshold => closed; at/above threshold => open', () => {
    fc.assert(
      fc.property(thresholdArb, (threshold) => {
        // Strictly below the threshold: gate closed (Req 6.1).
        if (threshold > 0) {
          expect(TieredJobScheduler.demographicsGateOpen(threshold - 1, threshold)).toBe(false);
        }
        // Exactly at the threshold: gate open (Req 6.5).
        expect(TieredJobScheduler.demographicsGateOpen(threshold, threshold)).toBe(true);
        // Above the threshold: gate open.
        expect(TieredJobScheduler.demographicsGateOpen(threshold + 1, threshold)).toBe(true);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('(b) upward crossing re-enables the gate (closed -> open transition, Req 6.7)', () => {
    fc.assert(
      fc.property(
        thresholdArb,
        // Pick a "before" count strictly below the threshold and an "after"
        // count at or above it, modelling an upward threshold crossing.
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (threshold, belowOffset, aboveOffset) => {
          // Constrain the threshold so a "below" value exists.
          fc.pre(threshold > 0);

          const beforeCount = Math.max(0, threshold - 1 - (belowOffset % threshold));
          const afterCount = threshold + (aboveOffset % 1000);

          // Before the crossing the gate must be closed.
          expect(TieredJobScheduler.demographicsGateOpen(beforeCount, threshold)).toBe(false);
          // After rising to at/above the threshold the gate re-opens.
          expect(TieredJobScheduler.demographicsGateOpen(afterCount, threshold)).toBe(true);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });
});
