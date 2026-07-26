import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectInsightMetrics,
  VIEWS_CUTOVER_UTC,
  CURRENT_CONTENT_INSIGHT_EXPANSION,
  LEGACY_BACKFILL_INSIGHT_EXPANSION,
} from '../insightMetricSelection';

/**
 * Property-Based Tests for Insight Metric Selection (smart-polling-system).
 *
 * Property 5: Views-versus-impressions date boundary
 *   For any media publish timestamp, `selectInsightMetrics` returns `views`
 *   (and never `impressions`) when the timestamp is on or after
 *   2024-07-02T00:00:00Z, and permits `impressions` only when the timestamp is
 *   strictly earlier.
 *   **Validates: Requirements 2.1, 2.3, 2.4**
 *
 * Property 6: Media insights are bundled into a single request
 *   For any media object, building its current-content insight request yields
 *   exactly one field-expansion request whose metric set contains `views`,
 *   `reach`, `saved`, `shares`, and `total_interactions` together — no separate
 *   request is produced for `saved` or `shares`.
 *   **Validates: Requirements 3.1, 3.2, 3.3**
 */

const ITERATIONS = 200;

/**
 * Parse the comma-separated metric set out of an
 * `insights.metric(a,b,c)` field-expansion string. Returns null if the string
 * is not a single bundled `insights.metric(...)` call.
 */
function parseInsightMetricExpansion(expansion: string): string[] | null {
  // Must be exactly one insights.metric(...) call — no second call appended.
  const matches = expansion.match(/insights\.metric\(/g);
  if (!matches || matches.length !== 1) {
    return null;
  }
  const inner = expansion.match(/^insights\.metric\(([^)]*)\)$/);
  if (!inner) {
    return null;
  }
  return inner[1].split(',').map((m) => m.trim()).filter((m) => m.length > 0);
}

describe('Feature: smart-polling-system, Property 5: Views-versus-impressions date boundary', () => {
  it('returns views (never impressions) for timestamps on or after the cutover (epoch ms)', () => {
    fc.assert(
      fc.property(
        // Offset >= 0 from the cutover instant.
        fc.integer({ min: 0, max: 10 * 365 * 24 * 3600 * 1000 }),
        (offsetMs) => {
          const ts = VIEWS_CUTOVER_UTC + offsetMs;
          const selection = selectInsightMetrics(ts);

          expect(selection.primaryReachMetric).toBe('views');
          expect(selection.isLegacy).toBe(false);
          expect(selection.fieldExpansion).toBe(CURRENT_CONTENT_INSIGHT_EXPANSION);
          // The current-content expansion must never request impressions.
          expect(selection.fieldExpansion).not.toContain('impressions');
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('permits impressions only for timestamps strictly before the cutover (epoch ms)', () => {
    fc.assert(
      fc.property(
        // Offset >= 1 ms strictly before the cutover instant.
        fc.integer({ min: 1, max: 30 * 365 * 24 * 3600 * 1000 }),
        (offsetMs) => {
          const ts = VIEWS_CUTOVER_UTC - offsetMs;
          const selection = selectInsightMetrics(ts);

          expect(selection.primaryReachMetric).toBe('impressions');
          expect(selection.isLegacy).toBe(true);
          expect(selection.fieldExpansion).toBe(LEGACY_BACKFILL_INSIGHT_EXPANSION);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('respects the boundary identically for Date, number, and ISO string inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -(5 * 365 * 24 * 3600 * 1000), max: 5 * 365 * 24 * 3600 * 1000 }),
        (offsetMs) => {
          const ts = VIEWS_CUTOVER_UTC + offsetMs;
          const expectedMetric = ts >= VIEWS_CUTOVER_UTC ? 'views' : 'impressions';

          const fromNumber = selectInsightMetrics(ts);
          const fromDate = selectInsightMetrics(new Date(ts));
          const fromIso = selectInsightMetrics(new Date(ts).toISOString());

          expect(fromNumber.primaryReachMetric).toBe(expectedMetric);
          expect(fromDate.primaryReachMetric).toBe(expectedMetric);
          expect(fromIso.primaryReachMetric).toBe(expectedMetric);

          // The exact cutover instant must be treated as current content.
          if (offsetMs === 0) {
            expect(fromNumber.primaryReachMetric).toBe('views');
          }
        }
      ),
      { numRuns: ITERATIONS }
    );
  });
});

describe('Feature: smart-polling-system, Property 6: Media insights are bundled into a single request', () => {
  it('yields exactly one field-expansion request containing views, reach, saved, shares, total_interactions', () => {
    fc.assert(
      fc.property(
        // Any current-content media object (publish time >= cutover).
        fc.integer({ min: 0, max: 10 * 365 * 24 * 3600 * 1000 }),
        (offsetMs) => {
          const ts = VIEWS_CUTOVER_UTC + offsetMs;
          const selection = selectInsightMetrics(ts);

          const metrics = parseInsightMetricExpansion(selection.fieldExpansion);
          // Exactly one bundled insights.metric(...) call.
          expect(metrics).not.toBeNull();

          const metricSet = new Set(metrics as string[]);
          for (const required of ['views', 'reach', 'saved', 'shares', 'total_interactions']) {
            expect(metricSet.has(required)).toBe(true);
          }

          // saved/shares ride the same bundle — no separate request appended.
          const expansionCalls = selection.fieldExpansion.match(/insights\.metric\(/g) || [];
          expect(expansionCalls.length).toBe(1);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('bundles saved and shares alongside the primary metric for legacy media too (single request)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 * 365 * 24 * 3600 * 1000 }),
        (offsetMs) => {
          const ts = VIEWS_CUTOVER_UTC - offsetMs;
          const selection = selectInsightMetrics(ts);

          const metrics = parseInsightMetricExpansion(selection.fieldExpansion);
          expect(metrics).not.toBeNull();

          const metricSet = new Set(metrics as string[]);
          // saved and shares are always bundled regardless of legacy/current.
          expect(metricSet.has('saved')).toBe(true);
          expect(metricSet.has('shares')).toBe(true);
          expect(metricSet.has('reach')).toBe(true);
          expect(metricSet.has('total_interactions')).toBe(true);

          const expansionCalls = selection.fieldExpansion.match(/insights\.metric\(/g) || [];
          expect(expansionCalls.length).toBe(1);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });
});
