import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  resolveRenderState,
  clampListCount,
  type QueryFlags,
} from '../render-state';

/**
 * Property-based tests for the pure loading-state resolution and bounded
 * list-count logic in `render-state.ts`.
 *
 * Feature: pixel-perfect-skeleton-loading
 */

describe('render-state property-based tests', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 11: Loading-state resolution hands off correctly
  // Validates: Requirements 4.6, 9.3, 9.4, 9.5
  test('Property 11: loading-state resolution hands off correctly', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // isLoading
        fc.boolean(), // isFetching
        fc.boolean(), // isError
        // Arbitrary data, including undefined (unresolved) and various shapes.
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.constant<unknown[]>([]),
          fc.array(fc.anything()),
          fc.string(),
          fc.integer(),
          fc.object(),
        ),
        // An emptiness predicate. Use a small set of deterministic predicates
        // so the property covers different notions of "empty".
        fc.constantFrom<(d: unknown) => boolean>(
          (d) => Array.isArray(d) && d.length === 0,
          (d) => d == null,
          (d) => d === '' || (Array.isArray(d) && d.length === 0),
          () => false,
          () => true,
        ),
        (isLoading, isFetching, isError, data, isEmpty) => {
          const q: QueryFlags = { isLoading, isFetching, isError, data };
          const state = resolveRenderState(q, isEmpty);

          // 1. Error dominates everything (R9.5).
          if (isError) {
            expect(state).toBe('error');
            // NEVER 'populated' after a failure.
            expect(state).not.toBe('populated');
            return;
          }

          // Not an error below this point.
          expect(state).not.toBe('error');

          // 2. In-flight / unresolved → 'loading' (R9.3, R9.4).
          const inFlightOrUnresolved =
            isLoading ||
            data === undefined ||
            (isEmpty(data) && isFetching);

          if (inFlightOrUnresolved) {
            expect(state).toBe('loading');
            // Never a populated placeholder while unresolved.
            expect(state).not.toBe('populated');
            return;
          }

          // 3. Resolved, not error, not in-flight: either 'empty' or
          //    'populated' per the emptiness predicate, never 'loading'.
          expect(state).not.toBe('loading');
          if (isEmpty(data)) {
            expect(state).toBe('empty');
          } else {
            expect(state).toBe('populated');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: pixel-perfect-skeleton-loading, Property 12: Variable lists render a bounded placeholder count
  // Validates: Requirements 9.8
  test('Property 12: variable lists render a bounded placeholder count', () => {
    const clamp = (n: number, min: number, max: number) =>
      Math.min(Math.max(n, min), max);

    fc.assert(
      fc.property(
        // Counts spanning undefined/null, zero, negatives, and huge ints.
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.constant(0),
          fc.integer({ min: -1_000_000, max: -1 }),
          fc.integer({ min: 1, max: 1_000_000 }),
          fc.integer(),
        ),
        // Arbitrary default within a sane range.
        fc.integer({ min: 0, max: 1000 }),
        (count, def) => {
          const result = clampListCount(count, { default: def });
          const expected = clamp(count ?? def, 3, 10);

          // Matches the clamp(count ?? default, 3, 10) definition.
          expect(result).toBe(expected);
          // Always within [3, 10].
          expect(result).toBeGreaterThanOrEqual(3);
          expect(result).toBeLessThanOrEqual(10);
        },
      ),
      { numRuns: 100 },
    );
  });
});
