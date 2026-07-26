import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { StoryInsightsScheduler } from '../StoryInsightsScheduler';
import { rateLimitConfig, type RateLimitConfig } from '../../config/rateLimitConfig';

/**
 * Property-Based Tests for Story-Insights Hard-Deadline Handling
 * (smart-polling-system).
 *
 * These tests exercise only the PURE static helpers on
 * `StoryInsightsScheduler` (`computeFinalFetchDelayMs`, `storyExpiryMs`,
 * `canRetryBeforeExpiry`). Importing the module is side-effect free with
 * respect to Redis/BullMQ — the dedicated queue is constructed lazily inside
 * `getStoryInsightsQueue()` only when a story is actually scheduled, never at
 * import time — so no `bullmq` / `../lib/redis` mocking is required here.
 *
 * Property 8: Story final-fetch delay arithmetic
 *   For any publish time and "now", the final-fetch delay equals the exact
 *   arithmetic `(publishTimeMs + storyLifetimeMs − storyFinalFetchLeadMs) − now`,
 *   and the resulting fire instant (`now + delay`) lands exactly
 *   `storyFinalFetchLeadMs` before the 24h expiry.
 *   **Validates: Requirements 5.2**
 *
 * Property 9: Story retry stays before expiry
 *   `canRetryBeforeExpiry` returns true if and only if the next attempt is
 *   scheduled strictly before the story's 24h expiry — a retry at or after
 *   expiry is rejected.
 *   **Validates: Requirements 5.7**
 */

const ITERATIONS = 200;

const config: RateLimitConfig = rateLimitConfig;
const { storyLifetimeMs, storyFinalFetchLeadMs } = config.smartPolling;

// Realistic epoch-millisecond publish times (roughly 2001–2035) so the
// arithmetic exercises large, real-world timestamp magnitudes.
const publishTimeArb = fc.integer({ min: 1_000_000_000_000, max: 2_064_000_000_000 });

// "now" offsets spanning well before publish through past the 24h expiry, so
// generated delays cover both positive (future fire) and negative (overdue)
// cases.
const nowOffsetArb = fc.integer({
  min: -storyLifetimeMs,
  max: storyLifetimeMs * 2,
});

describe('Feature: smart-polling-system, Property 8: Story final-fetch delay arithmetic', () => {
  it('delay equals the exact final-fetch arithmetic for any publish time and now', () => {
    fc.assert(
      fc.property(publishTimeArb, nowOffsetArb, (publishTimeMs, nowOffset) => {
        const now = publishTimeMs + nowOffset;

        const delay = StoryInsightsScheduler.computeFinalFetchDelayMs(publishTimeMs, now, config);

        const expected = publishTimeMs + storyLifetimeMs - storyFinalFetchLeadMs - now;
        expect(delay).toBe(expected);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('the fire instant (now + delay) is exactly storyFinalFetchLeadMs before expiry', () => {
    fc.assert(
      fc.property(publishTimeArb, nowOffsetArb, (publishTimeMs, nowOffset) => {
        const now = publishTimeMs + nowOffset;

        const delay = StoryInsightsScheduler.computeFinalFetchDelayMs(publishTimeMs, now, config);
        const fireInstant = now + delay;

        const expiry = StoryInsightsScheduler.storyExpiryMs(publishTimeMs, config);

        // The final fetch fires exactly the configured lead time before expiry,
        // independent of "now" (Req 5.2).
        expect(expiry - fireInstant).toBe(storyFinalFetchLeadMs);
        expect(fireInstant).toBe(publishTimeMs + storyLifetimeMs - storyFinalFetchLeadMs);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('storyExpiryMs equals publishTime + storyLifetimeMs', () => {
    fc.assert(
      fc.property(publishTimeArb, (publishTimeMs) => {
        expect(StoryInsightsScheduler.storyExpiryMs(publishTimeMs, config)).toBe(
          publishTimeMs + storyLifetimeMs
        );
      }),
      { numRuns: ITERATIONS }
    );
  });
});

describe('Feature: smart-polling-system, Property 9: Story retry stays before expiry', () => {
  it('canRetryBeforeExpiry is true iff the next attempt is strictly before expiry', () => {
    fc.assert(
      fc.property(
        publishTimeArb,
        // Candidate next-attempt instants spanning before and after expiry.
        fc.integer({ min: -storyLifetimeMs, max: storyLifetimeMs * 2 }),
        (publishTimeMs, attemptOffset) => {
          const expiry = StoryInsightsScheduler.storyExpiryMs(publishTimeMs, config);
          const nextAttemptAtMs = expiry + attemptOffset;

          const canRetry = StoryInsightsScheduler.canRetryBeforeExpiry(
            publishTimeMs,
            nextAttemptAtMs,
            config
          );

          expect(canRetry).toBe(nextAttemptAtMs < expiry);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('rejects a retry scheduled exactly at expiry and accepts one strictly before', () => {
    fc.assert(
      fc.property(publishTimeArb, (publishTimeMs) => {
        const expiry = StoryInsightsScheduler.storyExpiryMs(publishTimeMs, config);

        // Exactly at expiry: rejected (Req 5.7 — must complete before expiry).
        expect(
          StoryInsightsScheduler.canRetryBeforeExpiry(publishTimeMs, expiry, config)
        ).toBe(false);

        // Strictly before expiry: accepted.
        expect(
          StoryInsightsScheduler.canRetryBeforeExpiry(publishTimeMs, expiry - 1, config)
        ).toBe(true);

        // After expiry: rejected.
        expect(
          StoryInsightsScheduler.canRetryBeforeExpiry(publishTimeMs, expiry + 1, config)
        ).toBe(false);
      }),
      { numRuns: ITERATIONS }
    );
  });
});
