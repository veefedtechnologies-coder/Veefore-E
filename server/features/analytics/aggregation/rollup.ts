/**
 * Veefore Analytics — Rollup Aggregation (Phase 7).
 *
 * Aggregates normalized events into multi-granularity {@link MetricRollup}s
 * (07-data-event-architecture.md Ch 7). Each metric key is reduced using the
 * aggregation type from the metric registry (Phase 2), so followers use "latest"
 * while likes use "sum" — one consistent rule everywhere (Ch 8 lineage).
 *
 * Pure and deterministic; persistence is handled by the storage port (Phase 10).
 */

import { getMetricByKey, type AggregationType } from '../metrics'
import type { AnalyticsEvent } from '../events/types'
import type { MetricRollup, RollupGranularity } from './types'

/** Events whose payload is a map of canonical metric key → numeric value. */
export type MetricEvent = AnalyticsEvent<Record<string, number>>

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS

/** Start of the granularity bucket containing `date`, aligned to UTC. */
export function getPeriodStart(date: Date, granularity: RollupGranularity): Date {
  const d = new Date(date)
  switch (granularity) {
    case 'hourly':
      d.setUTCMinutes(0, 0, 0)
      return d
    case 'daily':
      d.setUTCHours(0, 0, 0, 0)
      return d
    case 'weekly': {
      d.setUTCHours(0, 0, 0, 0)
      // ISO week starts Monday. getUTCDay: 0=Sun..6=Sat.
      const offset = (d.getUTCDay() + 6) % 7
      d.setUTCDate(d.getUTCDate() - offset)
      return d
    }
    case 'monthly':
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    case 'lifetime':
      return new Date(0)
  }
}

/** End of the bucket starting at `start` (exclusive). Lifetime has no fixed end. */
function getPeriodEnd(start: Date, granularity: RollupGranularity, lastEventAt: Date): Date {
  switch (granularity) {
    case 'hourly':
      return new Date(start.getTime() + HOUR_MS)
    case 'daily':
      return new Date(start.getTime() + DAY_MS)
    case 'weekly':
      return new Date(start.getTime() + 7 * DAY_MS)
    case 'monthly':
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    case 'lifetime':
      return lastEventAt
  }
}

/** Reduce a metric's samples per its aggregation type. Samples are time-ordered. */
function reduceSamples(
  values: { value: number; ts: number }[],
  aggregation: AggregationType
): number {
  if (values.length === 0) return 0
  switch (aggregation) {
    case 'sum':
      return values.reduce((s, v) => s + v.value, 0)
    case 'average':
      return values.reduce((s, v) => s + v.value, 0) / values.length
    case 'max':
      return Math.max(...values.map((v) => v.value))
    case 'min':
      return Math.min(...values.map((v) => v.value))
    case 'count':
      return values.length
    case 'latest':
    case 'rate':
    case 'none':
    default: {
      // Value from the most recent sample.
      let latest = values[0]
      for (const v of values) if (v.ts >= latest.ts) latest = v
      return latest.value
    }
  }
}

/** Scope key grouping events into the same rollup document. */
function scopeKey(e: MetricEvent, periodStartIso: string): string {
  return [e.workspaceId, e.platform ?? '', e.accountId ?? '', periodStartIso].join('|')
}

/** Aggregation type for a metric key: registry-driven, defaulting to `sum`. */
function aggregationFor(key: string): AggregationType {
  return getMetricByKey(key)?.aggregation ?? 'sum'
}

/**
 * Aggregate events into rollups for a given granularity. Only successful events
 * are aggregated (failed/pending are ignored). Non-numeric payload values are
 * skipped. Returns one rollup per (workspace, platform, account, period).
 */
export function rollupEvents(events: MetricEvent[], granularity: RollupGranularity): MetricRollup[] {
  interface Bucket {
    base: Omit<MetricRollup, 'metrics' | 'eventCount' | 'lastEventAt' | 'periodEnd'> & { periodStartDate: Date }
    samples: Map<string, { value: number; ts: number }[]>
    eventCount: number
    lastEventMs: number
  }

  const buckets = new Map<string, Bucket>()

  for (const event of events) {
    if (event.status !== 'success') continue
    const ts = Date.parse(event.eventTimestamp)
    if (Number.isNaN(ts)) continue

    const periodStart = getPeriodStart(new Date(ts), granularity)
    const periodStartIso = periodStart.toISOString()
    const key = scopeKey(event, periodStartIso)

    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        base: {
          workspaceId: event.workspaceId,
          organizationId: event.organizationId,
          platform: event.platform,
          accountId: event.accountId,
          granularity,
          periodStart: periodStartIso,
          periodStartDate: periodStart,
        },
        samples: new Map(),
        eventCount: 0,
        lastEventMs: 0,
      }
      buckets.set(key, bucket)
    }

    bucket.eventCount += 1
    if (ts > bucket.lastEventMs) bucket.lastEventMs = ts

    for (const [metricKey, value] of Object.entries(event.payload)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const list = bucket.samples.get(metricKey) ?? []
      list.push({ value, ts })
      bucket.samples.set(metricKey, list)
    }
  }

  const rollups: MetricRollup[] = []
  for (const bucket of buckets.values()) {
    const metrics: Record<string, number> = {}
    for (const [metricKey, samples] of bucket.samples) {
      metrics[metricKey] = reduceSamples(samples, aggregationFor(metricKey))
    }
    const lastEventAt = new Date(bucket.lastEventMs)
    const { periodStartDate, ...base } = bucket.base
    rollups.push({
      ...base,
      metrics,
      eventCount: bucket.eventCount,
      lastEventAt: lastEventAt.toISOString(),
      periodEnd: getPeriodEnd(periodStartDate, granularity, lastEventAt).toISOString(),
    })
  }

  return rollups
}
