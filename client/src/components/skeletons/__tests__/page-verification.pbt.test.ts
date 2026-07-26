import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  recordPageVerification,
  CHECK_IDS,
  type CheckId,
  type CheckOutcome,
  type PageChecks,
} from '../page-verification';

/**
 * Property-based test for the pure per-page production-ready status derivation
 * in `page-verification.ts`.
 *
 * Feature: pixel-perfect-skeleton-loading
 */

describe('page-verification property-based tests', () => {
  // Feature: pixel-perfect-skeleton-loading, Property 17: Per-page production-ready status derivation — recordPageVerification yields 'production-ready' iff all six checks pass (with no failing checks), otherwise 'not-production-ready' listing exactly the non-passing checks and their observed values in CHECK_IDS order.
  // Validates: Requirements 13.7, 13.8
  test('Property 17: per-page production-ready status derivation', () => {
    // An arbitrary single check outcome: a pass/fail boolean plus an optional
    // observed value (string, number, or absent).
    const checkOutcomeArb: fc.Arbitrary<CheckOutcome> = fc.record(
      {
        passed: fc.boolean(),
        observedValue: fc.oneof(
          fc.constant(undefined),
          fc.string(),
          fc.double({ noNaN: true }),
        ),
      },
      { requiredKeys: ['passed'] },
    );

    fc.assert(
      fc.property(
        fc.string(), // pageId
        // Build the PageChecks record by mapping over CHECK_IDS.
        fc.tuple(
          checkOutcomeArb,
          checkOutcomeArb,
          checkOutcomeArb,
          checkOutcomeArb,
          checkOutcomeArb,
          checkOutcomeArb,
        ),
        (pageId, outcomes) => {
          const checks = CHECK_IDS.reduce((acc, id, i) => {
            acc[id] = outcomes[i];
            return acc;
          }, {} as PageChecks);

          const record = recordPageVerification(pageId, checks);

          // Record echoes back its inputs.
          expect(record.pageId).toBe(pageId);
          expect(record.checks).toBe(checks);

          const allPassed = CHECK_IDS.every(
            (id) => checks[id].passed === true,
          );

          if (allPassed) {
            // production-ready IFF every one of the 6 checks passed.
            expect(record.status).toBe('production-ready');
            // When production-ready, failingChecks is empty.
            expect(record.failingChecks).toEqual([]);
          } else {
            expect(record.status).toBe('not-production-ready');

            // failingChecks lists exactly the checks whose passed !== true,
            // each with its observedValue, in CHECK_IDS order.
            const expectedFailing = CHECK_IDS.filter(
              (id) => checks[id].passed !== true,
            ).map((id) => ({
              checkId: id as CheckId,
              observedValue: checks[id].observedValue,
            }));

            expect(record.failingChecks).toEqual(expectedFailing);

            // Ordering is the canonical CHECK_IDS order.
            const failingIds = record.failingChecks.map((f) => f.checkId);
            const canonicalOrder = CHECK_IDS.filter((id) =>
              failingIds.includes(id),
            );
            expect(failingIds).toEqual(canonicalOrder);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
