/**
 * Insight Metric Selection — views vs. impressions for media insights.
 *
 * Meta deprecated the `impressions` metric for media created on or after
 * 2024-07-02, replacing it with `views`. Requesting `impressions` for
 * post-cutover media errors, so all current-content polling must request
 * `views`. `impressions` is only valid for strictly-earlier legacy media
 * (pre-2024-07-02) during backfill.
 *
 * This module is the single source of truth for:
 *  - the deprecation cutover boundary ({@link VIEWS_CUTOVER_UTC}),
 *  - the corrected current-content field-expansion string
 *    ({@link CURRENT_CONTENT_INSIGHT_EXPANSION}),
 *  - the legacy backfill field-expansion string
 *    ({@link LEGACY_BACKFILL_INSIGHT_EXPANSION}),
 *  - per-media metric selection ({@link selectInsightMetrics}),
 *  - the single-request deprecation fallback hook
 *    ({@link requestInsightsWithDeprecationFallback}), and
 *  - the `saved`/`shares` omit-on-unavailable normalization
 *    ({@link normalizeMediaInsights}).
 *
 * All logic here is pure (no I/O), except the fallback hook which wraps a
 * caller-supplied request executor.
 *
 * smart-polling-system Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 2.6, 3.4
 */

/**
 * The deprecation boundary (UTC epoch ms). Media published on or after this
 * instant use `views`; media published strictly before it may use the legacy
 * `impressions` metric (smart-polling-system Req 2.1, 2.3, 2.4).
 *
 * Source: Meta media `impressions` deprecation for content created on/after
 * 2024-07-02. Last verified: 2025-01-15
 */
export const VIEWS_CUTOVER_UTC = Date.parse('2024-07-02T00:00:00Z');

/**
 * Corrected current-content media-insights field-expansion (smart-polling-system Req 2.2, 3.1).
 *
 * Bundles `views`, `reach`, `saved`, `shares`, and `total_interactions` into a
 * single field-expansion request. `likes` and `comments` come from the media
 * node fields (e.g. `like_count`, `comments_count`) and are bundled into the
 * same request by the caller, so they are not repeated here.
 *
 * Contains `views` and never `impressions` for current content (Req 2.2).
 */
export const CURRENT_CONTENT_INSIGHT_EXPANSION =
  'insights.metric(views,reach,saved,shares,total_interactions)';

/**
 * Legacy backfill media-insights field-expansion for pre-cutover media only
 * (smart-polling-system Req 2.3). Requests `impressions` instead of `views`.
 */
export const LEGACY_BACKFILL_INSIGHT_EXPANSION =
  'insights.metric(impressions,reach,saved,shares,total_interactions)';

/** The primary reach-style metric requested for a media object. */
export type PrimaryReachMetric = 'views' | 'impressions';

/** The outcome of selecting the insight metric set for a single media object. */
export interface InsightMetricSelection {
  /** `views` for current content; `impressions` for legacy pre-cutover media. */
  primaryReachMetric: PrimaryReachMetric;
  /** The field-expansion string to use for this media object. */
  fieldExpansion: string;
  /** True when the media is strictly pre-cutover (legacy backfill). */
  isLegacy: boolean;
}

/**
 * Select the insight metric set for a media object based on its publish time
 * (smart-polling-system Req 2.1, 2.3, 2.4).
 *
 * - published on/after {@link VIEWS_CUTOVER_UTC} → `views`
 *   ({@link CURRENT_CONTENT_INSIGHT_EXPANSION})
 * - published strictly before {@link VIEWS_CUTOVER_UTC} → `impressions`
 *   ({@link LEGACY_BACKFILL_INSIGHT_EXPANSION})
 *
 * An unparseable/invalid publish time is treated as current content (`views`),
 * so the system never requests the deprecated `impressions` metric for media
 * it cannot prove is legacy (Req 2.4).
 *
 * @param mediaPublishedAt - Publish time as a `Date`, epoch ms, or ISO string.
 * @returns The selected primary metric, field-expansion string, and legacy flag.
 */
export function selectInsightMetrics(
  mediaPublishedAt: Date | number | string
): InsightMetricSelection {
  const publishedMs = toEpochMs(mediaPublishedAt);

  // Only treat media as legacy when we can prove it is strictly pre-cutover.
  const isLegacy = publishedMs !== null && publishedMs < VIEWS_CUTOVER_UTC;

  if (isLegacy) {
    return {
      primaryReachMetric: 'impressions',
      fieldExpansion: LEGACY_BACKFILL_INSIGHT_EXPANSION,
      isLegacy: true,
    };
  }

  return {
    primaryReachMetric: 'views',
    fieldExpansion: CURRENT_CONTENT_INSIGHT_EXPANSION,
    isLegacy: false,
  };
}

/**
 * Normalize a publish-time input to epoch milliseconds, or `null` when it
 * cannot be parsed into a finite timestamp.
 */
function toEpochMs(value: Date | number | string): number | null {
  let ms: number;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number') {
    ms = value;
  } else {
    ms = Date.parse(value);
  }
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// Deprecation fallback hook (Req 2.6)
// ---------------------------------------------------------------------------

/** Record of an `impressions` → `views` substitution after a deprecation error. */
export interface MetricSubstitutionRecord {
  /** Whether a substitution occurred. */
  substituted: boolean;
  /** The metric that was replaced. */
  from: 'impressions';
  /** The metric substituted in. */
  to: 'views';
}

/** Result of a (possibly retried) insights request. */
export interface InsightsRequestResult<T> {
  /** The successful response. */
  result: T;
  /**
   * The substitution record when a deprecation fallback retry occurred,
   * otherwise `null`.
   */
  substitution: MetricSubstitutionRecord | null;
}

/**
 * Heuristically determine whether an error indicates the `impressions` metric
 * is deprecated or unavailable for the requested media (smart-polling-system Req 2.6).
 *
 * Meta surfaces this in different shapes, so we inspect the error message and
 * common Graph API error fields for a mention of `impressions` together with a
 * deprecation/unsupported/unavailable signal.
 *
 * @param error - The error thrown by the insights request.
 * @returns True when the error looks like an `impressions`-deprecation error.
 */
export function isImpressionsDeprecatedError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }

  const mentionsImpressions = message.includes('impressions');
  const mentionsDeprecation =
    message.includes('deprecat') ||
    message.includes('no longer') ||
    message.includes('not supported') ||
    message.includes('unsupported') ||
    message.includes('does not support') ||
    message.includes('not available') ||
    message.includes('unavailable') ||
    message.includes('invalid metric');

  return mentionsImpressions && mentionsDeprecation;
}

/** Extract a searchable message string from an unknown error shape. */
function extractErrorMessage(error: unknown): string {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object') {
    const anyErr = error as Record<string, any>;
    // Graph API nested error: { error: { message, type, error_user_msg } }
    const graphError = anyErr['error'];
    const candidates = [
      anyErr['message'],
      graphError?.message,
      graphError?.error_user_msg,
      graphError?.error_user_title,
    ].filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (candidates.length > 0) {
      return candidates.join(' ');
    }
  }
  return '';
}

/**
 * Replace the `impressions` metric with `views` in a field-expansion string.
 *
 * @param fieldExpansion - The original field-expansion string.
 * @returns The field-expansion string with `impressions` substituted by `views`.
 */
export function substituteImpressionsWithViews(fieldExpansion: string): string {
  // Word-boundary replace so `impressions` is swapped without touching other
  // metric names. The legacy expansion only contains `impressions` once.
  return fieldExpansion.replace(/\bimpressions\b/g, 'views');
}

/**
 * Execute an insights request with a single-request deprecation fallback
 * (smart-polling-system Req 2.6).
 *
 * Runs `execute(initialFieldExpansion)`. If it rejects with an
 * `impressions`-deprecated/unavailable error, retries exactly once with
 * `impressions` substituted by `views`, records that the substitution
 * occurred, and resolves normally so the calling job is NOT marked failed.
 *
 * Any non-deprecation error, and a failure of the single retry, are rethrown
 * to the caller (the deprecation fallback only ever retries once).
 *
 * @param initialFieldExpansion - The field-expansion string to try first.
 * @param execute - Performs the request for a given field-expansion string.
 * @param onSubstitution - Optional callback invoked when a substitution occurs.
 * @returns The successful result plus a substitution record (or `null`).
 */
export async function requestInsightsWithDeprecationFallback<T>(
  initialFieldExpansion: string,
  execute: (fieldExpansion: string) => Promise<T>,
  onSubstitution?: (record: MetricSubstitutionRecord) => void
): Promise<InsightsRequestResult<T>> {
  try {
    const result = await execute(initialFieldExpansion);
    return { result, substitution: null };
  } catch (error) {
    if (!isImpressionsDeprecatedError(error)) {
      // Not a deprecation error — propagate to normal error handling.
      throw error;
    }

    // Req 2.6: retry once with `views` substituted for `impressions`.
    const substitutedExpansion = substituteImpressionsWithViews(initialFieldExpansion);
    const result = await execute(substitutedExpansion);

    const record: MetricSubstitutionRecord = {
      substituted: true,
      from: 'impressions',
      to: 'views',
    };
    if (onSubstitution) {
      onSubstitution(record);
    }
    return { result, substitution: record };
  }
}

// ---------------------------------------------------------------------------
// saved / shares omit-on-unavailable normalization (Req 3.4)
// ---------------------------------------------------------------------------

/** Optional media metrics that may be absent for some media types. */
export const OPTIONAL_MEDIA_METRICS = ['saved', 'shares'] as const;
export type OptionalMediaMetric = (typeof OPTIONAL_MEDIA_METRICS)[number];

/** A single raw insight entry as returned by Meta's field-expansion response. */
export interface RawInsightEntry {
  name: string;
  values?: Array<{ value: number }>;
}

/** Normalized media insights with unavailable optional fields omitted. */
export interface NormalizedMediaInsights {
  /** Metrics actually returned, keyed by metric name. */
  metrics: Record<string, number>;
  /** Optional metrics (`saved`/`shares`) that were not present in the response. */
  omitted: OptionalMediaMetric[];
}

/**
 * Normalize a media-insights field-expansion response (smart-polling-system Req 3.4).
 *
 * Records every metric that was returned and omits only the optional fields
 * (`saved`/`shares`) that are absent — for example when the media object's type
 * does not support them. This performs NO separate request or retry to fetch a
 * missing field; the bundled request is considered complete.
 *
 * @param insightsData - The `insights.data[]` array from the response (may be undefined).
 * @returns The returned metrics plus the list of omitted optional metrics.
 */
export function normalizeMediaInsights(
  insightsData: RawInsightEntry[] | undefined | null
): NormalizedMediaInsights {
  const metrics: Record<string, number> = {};

  if (Array.isArray(insightsData)) {
    for (const entry of insightsData) {
      if (!entry || typeof entry.name !== 'string') {
        continue;
      }
      const value = entry.values?.[0]?.value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        metrics[entry.name] = value;
      }
    }
  }

  const omitted = OPTIONAL_MEDIA_METRICS.filter((name) => !(name in metrics));

  return { metrics, omitted };
}
