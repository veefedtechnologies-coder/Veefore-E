/**
 * Unit / Example Tests for Insight Metric Selection (smart-polling-system).
 *
 * Covers the metric-correction edge cases for Task 3.5:
 *  - Field-expansion string contains `views` and never `impressions` for
 *    current content (Req 2.2).
 *  - The metric from which the rolling impressions estimate is derived is
 *    `views` for content published on/after the cutover (Req 2.5). The estimate
 *    itself is computed in the UsageStore from the selected metric; this module
 *    is the single source of truth for that selection.
 *  - The deprecation-retry substitutes `views` for `impressions`, records the
 *    substitution, calls the executor exactly twice, and resolves without
 *    throwing so the job is NOT marked failed (Req 2.6).
 *  - A partial media response omitting `saved`/`shares` records the returned
 *    metrics, omits only the missing field, and triggers no separate
 *    request/retry (Req 3.4).
 *
 * Requirements validated: 2.2, 2.5, 2.6, 3.4
 */

import { describe, it, expect, vi } from 'vitest';
import {
  selectInsightMetrics,
  CURRENT_CONTENT_INSIGHT_EXPANSION,
  LEGACY_BACKFILL_INSIGHT_EXPANSION,
  VIEWS_CUTOVER_UTC,
  requestInsightsWithDeprecationFallback,
  isImpressionsDeprecatedError,
  substituteImpressionsWithViews,
  normalizeMediaInsights,
  type MetricSubstitutionRecord,
  type RawInsightEntry,
} from '../insightMetricSelection';

// A representative current-content publish time (well after the cutover).
const CURRENT_CONTENT_MS = VIEWS_CUTOVER_UTC + 365 * 24 * 3600 * 1000;
// A representative legacy publish time (well before the cutover).
const LEGACY_CONTENT_MS = VIEWS_CUTOVER_UTC - 365 * 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
// Req 2.2 — field-expansion string contains `views`, never `impressions`
// ---------------------------------------------------------------------------

describe('Insight metric selection — current-content field expansion (Req 2.2)', () => {
  it('current-content expansion contains `views` and never `impressions`', () => {
    expect(CURRENT_CONTENT_INSIGHT_EXPANSION).toContain('views');
    expect(CURRENT_CONTENT_INSIGHT_EXPANSION).not.toContain('impressions');
  });

  it('selectInsightMetrics returns the views-based expansion for current content', () => {
    const selection = selectInsightMetrics(CURRENT_CONTENT_MS);

    expect(selection.fieldExpansion).toBe(CURRENT_CONTENT_INSIGHT_EXPANSION);
    expect(selection.fieldExpansion).toContain('views');
    expect(selection.fieldExpansion).not.toContain('impressions');
    expect(selection.isLegacy).toBe(false);
  });

  it('the exact cutover instant is treated as current content (views, no impressions)', () => {
    const selection = selectInsightMetrics(VIEWS_CUTOVER_UTC);

    expect(selection.primaryReachMetric).toBe('views');
    expect(selection.fieldExpansion).not.toContain('impressions');
  });

  it('legacy backfill expansion is the only place impressions is permitted', () => {
    const selection = selectInsightMetrics(LEGACY_CONTENT_MS);

    expect(selection.fieldExpansion).toBe(LEGACY_BACKFILL_INSIGHT_EXPANSION);
    expect(selection.fieldExpansion).toContain('impressions');
    expect(selection.isLegacy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Req 2.5 — rolling impressions estimate is derived from `views`
// ---------------------------------------------------------------------------

describe('Insight metric selection — estimate source metric (Req 2.5)', () => {
  it('selects `views` as the primary reach metric for current content', () => {
    // The rolling impressions estimate in the UsageStore is derived from the
    // primary reach metric chosen here. For current content that metric must be
    // `views`, never the deprecated `impressions`.
    const selection = selectInsightMetrics(CURRENT_CONTENT_MS);

    expect(selection.primaryReachMetric).toBe('views');
    expect(selection.primaryReachMetric).not.toBe('impressions');
  });

  it('selects `impressions` as the primary reach metric only for legacy media', () => {
    const selection = selectInsightMetrics(LEGACY_CONTENT_MS);

    expect(selection.primaryReachMetric).toBe('impressions');
  });
});

// ---------------------------------------------------------------------------
// Req 2.6 — deprecation retry substitutes views, does not fail the job
// ---------------------------------------------------------------------------

describe('Insight metric selection — deprecation fallback (Req 2.6)', () => {
  it('detects an impressions-deprecated error', () => {
    expect(
      isImpressionsDeprecatedError(
        new Error('The metric impressions is deprecated for this media')
      )
    ).toBe(true);

    // Graph API nested error shape.
    expect(
      isImpressionsDeprecatedError({
        error: { message: 'impressions is not supported for this media' },
      })
    ).toBe(true);

    // Unrelated error is not treated as a deprecation error.
    expect(isImpressionsDeprecatedError(new Error('network timeout'))).toBe(false);
  });

  it('substitutes views for impressions in a field-expansion string', () => {
    expect(substituteImpressionsWithViews(LEGACY_BACKFILL_INSIGHT_EXPANSION)).toBe(
      CURRENT_CONTENT_INSIGHT_EXPANSION
    );
  });

  it('retries once substituting views and resolves without throwing (job not failed)', async () => {
    const deprecationError = new Error(
      'The metric impressions is deprecated; use views instead'
    );

    // Executor fails on the first (impressions) call, succeeds on the second (views) call.
    const execute = vi
      .fn<(fieldExpansion: string) => Promise<{ ok: boolean }>>()
      .mockRejectedValueOnce(deprecationError)
      .mockResolvedValueOnce({ ok: true });

    let recordedSubstitution: MetricSubstitutionRecord | null = null;

    const outcome = await requestInsightsWithDeprecationFallback(
      LEGACY_BACKFILL_INSIGHT_EXPANSION,
      execute,
      (record) => {
        recordedSubstitution = record;
      }
    );

    // Job did not fail — it resolved with the successful result.
    expect(outcome.result).toEqual({ ok: true });

    // Executor was called exactly twice: once with impressions, once with views.
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, LEGACY_BACKFILL_INSIGHT_EXPANSION);
    expect(execute).toHaveBeenNthCalledWith(2, CURRENT_CONTENT_INSIGHT_EXPANSION);

    // The substitution was recorded (impressions → views).
    expect(outcome.substitution).toEqual({
      substituted: true,
      from: 'impressions',
      to: 'views',
    });
    expect(recordedSubstitution).toEqual(outcome.substitution);
  });

  it('does not retry and records no substitution when the first attempt succeeds', async () => {
    const execute = vi
      .fn<(fieldExpansion: string) => Promise<{ ok: boolean }>>()
      .mockResolvedValueOnce({ ok: true });

    const outcome = await requestInsightsWithDeprecationFallback(
      CURRENT_CONTENT_INSIGHT_EXPANSION,
      execute
    );

    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.substitution).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('propagates non-deprecation errors without retrying', async () => {
    const otherError = new Error('network timeout');
    const execute = vi
      .fn<(fieldExpansion: string) => Promise<unknown>>()
      .mockRejectedValueOnce(otherError);

    await expect(
      requestInsightsWithDeprecationFallback(CURRENT_CONTENT_INSIGHT_EXPANSION, execute)
    ).rejects.toThrow('network timeout');

    // Only the initial attempt — the fallback only fires on deprecation errors.
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Req 3.4 — partial media response omits only the missing field, no retry
// ---------------------------------------------------------------------------

describe('Insight metric selection — partial media response (Req 3.4)', () => {
  it('records returned metrics and omits only the missing `shares` field', () => {
    const insightsData: RawInsightEntry[] = [
      { name: 'views', values: [{ value: 1200 }] },
      { name: 'reach', values: [{ value: 1000 }] },
      { name: 'saved', values: [{ value: 15 }] },
      // `shares` intentionally absent (media type does not support it).
      { name: 'total_interactions', values: [{ value: 300 }] },
    ];

    const normalized = normalizeMediaInsights(insightsData);

    // All returned metrics are recorded.
    expect(normalized.metrics).toEqual({
      views: 1200,
      reach: 1000,
      saved: 15,
      total_interactions: 300,
    });

    // Only the missing optional field is omitted.
    expect(normalized.omitted).toEqual(['shares']);
    expect('shares' in normalized.metrics).toBe(false);
    expect('saved' in normalized.metrics).toBe(true);
  });

  it('omits only `saved` when shares is present but saved is missing', () => {
    const insightsData: RawInsightEntry[] = [
      { name: 'views', values: [{ value: 500 }] },
      { name: 'reach', values: [{ value: 480 }] },
      { name: 'shares', values: [{ value: 7 }] },
      { name: 'total_interactions', values: [{ value: 90 }] },
    ];

    const normalized = normalizeMediaInsights(insightsData);

    expect(normalized.omitted).toEqual(['saved']);
    expect(normalized.metrics.shares).toBe(7);
  });

  it('omits both `saved` and `shares` when neither is returned', () => {
    const insightsData: RawInsightEntry[] = [
      { name: 'views', values: [{ value: 50 }] },
      { name: 'reach', values: [{ value: 48 }] },
      { name: 'total_interactions', values: [{ value: 9 }] },
    ];

    const normalized = normalizeMediaInsights(insightsData);

    expect(normalized.omitted).toEqual(['saved', 'shares']);
    expect(normalized.metrics).toEqual({ views: 50, reach: 48, total_interactions: 9 });
  });

  it('normalizing a partial response does not perform any separate request or retry', () => {
    // normalizeMediaInsights is a pure function over the already-returned data.
    // It accepts no executor/fetcher, so by construction it cannot issue a
    // follow-up request for the missing field (Req 3.4). We verify it is
    // synchronous and total over partial input.
    const insightsData: RawInsightEntry[] = [
      { name: 'views', values: [{ value: 10 }] },
      { name: 'saved', values: [{ value: 2 }] },
    ];

    const result = normalizeMediaInsights(insightsData);

    // Synchronous result (not a Promise) — no async fetch happened.
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.metrics).toEqual({ views: 10, saved: 2 });
    expect(result.omitted).toEqual(['shares']);
  });

  it('handles an empty/undefined insights array by omitting both optional fields', () => {
    expect(normalizeMediaInsights(undefined).omitted).toEqual(['saved', 'shares']);
    expect(normalizeMediaInsights(null).omitted).toEqual(['saved', 'shares']);
    expect(normalizeMediaInsights([]).metrics).toEqual({});
  });
});
