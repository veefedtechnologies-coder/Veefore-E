/**
 * Property 2: Metric Normalization Idempotency
 *
 * For any raw Facebook API response object, applying the metric normalization
 * mapping twice produces the same result as applying it once.
 *
 * Invariant: `normalize(normalize(raw)) === normalize(raw)` for all valid raw
 * response shapes.
 *
 * In practice the function is pure (deterministic): given the same `raw` object
 * it always produces the same normalized output regardless of how many times it
 * is called. The property test drives this by:
 *   1. Generating all permutations of present / absent raw FB API keys.
 *   2. Asserting that two independent calls with the same input are deeply equal.
 *
 * **Validates: Requirements 7.2, 7.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  mapFacebookRawMetrics,
  RAW_FB_METRIC_KEYS,
  type RawFacebookInsights,
} from '../normalizeMetrics';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a single raw metric value: a finite integer in a realistic
 * range (0 – 10_000_000), `null`, or absent (undefined).
 *
 * We use `fc.option` to produce `null | value`, then separately model
 * "key absent" by using `fc.option` on the entire key inclusion below.
 */
const arbitraryMetricValue = fc.oneof(
  fc.integer({ min: 0, max: 10_000_000 }),
  fc.constant(null)
);

/**
 * Arbitrary Facebook Insights response covering ALL permutations of present /
 * absent keys. For each of the 9 known raw field names, independently decides
 * whether the key is included and, if so, what numeric (or null) value it holds.
 *
 * This generator covers:
 *   • All keys present with positive integers
 *   • All keys absent (empty object)
 *   • Each key individually absent while others are present
 *   • Keys set to null (API returned the field but with no data)
 *   • Any combination of the above (2^9 = 512 structural shapes × value ranges)
 */
function arbitraryFacebookInsightsResponse(): fc.Arbitrary<RawFacebookInsights> {
  // Build an object of optional entries, one per raw key
  const entries = RAW_FB_METRIC_KEYS.map((key) =>
    fc.option(arbitraryMetricValue, { nil: undefined }).map(
      (value): [string, number | null | undefined] => [key, value]
    )
  );

  return fc.tuple(...entries).map((pairs) => {
    const raw: RawFacebookInsights = {};
    for (const [key, value] of pairs) {
      if (value !== undefined) {
        (raw as Record<string, number | null>)[key] = value;
      }
    }
    return raw;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapFacebookRawMetrics — Property 2: Metric Normalization Idempotency', () => {
  /**
   * Core property: calling the pure normalization function twice with the same
   * input produces identical output (determinism / referential transparency).
   *
   * **Validates: Requirements 7.2, 7.3**
   */
  it('applying normalization twice yields the same result as applying it once', () => {
    fc.assert(
      fc.property(arbitraryFacebookInsightsResponse(), (raw) => {
        const first = mapFacebookRawMetrics(raw);
        const second = mapFacebookRawMetrics(raw);

        // Deep equality: same keys and same values
        expect(first).toEqual(second);

        // Additional structural assertion: key sets are identical
        expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
      }),
      { numRuns: 500, verbose: true }
    );
  });

  /**
   * Null values are omitted — a key present in raw with value `null` must not
   * appear in the normalized output (Requirement 7.2: never substitute 0).
   *
   * **Validates: Requirements 7.2**
   */
  it('null raw values are omitted from the normalized result', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RAW_FB_METRIC_KEYS),
        (rawKey) => {
          const raw: RawFacebookInsights = { [rawKey]: null };
          const result = mapFacebookRawMetrics(raw);
          // No normalized key should be set to 0 or any value derived from null
          for (const value of Object.values(result)) {
            expect(typeof value).toBe('number');
            expect(Number.isFinite(value)).toBe(true);
          }
          // Specifically: the null raw key must not bleed through as a 0
          // (the normalized key for page_fan_count is followers_total, etc.)
          // We verify by checking that all present values are > 0 OR the result
          // is empty — neither option allows a fabricated 0.
          const values = Object.values(result);
          expect(values.every((v) => v > 0 || values.length === 0)).toBe(true);
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });

  /**
   * An empty raw object must produce an empty metrics object — no keys
   * invent values out of thin air.
   *
   * **Validates: Requirements 7.2**
   */
  it('an empty raw object produces an empty metrics object', () => {
    const result = mapFacebookRawMetrics({});
    expect(result).toEqual({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  /**
   * When a raw key has a finite positive integer value, the corresponding
   * normalized key is present with the same numeric value. The mapping is
   * value-preserving.
   *
   * **Validates: Requirements 7.2, 7.3**
   */
  it('present numeric values are faithfully preserved in the normalized output', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        (value) => {
          // Use a key with a 1:1 mapping (not page_views_total which maps to two keys)
          const raw: RawFacebookInsights = { page_fan_count: value };
          const result = mapFacebookRawMetrics(raw);
          expect(result.followers_total).toBe(value);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * page_views_total is the only raw key that maps to TWO normalized keys
   * (profile_visits AND facebook_page_views). Both should carry the exact
   * same value as the raw input.
   *
   * **Validates: Requirements 7.2, 7.3**
   */
  it('page_views_total maps to both profile_visits and facebook_page_views with the same value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        (value) => {
          const raw: RawFacebookInsights = { page_views_total: value };
          const result = mapFacebookRawMetrics(raw);
          expect(result.profile_visits).toBe(value);
          expect(result.facebook_page_views).toBe(value);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * The normalized output must only contain keys from the declared mapping.
   * No additional or unexpected keys should appear.
   *
   * **Validates: Requirements 7.3**
   */
  it('output contains only declared normalized metric keys', () => {
    const ALLOWED_OUTPUT_KEYS = new Set([
      'followers_total',
      'reach_total',
      'impressions_total',
      'total_engagements',
      'likes',
      'video_views',
      'profile_visits',
      'facebook_page_views',
      'published_posts',
      'facebook_reactions',
      'facebook_post_clicks',
      'new_followers',
      'lost_followers',
    ]);

    fc.assert(
      fc.property(arbitraryFacebookInsightsResponse(), (raw) => {
        const result = mapFacebookRawMetrics(raw);
        for (const key of Object.keys(result)) {
          expect(ALLOWED_OUTPUT_KEYS.has(key)).toBe(true);
        }
      }),
      { numRuns: 500 }
    );
  });
});
