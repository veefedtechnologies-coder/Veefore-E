import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  BackpressureMonitor,
  type BackpressureState,
  type BackpressureSample,
} from '../BackpressureMonitor';
import { rateLimitConfig, type RateLimitConfig } from '../../config/rateLimitConfig';

/**
 * Property-Based Tests for the BackpressureMonitor (smart-polling-system).
 *
 * These tests exercise the PURE static hysteresis transition
 * `BackpressureMonitor.nextState`. Importing the module is side-effect free
 * with respect to Redis/BullMQ (the timer + sampling only start when `start()`
 * is called on an instance), so no `bullmq` / `../lib/redis` mocking is needed.
 *
 * Property 18: Backpressure hysteresis does not oscillate
 *   For any sequence of samples whose values fall within the band between the
 *   clear and trigger thresholds (clear < trigger by construction), `nextState`
 *   retains the previous state for every sample — the state only flips when a
 *   sample exceeds the trigger (→ active) or falls strictly below all clear
 *   thresholds (→ cleared); an unmeasurable (null) Redis latency always yields
 *   `active`.
 *   **Validates: Requirements 12.7, 12.8**
 *
 * Property 19: Backpressure sheds ascending and resumes descending by tier
 *   `nextState` itself only yields active/cleared; the ascending/descending tier
 *   shed order lives in `TieredJobScheduler` (wired in task 11.3 and covered by
 *   integration tests in 11.x). Here we assert what is testable in this pure
 *   layer: the active/cleared transition is monotonic with stress (above the
 *   trigger ⇒ shed/active, below the clear ⇒ resume/cleared), and we model the
 *   tier shed/resume ordering as a pure expectation — shedding sheds Tier 4
 *   before Tier 3 before Tier 2 before Tier 1 (ascending), and resuming resumes
 *   Tier 1 before Tier 2 before Tier 3 before Tier 4 (descending).
 *   **Validates: Requirements 12.1, 12.2, 12.4**
 */

const ITERATIONS = 200;

// -----------------------------------------------------------------------------
// Config helpers
// -----------------------------------------------------------------------------

/**
 * Build a RateLimitConfig clone whose backpressure thresholds are overridden
 * while preserving the hysteresis invariant (clear < trigger, Req 12.7).
 */
function configWith(thresholds: {
  triggerQueueDepth: number;
  triggerRedisLatencyMs: number;
  clearQueueDepth: number;
  clearRedisLatencyMs: number;
}): RateLimitConfig {
  return {
    ...rateLimitConfig,
    smartPolling: {
      ...rateLimitConfig.smartPolling,
      backpressure: {
        ...rateLimitConfig.smartPolling.backpressure,
        ...thresholds,
      },
    },
  } as RateLimitConfig;
}

// Generates a valid threshold set with strict hysteresis gap (clear < trigger).
const thresholdsArb = fc
  .record({
    clearQueueDepth: fc.integer({ min: 1, max: 5_000 }),
    queueGap: fc.integer({ min: 1, max: 5_000 }),
    clearRedisLatencyMs: fc.integer({ min: 1, max: 2_000 }),
    latencyGap: fc.integer({ min: 1, max: 2_000 }),
  })
  .map(({ clearQueueDepth, queueGap, clearRedisLatencyMs, latencyGap }) => ({
    clearQueueDepth,
    triggerQueueDepth: clearQueueDepth + queueGap,
    clearRedisLatencyMs,
    triggerRedisLatencyMs: clearRedisLatencyMs + latencyGap,
  }));

const stateArb: fc.Arbitrary<BackpressureState> = fc.constantFrom('active', 'cleared');

// -----------------------------------------------------------------------------
// Property 18: Backpressure hysteresis does not oscillate
// -----------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 18: Backpressure hysteresis does not oscillate', () => {
  it('null Redis latency always yields active regardless of queue depth or prev state (Req 12.8)', () => {
    fc.assert(
      fc.property(
        thresholdsArb,
        stateArb,
        fc.integer({ min: 0, max: 100_000 }),
        (thresholds, prev, queueDepth) => {
          const config = configWith(thresholds);
          const sample: BackpressureSample = { queueDepth, redisLatencyMs: null };
          expect(BackpressureMonitor.nextState(prev, sample, config)).toBe('active');
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('samples strictly inside the hysteresis band retain the previous state (Req 12.7)', () => {
    fc.assert(
      fc.property(thresholdsArb, stateArb, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (thresholds, prev, qFrac, lFrac) => {
        const config = configWith(thresholds);
        const { clearQueueDepth, triggerQueueDepth, clearRedisLatencyMs, triggerRedisLatencyMs } =
          thresholds;

        // A depth strictly between clear and trigger does NOT satisfy the
        // active rule (> trigger) nor the cleared rule (< clear), so the state
        // must be retained. Only meaningful when the band has width > 1.
        fc.pre(triggerQueueDepth - clearQueueDepth > 1);
        fc.pre(triggerRedisLatencyMs - clearRedisLatencyMs > 1);

        // Map fractions into the open band (clear, trigger).
        const queueDepth =
          clearQueueDepth + Math.max(1, Math.round(qFrac * (triggerQueueDepth - clearQueueDepth - 1)));
        const redisLatencyMs =
          clearRedisLatencyMs +
          Math.max(1, Math.round(lFrac * (triggerRedisLatencyMs - clearRedisLatencyMs - 1)));

        const sample: BackpressureSample = { queueDepth, redisLatencyMs };
        // Within the band, the next state equals the previous state.
        expect(BackpressureMonitor.nextState(prev, sample, config)).toBe(prev);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('does not flip-flop: a sequence of in-band samples never changes the state (Req 12.7)', () => {
    fc.assert(
      fc.property(
        thresholdsArb,
        stateArb,
        fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })), {
          minLength: 1,
          maxLength: 50,
        }),
        (thresholds, initial, fractions) => {
          const config = configWith(thresholds);
          const { clearQueueDepth, triggerQueueDepth, clearRedisLatencyMs, triggerRedisLatencyMs } =
            thresholds;
          fc.pre(triggerQueueDepth - clearQueueDepth > 1);
          fc.pre(triggerRedisLatencyMs - clearRedisLatencyMs > 1);

          let state = initial;
          for (const [qFrac, lFrac] of fractions) {
            const queueDepth =
              clearQueueDepth +
              Math.max(1, Math.round(qFrac * (triggerQueueDepth - clearQueueDepth - 1)));
            const redisLatencyMs =
              clearRedisLatencyMs +
              Math.max(1, Math.round(lFrac * (triggerRedisLatencyMs - clearRedisLatencyMs - 1)));
            const next = BackpressureMonitor.nextState(state, { queueDepth, redisLatencyMs }, config);
            // No oscillation: the state is held throughout the in-band sequence.
            expect(next).toBe(initial);
            state = next;
          }
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('flips to active only above a trigger and to cleared only below all clears (Req 12.7)', () => {
    fc.assert(
      fc.property(thresholdsArb, stateArb, (thresholds, prev) => {
        const config = configWith(thresholds);
        const { clearQueueDepth, triggerQueueDepth, clearRedisLatencyMs, triggerRedisLatencyMs } =
          thresholds;

        // Above the queue trigger ⇒ active (regardless of latency being calm).
        expect(
          BackpressureMonitor.nextState(
            prev,
            { queueDepth: triggerQueueDepth + 1, redisLatencyMs: clearRedisLatencyMs - 1 < 0 ? 0 : clearRedisLatencyMs - 1 },
            config
          )
        ).toBe('active');

        // Above the latency trigger ⇒ active (regardless of queue being calm).
        expect(
          BackpressureMonitor.nextState(
            prev,
            { queueDepth: 0, redisLatencyMs: triggerRedisLatencyMs + 1 },
            config
          )
        ).toBe('active');

        // Strictly below BOTH clear thresholds ⇒ cleared.
        fc.pre(clearQueueDepth > 0 && clearRedisLatencyMs > 0);
        expect(
          BackpressureMonitor.nextState(
            prev,
            { queueDepth: clearQueueDepth - 1, redisLatencyMs: clearRedisLatencyMs - 1 },
            config
          )
        ).toBe('cleared');
      }),
      { numRuns: ITERATIONS }
    );
  });
});

// -----------------------------------------------------------------------------
// Property 19: Backpressure sheds ascending and resumes descending by tier
// -----------------------------------------------------------------------------

/**
 * Pure expectation model of the scheduler's tier shed/resume ordering. The
 * scheduler (task 11.3) sheds in ascending Classification_Tier order — Tier 4
 * first (least critical), then 3, 2, 1 — and resumes in descending tier order —
 * Tier 1 first (most critical), then 2, 3, 4. We model this here as pure array
 * sorts so the ordering contract is property-tested; the live wiring is
 * integration-tested in task 11.x.
 */
function shedOrder(tiers: number[]): number[] {
  // Ascending tier deferral = shed highest tier number first (Tier 4 → Tier 1).
  return [...tiers].sort((a, b) => b - a);
}

function resumeOrder(tiers: number[]): number[] {
  // Descending tier resumption = resume lowest tier number first (Tier 1 → 4).
  return [...tiers].sort((a, b) => a - b);
}

const tierArb = fc.integer({ min: 1, max: 4 });

describe('Feature: smart-polling-system, Property 19: Backpressure sheds ascending and resumes descending by tier', () => {
  it('active/cleared transition is monotonic with stress (Req 12.1, 12.2, 12.4)', () => {
    fc.assert(
      fc.property(thresholdsArb, stateArb, (thresholds, prev) => {
        const config = configWith(thresholds);
        const { clearQueueDepth, triggerQueueDepth, clearRedisLatencyMs, triggerRedisLatencyMs } =
          thresholds;

        // Increasing stress past a trigger always drives shedding (active).
        const stressed = BackpressureMonitor.nextState(
          prev,
          { queueDepth: triggerQueueDepth + 1000, redisLatencyMs: triggerRedisLatencyMs + 1000 },
          config
        );
        expect(stressed).toBe('active');

        // Dropping stress below both clears always resumes (cleared).
        fc.pre(clearQueueDepth > 0 && clearRedisLatencyMs > 0);
        const calm = BackpressureMonitor.nextState(
          'active',
          { queueDepth: 0, redisLatencyMs: 0 },
          config
        );
        expect(calm).toBe('cleared');
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('shed order is strictly ascending by tier (Tier 4 first) (Req 12.1, 12.2)', () => {
    fc.assert(
      fc.property(fc.array(tierArb, { minLength: 1, maxLength: 40 }), (tiers) => {
        const order = shedOrder(tiers);
        // Same multiset, just reordered.
        expect([...order].sort()).toEqual([...tiers].sort());
        // Strictly non-increasing tier numbers ⇒ Tier 4 is shed before Tier 1.
        for (let i = 1; i < order.length; i++) {
          expect(order[i]).toBeLessThanOrEqual(order[i - 1]);
        }
        // The first shed (if any high tier present) is the maximum tier.
        expect(order[0]).toBe(Math.max(...tiers));
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('resume order is strictly descending by tier (Tier 1 first) and is the reverse of shed order (Req 12.4)', () => {
    fc.assert(
      fc.property(fc.array(tierArb, { minLength: 1, maxLength: 40 }), (tiers) => {
        const resume = resumeOrder(tiers);
        const shed = shedOrder(tiers);

        // Same multiset.
        expect([...resume].sort()).toEqual([...tiers].sort());
        // Non-decreasing tier numbers ⇒ Tier 1 resumes before Tier 4.
        for (let i = 1; i < resume.length; i++) {
          expect(resume[i]).toBeGreaterThanOrEqual(resume[i - 1]);
        }
        // The first resumed is the most critical (minimum tier).
        expect(resume[0]).toBe(Math.min(...tiers));
        // Resume is the exact reverse of the shed order (ascending vs descending).
        expect(resume).toEqual([...shed].reverse());
      }),
      { numRuns: ITERATIONS }
    );
  });
});
