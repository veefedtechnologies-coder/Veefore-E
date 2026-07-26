/**
 * Veefore Analytics — Metric Engine (Phase 2).
 *
 * Consumes raw metric inputs and produces fully-provenanced {@link MetricValue}s
 * for raw and calculated metrics, using the {@link METRIC_DEFINITIONS} registry
 * as the single source of truth (08-backend-api-architecture.md Ch 2 "Metric
 * Engine"; CODING_RULES Rule 9 — analytics computed on the backend only).
 *
 * The engine never fabricates values: when inputs are missing or a formula is
 * not computable it returns `value: null`. Data-quality and lineage come from the
 * metric definition so every value can be traced (07-data-event-architecture.md
 * Ch 8; CODING_RULES Rule 16).
 *
 * Composite scores are NOT auto-computed here because their weights are not
 * defined in the documentation (see composite.ts); use {@link computeComposite}
 * with an explicit weight configuration.
 */

import {
  audienceChurn,
  audienceRetention,
  averageFrequency,
  averageWatchTime,
  clickThroughRate,
  completionRate,
  engagementRate,
  engagementVelocity,
  followerGrowth,
  netFollowers,
  publishingFailureRate,
  publishingSuccessRate,
  reachEfficiency,
  reachVelocity,
  saveRate,
  shareRate,
  totalEngagements,
  percentage,
} from './calculations'
import { computeCompositeScore, type CompositeScoreOptions } from './composite'
import { getMetricByKey } from './registry'
import type {
  BenchmarkBand,
  CompositeComponent,
  MetricBenchmark,
  MetricDefinition,
  MetricValue,
  RatingBand,
} from './types'

/** A set of raw metric values for a single period, keyed by canonical key. */
export interface MetricInputs {
  [key: string]: number | undefined
}

/**
 * Everything the engine needs to compute a period's metrics: current-period raw
 * inputs, optional prior-period inputs (for deltas/rates), and the window
 * duration in hours (for velocity metrics).
 */
export interface MetricContext {
  current: MetricInputs
  previous?: MetricInputs
  windowHours?: number
}

/** Read a current-period input, or `undefined`. */
function cur(ctx: MetricContext, key: string): number | undefined {
  return ctx.current[key]
}

/** Read a prior-period input, or `undefined`. */
function prev(ctx: MetricContext, key: string): number | undefined {
  return ctx.previous?.[key]
}

/** True for a finite number. */
function num(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Calculators for each calculated metric key. Each returns the numeric value or
 * `null` when it cannot be computed from the provided context. Formulas mirror
 * calculations.ts (the single source of truth for the arithmetic).
 */
const CALCULATORS: Record<string, (ctx: MetricContext) => number | null> = {
  follower_growth: (ctx) => {
    const c = cur(ctx, 'followers_total')
    const p = prev(ctx, 'followers_total')
    return num(c) && num(p) ? followerGrowth(c, p) : null
  },
  net_followers: (ctx) => {
    const nf = cur(ctx, 'new_followers')
    const lf = cur(ctx, 'lost_followers')
    if (num(nf) && num(lf)) return netFollowers(nf, lf)
    // Fallback: net change in followers over the period (current − previous).
    // This IS the net followers gained/lost — not a fabricated gross split.
    const c = cur(ctx, 'followers_total')
    const p = prev(ctx, 'followers_total')
    return num(c) && num(p) ? followerGrowth(c, p) : null
  },
  follower_growth_rate: (ctx) => {
    const nf = cur(ctx, 'new_followers')
    const lf = cur(ctx, 'lost_followers')
    const c = cur(ctx, 'followers_total')
    const p = prev(ctx, 'followers_total')
    // Net new = (new − lost) when available, else the current−previous delta.
    let netNew: number | null = null
    if (num(nf) && num(lf)) netNew = netFollowers(nf, lf)
    else if (num(c) && num(p)) netNew = followerGrowth(c, p)
    if (netNew === null) return null
    // Base = previous-period followers; when unavailable (no prior period data),
    // use the start-of-period count derived from current − net.
    const base = num(p) ? p : num(c) ? c - netNew : 0
    if (!base) return null
    return percentage(netNew, base)
  },
  audience_churn: (ctx) => {
    const lf = cur(ctx, 'lost_followers')
    if (!num(lf)) return null
    const p = prev(ctx, 'followers_total')
    const c = cur(ctx, 'followers_total')
    const nf = cur(ctx, 'new_followers')
    const net = num(nf) ? nf - lf : 0
    const base = num(p) ? p : num(c) ? c - net : 0
    if (!base) return null
    return audienceChurn(lf, base)
  },
  audience_retention: (ctx) => {
    const lf = cur(ctx, 'lost_followers')
    if (!num(lf)) return null
    const p = prev(ctx, 'followers_total')
    const c = cur(ctx, 'followers_total')
    const nf = cur(ctx, 'new_followers')
    const net = num(nf) ? nf - lf : 0
    const base = num(p) ? p : num(c) ? c - net : 0
    if (!base) return null
    const churn = audienceChurn(lf, base)
    return churn === null ? null : audienceRetention(churn)
  },
  total_engagements: (ctx) => {
    const l = cur(ctx, 'likes')
    const c = cur(ctx, 'comments')
    const s = cur(ctx, 'shares')
    const sv = cur(ctx, 'saves')
    // At least likes OR comments must be present. saves is NONE on Facebook so
    // treat it as 0 when absent — omitting it entirely would always block FB totals.
    if (!num(l) && !num(c)) return null
    return totalEngagements(num(l) ? l : 0, num(c) ? c : 0, num(s) ? s : 0, num(sv) ? sv : 0)
  },
  engagement_rate_by_followers: (ctx) => {
    const e = computeEngagements(ctx)
    const f = cur(ctx, 'followers_total')
    return e !== null && num(f) ? engagementRate(e, f) : null
  },
  engagement_rate_by_reach: (ctx) => {
    const e = computeEngagements(ctx)
    const r = cur(ctx, 'reach_total')
    return e !== null && num(r) ? engagementRate(e, r) : null
  },
  engagement_rate_by_impressions: (ctx) => {
    const e = computeEngagements(ctx)
    const i = cur(ctx, 'impressions_total')
    return e !== null && num(i) ? engagementRate(e, i) : null
  },
  share_rate: (ctx) => {
    const s = cur(ctx, 'shares')
    const r = cur(ctx, 'reach_total')
    return num(s) && num(r) ? shareRate(s, r) : null
  },
  save_rate: (ctx) => {
    const sv = cur(ctx, 'saves')
    const r = cur(ctx, 'reach_total')
    return num(sv) && num(r) ? saveRate(sv, r) : null
  },
  engagement_velocity: (ctx) => {
    if (!num(ctx.windowHours)) return null
    const e = computeEngagements(ctx)
    if (e === null) return null
    // Gained = delta vs prior total engagements when available, else current total.
    const prevE = computeEngagements({ current: ctx.previous ?? {} })
    const gained = prevE !== null ? e - prevE : e
    return engagementVelocity(gained, ctx.windowHours)
  },
  reach_efficiency: (ctx) => {
    const r = cur(ctx, 'reach_total')
    const f = cur(ctx, 'followers_total')
    return num(r) && num(f) ? reachEfficiency(r, f) : null
  },
  reach_velocity: (ctx) => {
    if (!num(ctx.windowHours)) return null
    const r = cur(ctx, 'reach_total')
    if (!num(r)) return null
    const pr = prev(ctx, 'reach_total')
    const gained = num(pr) ? r - pr : r
    return reachVelocity(gained, ctx.windowHours)
  },
  average_frequency: (ctx) => {
    const i = cur(ctx, 'impressions_total')
    const r = cur(ctx, 'reach_total')
    return num(i) && num(r) ? averageFrequency(i, r) : null
  },
  ctr: (ctx) => {
    const clicks = cur(ctx, 'website_clicks')
    const i = cur(ctx, 'impressions_total')
    return num(clicks) && num(i) ? clickThroughRate(clicks, i) : null
  },
  completion_rate: (ctx) => {
    const comp = cur(ctx, 'video_completions')
    const v = cur(ctx, 'video_views')
    return num(comp) && num(v) ? completionRate(comp, v) : null
  },
  average_watch_time: (ctx) => {
    const t = cur(ctx, 'total_watch_time')
    const v = cur(ctx, 'video_views')
    return num(t) && num(v) ? averageWatchTime(t, v) : null
  },
  publishing_success_rate: (ctx) => {
    const pub = cur(ctx, 'published_posts')
    if (!num(pub)) return null
    const fail = cur(ctx, 'failed_posts')
    // failed_posts may be absent (not tracked for FB yet) — treat as 0.
    return publishingSuccessRate(pub, pub + (num(fail) ? fail : 0))
  },
  publishing_failure_rate: (ctx) => {
    const pub = cur(ctx, 'published_posts')
    const fail = cur(ctx, 'failed_posts')
    if (!num(pub) && !num(fail)) return null
    const p = num(pub) ? pub : 0
    const f = num(fail) ? fail : 0
    return f > 0 ? publishingFailureRate(f, p + f) : 0
  },
}

/** Total engagements from a context's current inputs, or `null`.
 * Treats missing saves/shares as 0 — they are NONE on Facebook and simply don't
 * exist, so omitting them shouldn't block engagement calculations. */
function computeEngagements(ctx: MetricContext): number | null {
  const l = ctx.current.likes
  const c = ctx.current.comments
  const s = ctx.current.shares
  const sv = ctx.current.saves
  // Require at least likes OR comments — purely missing data returns null.
  if (!num(l) && !num(c)) return null
  return totalEngagements(num(l) ? l : 0, num(c) ? c : 0, num(s) ? s : 0, num(sv) ? sv : 0)
}

/** Whether a value falls inside an inclusive benchmark band. */
function inBand(value: number, band?: BenchmarkBand): boolean {
  return !!band && value >= band.min && value <= band.max
}

/**
 * Rate a value against a benchmark, returning the matching band or `undefined`
 * when no benchmark is defined or no band matches.
 */
export function rateValue(value: number, benchmark?: MetricBenchmark): RatingBand | undefined {
  if (!benchmark) return undefined
  const bands: Array<[RatingBand, BenchmarkBand | undefined]> = [
    ['excellent', benchmark.excellent],
    ['good', benchmark.good],
    ['average', benchmark.average],
    ['poor', benchmark.poor],
    ['critical', benchmark.critical],
  ]
  for (const [band, range] of bands) {
    if (inBand(value, range)) return band
  }
  return undefined
}

/** Build a {@link MetricValue} from a definition and computed number. */
function toMetricValue(def: MetricDefinition, value: number | null): MetricValue {
  return {
    metricId: def.id,
    key: def.key,
    value,
    unit: def.unit,
    dataQuality: def.dataQuality,
    rating: value !== null ? rateValue(value, def.benchmark) : undefined,
    lineage: def.dependencies,
  }
}

/**
 * The Metric Engine — resolves and computes metric values with full provenance.
 * Stateless and pure over its inputs; safe to share as a singleton.
 */
export class MetricEngine {
  /**
   * Compute a single metric by canonical key from the given context.
   * @throws if the key is not a registered metric.
   */
  computeMetric(key: string, ctx: MetricContext): MetricValue {
    const def = getMetricByKey(key)
    if (!def) throw new Error(`Unknown metric key: ${key}`)

    if (def.type === 'raw') {
      const raw = cur(ctx, key)
      return toMetricValue(def, num(raw) ? raw : null)
    }

    if (def.type === 'calculated') {
      const calc = CALCULATORS[key]
      return toMetricValue(def, calc ? calc(ctx) : null)
    }

    // Composite / AI / business metrics are not computed here.
    return toMetricValue(def, null)
  }

  /**
   * Compute all raw and calculated metrics from the context. Composite/AI/business
   * metrics are skipped. Returns a map keyed by canonical key (values may be null
   * when inputs are insufficient).
   */
  computeAll(ctx: MetricContext): Record<string, MetricValue> {
    const result: Record<string, MetricValue> = {}
    // Raw metrics present in the current inputs.
    for (const key of Object.keys(ctx.current)) {
      const def = getMetricByKey(key)
      if (def && def.type === 'raw') result[key] = this.computeMetric(key, ctx)
    }
    // Every calculated metric (value may be null when not derivable).
    for (const key of Object.keys(CALCULATORS)) {
      result[key] = this.computeMetric(key, ctx)
    }
    return result
  }

  /**
   * Compute a composite score for a registered composite metric from explicit,
   * caller-supplied weighted components (weights are not defined in the docs —
   * see composite.ts). Returns a {@link MetricValue}; `value` is `null` when the
   * components are insufficient.
   * @throws if the key is not a registered composite metric.
   */
  computeComposite(
    key: string,
    components: CompositeComponent[],
    options?: CompositeScoreOptions
  ): MetricValue {
    const def = getMetricByKey(key)
    if (!def || def.type !== 'composite') {
      throw new Error(`Unknown composite metric key: ${key}`)
    }
    const score = computeCompositeScore(components, options)
    return {
      ...toMetricValue(def, score),
      lineage: components.map((c) => c.key),
    }
  }
}

/** Shared singleton metric engine. */
export const metricEngine = new MetricEngine()
