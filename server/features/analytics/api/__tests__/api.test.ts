/**
 * Unit tests for the analytics backend API layer (Phase 8): query parsing,
 * cache, dashboard service assembly, and job dispatch.
 */

import { describe, it, expect } from 'vitest'
import { parseAnalyticsQuery } from '../query'
import { InMemoryTtlCache, dashboardCacheKey, queryFingerprint } from '../cache'
import { DashboardService, UnknownDashboardError } from '../dashboard.service'
import { EmptyRollupReadStore, type RollupReadStore, type SeriesReadStore } from '../ports'
import { ANALYTICS_JOB_TYPES, runAnalyticsJob } from '../workers/jobs'
import { ANALYTICS_DASHBOARD_SPECS } from '../dashboard-specs'
import { getMetricByKey } from '../../metrics'
import { AnalyticsPipeline } from '../../pipeline'
import type { MetricRollup } from '../../aggregation'

// ── Query ────────────────────────────────────────────────────────────────────
describe('parseAnalyticsQuery', () => {
  it('applies defaults and splits comma lists', () => {
    const q = parseAnalyticsQuery({ workspaceId: 'ws_1', platforms: 'instagram,facebook' })
    expect(q.granularity).toBe('daily')
    expect(q.page).toBe(1)
    expect(q.platforms).toEqual(['instagram', 'facebook'])
    expect(q.accounts).toEqual([])
  })

  it('rejects a missing workspaceId', () => {
    expect(() => parseAnalyticsQuery({})).toThrow()
  })
})

// ── Cache ────────────────────────────────────────────────────────────────────
describe('InMemoryTtlCache', () => {
  it('stores and retrieves before expiry, and expires after TTL', async () => {
    const cache = new InMemoryTtlCache()
    await cache.set('k', { a: 1 }, 1000)
    expect(await cache.get('k')).toEqual({ a: 1 })

    await cache.set('exp', { a: 1 }, 0) // already expired
    expect(await cache.get('exp')).toBeUndefined()
  })

  it('invalidates by prefix', async () => {
    const cache = new InMemoryTtlCache()
    await cache.set('analytics:ws_1:dashboard:overview:x', 1, 1000)
    await cache.set('analytics:ws_2:dashboard:overview:x', 2, 1000)
    await cache.invalidate('analytics:ws_1:')
    expect(await cache.get('analytics:ws_1:dashboard:overview:x')).toBeUndefined()
    expect(await cache.get('analytics:ws_2:dashboard:overview:x')).toBe(2)
  })

  it('builds stable, order-independent fingerprints', () => {
    const a = queryFingerprint({ from: '1', to: '2' })
    const b = queryFingerprint({ to: '2', from: '1' })
    expect(a).toBe(b)
    expect(dashboardCacheKey('ws', 'overview', a)).toContain('analytics:ws:dashboard:overview:')
  })
})

// ── Dashboard service ────────────────────────────────────────────────────────
function rollup(from: string, metrics: Record<string, number>): MetricRollup {
  return {
    workspaceId: 'ws_1',
    granularity: 'daily',
    periodStart: from,
    periodEnd: from,
    metrics,
    eventCount: 1,
    lastEventAt: '2026-01-15T00:00:00.000Z',
  }
}

class FakeReadStore implements RollupReadStore {
  constructor(private current: MetricRollup[], private previous: MetricRollup[]) {}
  async getRollups(q: { from?: string }) {
    return q.from?.startsWith('2026-01-08') ? this.current : this.previous
  }
}

describe('DashboardService.buildDashboard', () => {
  const query = parseAnalyticsQuery({
    workspaceId: 'ws_1',
    from: '2026-01-08T00:00:00.000Z',
    to: '2026-01-15T00:00:00.000Z',
    compareFrom: '2026-01-01T00:00:00.000Z',
    compareTo: '2026-01-08T00:00:00.000Z',
  })

  it('computes KPI values and deltas from rollups', async () => {
    const store = new FakeReadStore(
      [
        rollup('2026-01-08T00:00:00.000Z', {
          followers_total: 1200,
          reach_total: 2000,
          impressions_total: 3000,
          likes: 50,
          comments: 10,
          shares: 5,
          saves: 5,
          profile_visits: 100,
          website_clicks: 20,
          published_posts: 9,
          failed_posts: 1,
        }),
      ],
      [rollup('2026-01-01T00:00:00.000Z', { followers_total: 1000 })]
    )
    const service = new DashboardService({ readStore: store })
    const res = await service.buildDashboard('overview', query)

    expect(res.meta.partialData).toBe(false)
    const followers = res.kpis.find((k) => k.key === 'followers_total')!
    expect(followers.value).toBe(1200)
    expect(followers.previousValue).toBe(1000)
    expect(followers.change).toBe(200)
    expect(followers.changePercent).toBe(20)
    expect(followers.trend).toBe('up')

    // engagement_rate_by_reach = (50+10+5+5)/2000*100 = 3.5
    expect(res.kpis.find((k) => k.key === 'engagement_rate_by_reach')!.value).toBe(3.5)
    // publishing_success_rate = 9/(9+1)*100 = 90
    expect(res.kpis.find((k) => k.key === 'publishing_success_rate')!.value).toBe(90)
  })

  it('returns a well-formed empty envelope when there is no data', async () => {
    const service = new DashboardService({ readStore: new EmptyRollupReadStore() })
    const res = await service.buildDashboard('overview', query)
    expect(res.meta.partialData).toBe(true)
    expect(res.kpis.every((k) => k.value === null)).toBe(true)
    expect(res.meta.warnings.length).toBeGreaterThan(0)
  })

  it('throws for an unknown dashboard id', async () => {
    const service = new DashboardService({ readStore: new EmptyRollupReadStore() })
    await expect(service.buildDashboard('nope', query)).rejects.toBeInstanceOf(UnknownDashboardError)
  })

  it('includes a timeseries widget when a series store provides daily points', async () => {
    const seriesStore: SeriesReadStore = {
      async getDailySeries() {
        return [
          { date: '2026-01-14T00:00:00.000Z', metrics: { reach_total: 100, total_engagements: 10, followers_total: 1000 } },
          { date: '2026-01-15T00:00:00.000Z', metrics: { reach_total: 120, total_engagements: 14, followers_total: 1010 } },
        ]
      },
    }
    const service = new DashboardService({ readStore: new EmptyRollupReadStore(), seriesStore })
    const res = await service.buildDashboard('overview', query)
    const ts = res.widgets.find((w) => w.widgetType === 'timeseries')
    expect(ts).toBeDefined()
    const data = ts!.data as { series: unknown[]; points: unknown[] }
    expect(data.points).toHaveLength(2)
    expect(data.series).toHaveLength(3) // overview seriesKeys
  })
})

// ── Dashboard specs integrity ────────────────────────────────────────────────
describe('dashboard specs', () => {
  const query = parseAnalyticsQuery({ workspaceId: 'ws_1' })

  it('every KPI key references a registered metric', () => {
    for (const [id, spec] of Object.entries(ANALYTICS_DASHBOARD_SPECS)) {
      for (const key of spec.kpiKeys) {
        expect(getMetricByKey(key), `${id}:${key}`).toBeDefined()
      }
    }
  })

  it('every registered dashboard builds a valid envelope', async () => {
    const service = new DashboardService({ readStore: new EmptyRollupReadStore() })
    for (const id of Object.keys(ANALYTICS_DASHBOARD_SPECS)) {
      const res = await service.buildDashboard(id, query)
      expect(res.meta.dashboardId).toBe(id)
      expect(res.kpis.length).toBe(ANALYTICS_DASHBOARD_SPECS[id].kpiKeys.length)
    }
  })
})

// ── Jobs ─────────────────────────────────────────────────────────────────────
describe('runAnalyticsJob', () => {
  it('aggregation refresh ingests events and invalidates workspace cache', async () => {
    const cache = new InMemoryTtlCache()
    await cache.set('analytics:ws_1:dashboard:overview:x', 1, 10_000)
    const pipeline = new AnalyticsPipeline() // no stores → ingest+aggregate in-memory

    const result = await runAnalyticsJob(
      {
        type: ANALYTICS_JOB_TYPES.AGGREGATION_REFRESH,
        workspaceId: 'ws_1',
        payload: {
          events: [
            {
              eventName: 'instagram.media.synced',
              workspaceId: 'ws_1',
              source: 'connector:instagram',
              payload: { likes: 10 },
            },
          ],
        },
      },
      { pipeline, cache }
    )

    expect(result.ok).toBe(true)
    expect(await cache.get('analytics:ws_1:dashboard:overview:x')).toBeUndefined()
  })

  it('reports unimplemented handlers gracefully', async () => {
    const result = await runAnalyticsJob(
      { type: ANALYTICS_JOB_TYPES.FORECAST_GENERATION, workspaceId: 'ws_1' },
      {}
    )
    expect(result.ok).toBe(false)
  })
})
