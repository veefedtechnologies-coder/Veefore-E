/**
 * Auto Pilot — LeadTimeEstimator (pure logic, no I/O).
 *
 * Computes the Lead_Time for a just-in-time Content_Brief: the estimated
 * duration the requested media takes to create, plus a safety buffer, used by
 * the PLAN stage to decide when a brief must be sent (`publishTime − leadTime`).
 *
 * Rule (design "ContentSourceResolver + LeadTimeEstimator" · R7.2):
 *   - Look up a base creation duration from a complexity → base-duration table
 *     (config, not hardcoded in the logic).
 *   - Add a safety buffer of `max(0.25 × base, 30 minutes)` — at least 25%.
 *   - Clamp the final Lead_Time to `[2 hours, 14 days]`.
 *
 * Fully deterministic and side-effect free so it can be unit- and property-tested
 * without a database, clock, or network.
 *
 * Satisfies Requirements: 7.2 (Property 11)
 */

import type { ContentFormat } from '../db/models/ContentSlotModel'

/** Content creation complexity tier for a planned slot. */
export type ContentComplexity = 'low' | 'med' | 'high'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Lead-time configuration. Kept as data (not embedded in branching logic) so the
 * table can be tuned without touching the buffer/clamp algorithm.
 */
export interface LeadTimeConfig {
  /** Base creation duration in ms, keyed by format then complexity. */
  baseDurationMs: Record<ContentFormat, Record<ContentComplexity, number>>
  /** Fractional buffer applied to the base duration (≥ 0.25 per R7.2). */
  bufferRatio: number
  /** Minimum absolute buffer in ms, applied when the ratio buffer is smaller. */
  minBufferMs: number
  /** Lower clamp bound for the final Lead_Time (ms). */
  minLeadTimeMs: number
  /** Upper clamp bound for the final Lead_Time (ms). */
  maxLeadTimeMs: number
}

/**
 * Default table. Anchored to the design examples:
 *   photo:low ≈ 2h, carousel:med ≈ 8h, reel:high ≈ 24h, story:low ≈ 1h.
 * Remaining cells scale sensibly with complexity within each format.
 */
export const DEFAULT_LEAD_TIME_CONFIG: LeadTimeConfig = {
  baseDurationMs: {
    photo: { low: 2 * HOUR_MS, med: 4 * HOUR_MS, high: 6 * HOUR_MS },
    story: { low: 1 * HOUR_MS, med: 2 * HOUR_MS, high: 3 * HOUR_MS },
    carousel: { low: 4 * HOUR_MS, med: 8 * HOUR_MS, high: 12 * HOUR_MS },
    reel: { low: 12 * HOUR_MS, med: 18 * HOUR_MS, high: 24 * HOUR_MS },
  },
  bufferRatio: 0.25,
  minBufferMs: 30 * MINUTE_MS,
  minLeadTimeMs: 2 * HOUR_MS,
  maxLeadTimeMs: 14 * DAY_MS,
}

/** Clamp `value` into the inclusive range `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Pure Lead_Time estimator.
 *
 * `estimate(format, complexity)` returns the Lead_Time in milliseconds. The
 * result is always within `[minLeadTimeMs, maxLeadTimeMs]` and always includes
 * the safety buffer before clamping.
 */
export class LeadTimeEstimator {
  constructor(private readonly config: LeadTimeConfig = DEFAULT_LEAD_TIME_CONFIG) {}

  /** Base creation duration (ms) for a format/complexity from the config table. */
  baseDurationMs(format: ContentFormat, complexity: ContentComplexity): number {
    return this.config.baseDurationMs[format][complexity]
  }

  /** Safety buffer (ms) for a base duration: `max(ratio × base, minBuffer)` (R7.2). */
  bufferMs(baseMs: number): number {
    return Math.max(this.config.bufferRatio * baseMs, this.config.minBufferMs)
  }

  /**
   * Estimate the Lead_Time (ms) for a slot's media: base + buffer, clamped to
   * `[minLeadTimeMs, maxLeadTimeMs]` (R7.2).
   */
  estimate(format: ContentFormat, complexity: ContentComplexity): number {
    const base = this.baseDurationMs(format, complexity)
    const buffered = base + this.bufferMs(base)
    return clamp(buffered, this.config.minLeadTimeMs, this.config.maxLeadTimeMs)
  }
}

/** Shared default instance for callers that do not need a custom config. */
export const leadTimeEstimator = new LeadTimeEstimator()
