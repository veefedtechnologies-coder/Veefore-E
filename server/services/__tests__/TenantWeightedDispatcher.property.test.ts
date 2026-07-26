import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  TenantWeightedDispatcher,
  type TenantPending,
} from '../TenantWeightedDispatcher';
import { rateLimitConfig, type RateLimitConfig } from '../../config/rateLimitConfig';

/**
 * Property-Based Tests for TenantWeightedDispatcher (smart-polling-system).
 *
 * Property 20: Weighted fair dispatch under contention
 *   For any set of tenants with pending jobs and configured weights, with
 *   weighting enabled the realized share of dispatched jobs per tenant over the
 *   rolling window is within ±10 percentage points of that tenant's normalized
 *   weight, and every tenant with pending jobs receives at least one dispatch
 *   per window (Req 13.1, 13.2).
 *   **Validates: Requirements 13.1, 13.2**
 *
 * Property 21: Equal shares when weighting disabled, valid weights when enabled
 *   For any set of tenants, with weighting disabled each tenant with pending
 *   jobs receives an equal share (counts differ by <=1 — Req 13.3); and for any
 *   weight input, `resolveWeight` returns a weight in [1,1000], defaulting
 *   missing/invalid weights to 1 (Req 13.4, 13.5).
 *   **Validates: Requirements 13.3, 13.4, 13.5**
 */

const ITERATIONS = 200;

/** Tolerance for realized-vs-target share (±10 percentage points, Req 13.1). */
const TOLERANCE_PP = 0.1;

/**
 * Build a RateLimitConfig with tenantPriority overridden, additively spreading
 * the real defaults so only the relevant knobs change.
 */
function buildConfig(overrides: {
  enabled: boolean;
  weights: Record<string, number>;
  windowMs?: number;
}): RateLimitConfig {
  return {
    ...rateLimitConfig,
    smartPolling: {
      ...rateLimitConfig.smartPolling,
      tenantPriority: {
        ...rateLimitConfig.smartPolling.tenantPriority,
        enabled: overrides.enabled,
        weights: overrides.weights,
        windowMs: overrides.windowMs ?? rateLimitConfig.smartPolling.tenantPriority.windowMs,
      },
    },
  };
}

/**
 * Simulate a full fairness window: starting from empty windowCounts, repeatedly
 * call selectNextTenant and increment the chosen tenant's count, for `total`
 * dispatches. Returns the resulting per-tenant dispatch counts.
 */
function simulateWindow(
  dispatcher: TenantWeightedDispatcher,
  pending: TenantPending[],
  total: number
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { tenantId } of pending) {
    counts[tenantId] = 0;
  }
  for (let i = 0; i < total; i++) {
    const chosen = dispatcher.selectNextTenant(pending, counts);
    expect(counts[chosen]).toBeDefined();
    counts[chosen] += 1;
  }
  return counts;
}

// Distinct tenant ids so generated tenant sets never collide.
const tenantIdsArb = (count: number): fc.Arbitrary<string[]> =>
  fc.constant(Array.from({ length: count }, (_, i) => `tenant-${i}`));

describe('Feature: smart-polling-system, Property 20: Weighted fair dispatch under contention', () => {
  it('every pending tenant gets >=1 dispatch and realized shares track normalized weights within ±10pp', () => {
    fc.assert(
      fc.property(
        // 2..5 tenants, each with a valid weight in [1, 1000].
        fc.integer({ min: 2, max: 5 }).chain((n) =>
          fc.record({
            ids: tenantIdsArb(n),
            weights: fc.array(fc.integer({ min: 1, max: 1000 }), {
              minLength: n,
              maxLength: n,
            }),
          })
        ),
        ({ ids, weights }) => {
          const weightMap: Record<string, number> = {};
          ids.forEach((id, i) => {
            weightMap[id] = weights[i];
          });

          const dispatcher = new TenantWeightedDispatcher(
            buildConfig({ enabled: true, weights: weightMap })
          );
          const pending: TenantPending[] = ids.map((tenantId) => ({ tenantId }));

          // Enough dispatches that the ±10pp tolerance is meaningful.
          const total = 1000;
          const counts = simulateWindow(dispatcher, pending, total);

          const totalWeight = ids.reduce((s, id) => s + weightMap[id], 0);

          for (const id of ids) {
            // Req 13.2: at least one dispatch per pending tenant per window.
            expect(counts[id]).toBeGreaterThanOrEqual(1);

            // Req 13.1: realized share within ±10pp of normalized weight share.
            const targetShare = weightMap[id] / totalWeight;
            const realizedShare = counts[id] / total;
            expect(Math.abs(realizedShare - targetShare)).toBeLessThanOrEqual(TOLERANCE_PP);
          }
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('guarantees at least one dispatch per tenant even with extreme weight skew', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), (n) => {
        const ids = Array.from({ length: n }, (_, i) => `tenant-${i}`);
        const weightMap: Record<string, number> = {};
        // One dominant tenant (1000), the rest minimal (1).
        ids.forEach((id, i) => {
          weightMap[id] = i === 0 ? 1000 : 1;
        });

        const dispatcher = new TenantWeightedDispatcher(
          buildConfig({ enabled: true, weights: weightMap })
        );
        const pending: TenantPending[] = ids.map((tenantId) => ({ tenantId }));

        const counts = simulateWindow(dispatcher, pending, 500);
        for (const id of ids) {
          expect(counts[id]).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: ITERATIONS }
    );
  });
});

describe('Feature: smart-polling-system, Property 21: Equal shares when weighting disabled, valid weights when enabled', () => {
  it('disabled weighting yields equal shares (counts differ by <=1)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        // Total dispatches; equality holds for any count.
        fc.integer({ min: 1, max: 600 }),
        (n, total) => {
          const ids = Array.from({ length: n }, (_, i) => `tenant-${i}`);
          // Weights present but should be ignored while disabled.
          const weightMap: Record<string, number> = {};
          ids.forEach((id, i) => {
            weightMap[id] = (i + 1) * 100;
          });

          const dispatcher = new TenantWeightedDispatcher(
            buildConfig({ enabled: false, weights: weightMap })
          );
          const pending: TenantPending[] = ids.map((tenantId) => ({ tenantId }));

          const counts = simulateWindow(dispatcher, pending, total);
          const values = ids.map((id) => counts[id]);
          const max = Math.max(...values);
          const min = Math.min(...values);

          // Req 13.3: equal shares — round-robin counts differ by at most 1.
          expect(max - min).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('resolveWeight returns the configured weight when valid in [1,1000]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (weight) => {
        const resolved = TenantWeightedDispatcher.resolveWeight('t', { t: weight });
        expect(resolved).toBe(weight);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('resolveWeight defaults missing/NaN/<1/>1000/non-number weights to 1 (Req 13.4, 13.5)', () => {
    // Missing entry.
    expect(TenantWeightedDispatcher.resolveWeight('t', {})).toBe(1);

    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(Number.NEGATIVE_INFINITY),
          fc.integer({ min: -1000, max: 0 }), // < 1
          fc.integer({ min: 1001, max: 100000 }), // > 1000
          fc.double({ min: -1000, max: 0.999, noNaN: true }) // below the floor
        ),
        (invalid) => {
          const resolved = TenantWeightedDispatcher.resolveWeight('t', {
            t: invalid as number,
          });
          expect(resolved).toBe(1);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('resolveWeight defaults non-number weights to 1', () => {
    const badValues: unknown[] = ['50', null, undefined, {}, [], true];
    for (const bad of badValues) {
      const resolved = TenantWeightedDispatcher.resolveWeight('t', {
        t: bad as unknown as number,
      });
      expect(resolved).toBe(1);
    }
  });

  it('resolveWeight always returns a value within [1,1000] for arbitrary input', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double({ noNaN: false }), fc.integer(), fc.constant(Number.NaN)),
        (anyValue) => {
          const resolved = TenantWeightedDispatcher.resolveWeight('t', {
            t: anyValue as number,
          });
          expect(resolved).toBeGreaterThanOrEqual(1);
          expect(resolved).toBeLessThanOrEqual(1000);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });
});
