import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildAuditReport,
  validateAuditCounts,
  CATEGORY_KEYS,
} from '../scripts/skeleton-audit-lib.mjs';

// Feature: pixel-perfect-skeleton-loading, Property 16: Audit category count equals its itemized list length
// Validates: Requirements 12.7
//
// The validator passes IFF every category's integer count equals its itemized
// list length. The builder always DERIVES counts from list lengths, so any
// report it produces is valid; tampering a count to disagree with its list
// length (wrong value, negative, or non-integer) makes the validator fail and
// flag exactly the tampered category.

/** An arbitrary audit item `{ name, file }`. */
const itemArb = fc.record({
  name: fc.string(),
  file: fc.string(),
});

/** An arbitrary itemized list (including empty), varying length. */
const itemListArb = fc.array(itemArb, { maxLength: 8 });

/**
 * An arbitrary category map: each CATEGORY_KEYS key is independently either
 * omitted or mapped to an arbitrary item list.
 */
const categoryMapArb = fc
  .tuple(...CATEGORY_KEYS.map(() => fc.option(itemListArb, { nil: undefined })))
  .map((lists) => {
    const map: Record<string, Array<{ name: string; file: string }>> = {};
    CATEGORY_KEYS.forEach((key, i) => {
      if (lists[i] !== undefined) {
        map[key] = lists[i] as Array<{ name: string; file: string }>;
      }
    });
    return map;
  });

describe('Property 16: audit category count equals its itemized list length (R12.7)', () => {
  it('builder derives count === items.length and validator passes for any category map', () => {
    fc.assert(
      fc.property(categoryMapArb, (categories) => {
        const report = buildAuditReport(categories);

        // Builder derives every count from its list length by construction.
        for (const key of CATEGORY_KEYS) {
          const cat = report.categories[key];
          expect(cat.count).toBe(cat.items.length);
          expect(Number.isInteger(cat.count)).toBe(true);
          expect(cat.count).toBeGreaterThanOrEqual(0);
        }

        // Validator passes (valid: true, no violations) for any built report.
        const result = validateAuditCounts(report);
        expect(result).toEqual({ valid: true, violations: [] });
      }),
      { numRuns: 100 },
    );
  });

  it('tampering a count so it disagrees with its list length makes the validator fail for exactly that category', () => {
    const tamperArb = fc.oneof(
      // A wrong non-negative integer count (offset by >=1 so it never equals len).
      fc.nat({ max: 20 }).map((d) => ({ kind: 'wrong-int' as const, delta: d + 1 })),
      // A negative count.
      fc.integer({ min: -20, max: -1 }).map((n) => ({ kind: 'negative' as const, value: n })),
      // A non-integer count.
      fc.double({ min: 0.1, max: 9.9, noNaN: true })
        .filter((x) => !Number.isInteger(x))
        .map((x) => ({ kind: 'non-integer' as const, value: x })),
    );

    fc.assert(
      fc.property(
        categoryMapArb,
        fc.nat({ max: CATEGORY_KEYS.length - 1 }),
        tamperArb,
        (categories, keyIndex, tamper) => {
          const report = buildAuditReport(categories);
          const key = CATEGORY_KEYS[keyIndex];
          const len = report.categories[key].items.length;

          // Apply a tamper that guarantees count !== len (or is invalid).
          if (tamper.kind === 'wrong-int') {
            report.categories[key].count = len + tamper.delta;
          } else {
            report.categories[key].count = tamper.value;
          }

          const result = validateAuditCounts(report);
          expect(result.valid).toBe(false);
          // The tampered category must be reported as a violation.
          expect(result.violations.some((v) => v.category === key)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
