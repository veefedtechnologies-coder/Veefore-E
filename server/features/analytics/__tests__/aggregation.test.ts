/**
 * Unit tests for rollup aggregation (Phase 7). Verifies period bucketing and
 * registry-driven per-metric reduction (followers=latest, likes=sum).
 */

import { describe, it, expect } from 'vitest'
import { getPeriodStart, rollupEvents, type MetricEvent } from '../aggregation'
import { normalizeEvent } from '../events'
import { ANALYTICS_EVENT_NAMES } from '../events'

function ev(ts: string, payload: Record<string, number>): MetricEvent {
  return normalizeEvent({
    eventName: ANALYTICS_EVENT_NAMES.INSTAGRAM_MEDIA_SYNCED,
    workspaceId: 'ws_1',
    accountId: 'acc_1',
    platform: 'instagram',
    source: 'connector:instagram',
    eventTimestamp: ts,
    payload,
  }) as MetricEvent
}

describe('getPeriodStart', () => {
  const d = new Date('2026-01-15T13:45:30Z') // Thursday

  it('buckets by hour/day/month in UTC', () => {
    expect(getPeriodStart(d, 'hourly').toISOString()).toBe('2026-01-15T13:00:00.000Z')
    expect(getPeriodStart(d, 'daily').toISOString()).toBe('2026-01-15T00:00:00.000Z')
    expect(getPeriodStart(d, 'monthly').toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('buckets weekly to the preceding Monday', () => {
    // 2026-01-15 is a Thursday → week starts Monday 2026-01-12.
    expect(getPeriodStart(d, 'weekly').toISOString()).toBe('2026-01-12T00:00:00.000Z')
  })
})

describe('rollupEvents', () => {
  it('reduces followers by latest and likes by sum within a day', () => {
    const events = [
      ev('2026-01-15T08:00:00Z', { followers_total: 1000, likes: 10 }),
      ev('2026-01-15T20:00:00Z', { followers_total: 1050, likes: 15 }),
    ]
    const [rollup] = rollupEvents(events, 'daily')
    expect(rollup.metrics.followers_total).toBe(1050) // latest
    expect(rollup.metrics.likes).toBe(25) // sum
    expect(rollup.eventCount).toBe(2)
    expect(rollup.periodStart).toBe('2026-01-15T00:00:00.000Z')
  })

  it('separates buckets by day and by account', () => {
    const events = [
      ev('2026-01-15T08:00:00Z', { likes: 10 }),
      ev('2026-01-16T08:00:00Z', { likes: 5 }),
    ]
    expect(rollupEvents(events, 'daily')).toHaveLength(2)
  })

  it('ignores non-success events and non-numeric payload values', () => {
    const good = ev('2026-01-15T08:00:00Z', { likes: 10 })
    const failed = { ...ev('2026-01-15T09:00:00Z', { likes: 99 }), status: 'failed' as const }
    const rollups = rollupEvents([good, failed], 'daily')
    expect(rollups).toHaveLength(1)
    expect(rollups[0].metrics.likes).toBe(10)
  })
})
