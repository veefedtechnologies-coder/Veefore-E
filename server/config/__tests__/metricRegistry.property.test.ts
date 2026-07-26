import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  MetricRegistry,
  ClassificationTier,
  type MetricDataType,
} from '../metricRegistry';
import { rateLimitConfig } from '../rateLimitConfig';

/**
 * Property-Based Tests for the Metric Classification Registry (smart-polling-system).
 *
 * Property 1: Registry assigns exactly one tier per data type
 *   For every canonical Instagram data type, the registry contains exactly one
 *   entry, that entry's tier is one of the four valid tiers, and
 *   `MetricRegistry.get` resolves the same single entry. This is the invariant
 *   that startup `validate()` enforces by rejecting zero or duplicate
 *   assignments.
 *   **Validates: Requirements 1.1, 1.8**
 *
 * Property 2: Equal volatility and visibility imply equal tier
 *   For any two registry entries that share the same (volatility, visibility)
 *   pair, their assigned classification tier is identical.
 *   **Validates: Requirements 1.2**
 *
 * Property 3: Cadence base interval is keyed by the metric's tier
 *   For any data type, `MetricRegistry.baseIntervalMs(dataType, config)` returns
 *   exactly `config.smartPolling.metricTierBaseIntervalsMs[tier]` for that
 *   metric's assigned tier — selection reads the per-tier interval and nothing
 *   else.
 *   **Validates: Requirements 1.4**
 *
 * Property 4: Webhook-only data types are never polled
 *   For any data type, `isWebhookOnly` is true exactly when the entry's
 *   mechanism is `webhook`, and every webhook-only type (comments, dms,
 *   mentions) is reported as such while every poll type is not.
 *   **Validates: Requirements 1.5**
 */

const ITERATIONS = 200;

/** Generator over every canonical data type the registry must classify. */
const dataTypeArb: fc.Arbitrary<MetricDataType> = fc.constantFrom(
  ...MetricRegistry.CANONICAL_DATA_TYPES
);

const VALID_TIERS = [
  ClassificationTier.TIER_1,
  ClassificationTier.TIER_2,
  ClassificationTier.TIER_3,
  ClassificationTier.TIER_4,
];

describe('Feature: smart-polling-system, Property 1: Registry assigns exactly one tier per data type', () => {
  it('every canonical data type has exactly one entry resolving to a single valid tier', () => {
    fc.assert(
      fc.property(dataTypeArb, (dataType) => {
        const matches = MetricRegistry.ENTRIES.filter((e) => e.dataType === dataType);
        // Exactly one entry (no zero, no duplicates) — Req 1.1, 1.8.
        expect(matches.length).toBe(1);

        const entry = MetricRegistry.get(dataType);
        expect(entry.dataType).toBe(dataType);
        expect(VALID_TIERS).toContain(entry.classificationTier);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('the table contains an entry for every canonical type and no unknown extras', () => {
    // Table size equals canonical size — a structural restatement of the
    // exactly-one invariant across the whole registry.
    expect(MetricRegistry.ENTRIES.length).toBe(MetricRegistry.CANONICAL_DATA_TYPES.length);

    const tableTypes = MetricRegistry.ENTRIES.map((e) => e.dataType).sort();
    const canonical = [...MetricRegistry.CANONICAL_DATA_TYPES].sort();
    expect(tableTypes).toEqual(canonical);

    // The invariant is the one enforced at startup — validate() must not throw.
    expect(() => MetricRegistry.validate()).not.toThrow();
  });
});

describe('Feature: smart-polling-system, Property 2: Equal volatility and visibility imply equal tier', () => {
  it('any two entries sharing (volatility, visibility) share the same tier', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MetricRegistry.ENTRIES),
        fc.constantFrom(...MetricRegistry.ENTRIES),
        (a, b) => {
          if (a.volatility === b.volatility && a.visibility === b.visibility) {
            expect(a.classificationTier).toBe(b.classificationTier);
          }
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('each distinct (volatility, visibility) quadrant maps to a single tier', () => {
    const tierByQuadrant = new Map<string, ClassificationTier>();
    for (const entry of MetricRegistry.ENTRIES) {
      const quadrant = `${entry.volatility}|${entry.visibility}`;
      const seen = tierByQuadrant.get(quadrant);
      if (seen === undefined) {
        tierByQuadrant.set(quadrant, entry.classificationTier);
      } else {
        expect(entry.classificationTier).toBe(seen);
      }
    }
  });
});

describe("Feature: smart-polling-system, Property 3: Cadence base interval is keyed by the metric's tier", () => {
  it('baseIntervalMs returns exactly the per-tier interval for the metric tier', () => {
    fc.assert(
      fc.property(dataTypeArb, (dataType) => {
        const entry = MetricRegistry.get(dataType);
        const expected =
          rateLimitConfig.smartPolling.metricTierBaseIntervalsMs[entry.classificationTier];
        expect(MetricRegistry.baseIntervalMs(dataType, rateLimitConfig)).toBe(expected);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('selection depends only on the tier — equal-tier metrics get equal intervals', () => {
    fc.assert(
      fc.property(dataTypeArb, dataTypeArb, (a, b) => {
        const tierA = MetricRegistry.get(a).classificationTier;
        const tierB = MetricRegistry.get(b).classificationTier;
        const intervalA = MetricRegistry.baseIntervalMs(a, rateLimitConfig);
        const intervalB = MetricRegistry.baseIntervalMs(b, rateLimitConfig);
        if (tierA === tierB) {
          expect(intervalA).toBe(intervalB);
        }
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('reads the interval from config — a synthetic config is honored verbatim', () => {
    fc.assert(
      fc.property(
        dataTypeArb,
        fc.record({
          1: fc.integer({ min: 1, max: 10_000_000 }),
          2: fc.integer({ min: 1, max: 10_000_000 }),
          3: fc.integer({ min: 1, max: 10_000_000 }),
          4: fc.integer({ min: 1, max: 10_000_000 }),
        }),
        (dataType, tierIntervals) => {
          const syntheticConfig = {
            ...rateLimitConfig,
            smartPolling: {
              ...rateLimitConfig.smartPolling,
              metricTierBaseIntervalsMs: tierIntervals as Record<1 | 2 | 3 | 4, number>,
            },
          } as typeof rateLimitConfig;

          const tier = MetricRegistry.get(dataType).classificationTier;
          expect(MetricRegistry.baseIntervalMs(dataType, syntheticConfig)).toBe(
            tierIntervals[tier as 1 | 2 | 3 | 4]
          );
        }
      ),
      { numRuns: ITERATIONS }
    );
  });
});

describe('Feature: smart-polling-system, Property 4: Webhook-only data types are never polled', () => {
  it('isWebhookOnly is true exactly when the entry mechanism is webhook', () => {
    fc.assert(
      fc.property(dataTypeArb, (dataType) => {
        const entry = MetricRegistry.get(dataType);
        expect(MetricRegistry.isWebhookOnly(dataType)).toBe(entry.mechanism === 'webhook');
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('comments, dms, and mentions are webhook-only; all poll types are not', () => {
    const webhookOnly: MetricDataType[] = ['comments', 'dms', 'mentions'];
    for (const dataType of webhookOnly) {
      expect(MetricRegistry.isWebhookOnly(dataType)).toBe(true);
      expect(MetricRegistry.get(dataType).mechanism).toBe('webhook');
    }

    for (const entry of MetricRegistry.ENTRIES) {
      if (entry.mechanism === 'poll') {
        expect(MetricRegistry.isWebhookOnly(entry.dataType)).toBe(false);
      }
    }
  });
});
