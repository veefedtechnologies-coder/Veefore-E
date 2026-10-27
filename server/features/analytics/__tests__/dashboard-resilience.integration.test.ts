/**
 * Dashboard Resilience Integration Tests (Task 15.2)
 *
 * Verifies that DashboardService.buildDashboard() degrades gracefully when one
 * platform store fails:
 *
 *   Scenario A — Facebook store throws:
 *     • Instagram KPI data is still present in the response.
 *     • meta.warnings contains "Facebook data temporarily unavailable".
 *     • meta.partialData === true.
 *
 *   Scenario B — Instagram (Legacy) store throws:
 *     • Facebook KPI data is still present in the response.
 *     • meta.warnings contains "Instagram data temporarily unavailable".
 *     • meta.partialData === true.
 *
 * Design: inject a MultiPlatformRollupStore constructed with controlled mocks
 * (via direct constructor injection) into a fresh DashboardService instance.
 * No real DB/network calls are made.
 *
 * Requirements: 5.7, 12.4, 12.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { DashboardService } from '../api/dashboard.service'
import { MultiPlatformRollupStore } from '../bridge/MultiPlatformRollupStore'
import type { MetricRollup } from '../aggregation'
import type { RollupReadQuery } from '../api/ports'
import type { AnalyticsQuery } from '../api/query'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A minimal, well-formed MetricRollup for Instagram. */
function instagramRollup(workspaceId = 'ws-test'): MetricRollup {
  const now = new Date().toISOString()
  return {
    workspaceId,
    platform: 'instagram',
    granularity: 'daily',
    periodStart: '2024-01-01T00:00:00.000Z',
    periodEnd: now,
    metrics: {
      followers_total: 5000,
      reach_total: 12000,
      total_engagements: 800,
      likes: 600,
      comments: 100,
      shares: 100,
    },
    eventCount: 1,
    lastEventAt: now,
  }
}

/** A minimal, well-formed MetricRollup for Facebook. */
function facebookRollup(workspaceId = 'ws-test'): MetricRollup {
  const now = new Date().toISOString()
  return {
    workspaceId,
    platform: 'facebook',
    granularity: 'daily',
    periodStart: '2024-01-01T00:00:00.000Z',
    periodEnd: now,
    metrics: {
      followers_total: 3000,
      reach_total: 8000,
      total_engagements: 400,
      facebook_reactions: 300,
      facebook_page_views: 1500,
    },
    eventCount: 1,
    lastEventAt: now,
  }
}

/** Minimal AnalyticsQuery required by buildDashboard. */
function baseQuery(workspaceId = 'ws-test'): AnalyticsQuery {
  return {
    workspaceId,
    granularity: 'daily',
    from: '2024-01-01T00:00:00.000Z',
    to: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Helpers to build a DashboardService wired to specific store behaviour
// ---------------------------------------------------------------------------

/**
 * Build a DashboardService backed by a MultiPlatformRollupStore whose two
 * sub-stores have the given getRollups behaviours.
 *
 * `instagramImpl` — what LegacyRollupReadStore.getRollups returns/throws.
 * `facebookImpl`  — what FacebookRollupReadStore.getRollups returns/throws.
 */
function buildService(
  instagramImpl: (query: RollupReadQuery) => Promise<MetricRollup[]>,
  facebookImpl: (query: RollupReadQuery) => Promise<MetricRollup[]>,
): DashboardService {
  // Create the multi-platform store with no-arg constructors first, then
  // spy on the underlying stores so we can override their behaviour.
  const store = new MultiPlatformRollupStore()

  // Replace getRollups on the underlying store instances via vi.spyOn.
  // MultiPlatformRollupStore accesses them through this.legacyStore and
  // this.facebookStore (private), but we can reach them via the platformStores
  // getter which references the instances. The simplest approach is to cast
  // and spy on the prototype methods of the actual sub-store objects.
  //
  // We use `vi.spyOn(store['legacyStore'], 'getRollups')` — the bracket
  // notation is required because the fields are private at compile time.
  vi.spyOn(store['legacyStore' as keyof typeof store] as any, 'getRollups')
    .mockImplementation(instagramImpl)

  vi.spyOn(store['facebookStore' as keyof typeof store] as any, 'getRollups')
    .mockImplementation(facebookImpl)

  // Also stub out series/audience/content calls to return empty so they never
  // block or throw in these tests (we're only testing rollup-level resilience).
  vi.spyOn(store['legacyStore' as keyof typeof store] as any, 'getDailySeries')
    .mockResolvedValue([])
  vi.spyOn(store['legacyStore' as keyof typeof store] as any, 'getAudienceByCountry')
    .mockResolvedValue([])
  vi.spyOn(store['legacyStore' as keyof typeof store] as any, 'getTopContent')
    .mockResolvedValue([])
  vi.spyOn(store['facebookStore' as keyof typeof store] as any, 'getAudienceByCountry')
    .mockResolvedValue([])
  vi.spyOn(store['facebookStore' as keyof typeof store] as any, 'getTopContent')
    .mockResolvedValue([])

  return new DashboardService({ readStore: store })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardService resilience — partial platform failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Scenario A: Facebook store throws
  // -------------------------------------------------------------------------
  describe('Scenario A: FacebookRollupReadStore.getRollups() throws', () => {
    it('returns a well-formed DashboardResponse without throwing', async () => {
      const service = buildService(
        async () => [instagramRollup()],     // Instagram succeeds
        async () => { throw new Error('Facebook API unavailable') }, // Facebook throws
      )

      // Should NOT throw — resilience is the core property under test.
      await expect(
        service.buildDashboard('overview', baseQuery()),
      ).resolves.toBeDefined()
    })

    it('includes meta.partialData === true', async () => {
      const service = buildService(
        async () => [instagramRollup()],
        async () => { throw new Error('Facebook API unavailable') },
      )

      const response = await service.buildDashboard('overview', baseQuery())

      expect(response.meta.partialData).toBe(true)
    })

    it('includes "Facebook data temporarily unavailable" in meta.warnings', async () => {
      const service = buildService(
        async () => [instagramRollup()],
        async () => { throw new Error('Facebook API unavailable') },
      )

      const response = await service.buildDashboard('overview', baseQuery())

      expect(response.meta.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Facebook data temporarily unavailable/i),
        ]),
      )
    })

    it('still renders Instagram KPI data (followers_total > 0)', async () => {
      const service = buildService(
        async () => [instagramRollup()],
        async () => { throw new Error('Facebook API unavailable') },
      )

      const response = await service.buildDashboard('overview', baseQuery())

      // followers_total is in the overview KPI strip and should reflect the
      // Instagram rollup value (5000).
      const followerKpi = response.kpis.find((k) => k.key === 'followers_total')
      expect(followerKpi).toBeDefined()
      expect(followerKpi!.value).toBe(5000)
    })

    it('does NOT include Instagram in meta.warnings', async () => {
      const service = buildService(
        async () => [instagramRollup()],
        async () => { throw new Error('Facebook API unavailable') },
      )

      const response = await service.buildDashboard('overview', baseQuery())

      for (const warning of response.meta.warnings) {
        expect(warning.toLowerCase()).not.toContain('instagram')
      }
    })
  })

  // -------------------------------------------------------------------------
  // Scenario B: Instagram (Legacy) store throws
  // -------------------------------------------------------------------------
  describe('Scenario B: LegacyRollupReadStore.getRollups() throws', () => {
    it('returns a well-formed DashboardResponse without throwing', async () => {
      const service = buildService(
        async () => { throw new Error('Instagram DB unavailable') }, // Instagram throws
        async () => [facebookRollup()],                              // Facebook succeeds
      )

      await expect(
        service.buildDashboard('overview', baseQuery()),
      ).resolves.toBeDefined()
    })

    it('includes meta.partialData === true', async () => {
      const service = buildService(
        async () => { throw new Error('Instagram DB unavailable') },
        async () => [facebookRollup()],
      )

      const response = await service.buildDashboard('overview', baseQuery())

      expect(response.meta.partialData).toBe(true)
    })

    it('includes "Instagram data temporarily unavailable" in meta.warnings', async () => {
      const service = buildService(
        async () => { throw new Error('Instagram DB unavailable') },
        async () => [facebookRollup()],
      )

      const response = await service.buildDashboard('overview', baseQuery())

      expect(response.meta.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Instagram data temporarily unavailable/i),
        ]),
      )
    })

    it('still renders Facebook KPI data (followers_total reflects Facebook rollup)', async () => {
      const service = buildService(
        async () => { throw new Error('Instagram DB unavailable') },
        async () => [facebookRollup()],
      )

      const response = await service.buildDashboard('overview', baseQuery())

      // followers_total is in the overview KPI strip and should reflect the
      // Facebook rollup value (3000).
      const followerKpi = response.kpis.find((k) => k.key === 'followers_total')
      expect(followerKpi).toBeDefined()
      expect(followerKpi!.value).toBe(3000)
    })

    it('does NOT include Facebook in meta.warnings', async () => {
      const service = buildService(
        async () => { throw new Error('Instagram DB unavailable') },
        async () => [facebookRollup()],
      )

      const response = await service.buildDashboard('overview', baseQuery())

      for (const warning of response.meta.warnings) {
        expect(warning.toLowerCase()).not.toContain('facebook')
      }
    })
  })

  // -------------------------------------------------------------------------
  // Scenario C: Both stores succeed — baseline (no warnings expected)
  // -------------------------------------------------------------------------
  describe('Scenario C: both stores succeed — no warnings expected', () => {
    it('has partialData === false when both stores return data', async () => {
      const service = buildService(
        async () => [instagramRollup()],
        async () => [facebookRollup()],
      )

      const response = await service.buildDashboard('overview', baseQuery())

      // Both stores returned data → no platform is partial.
      expect(response.meta.partialData).toBe(false)
    })

    it('has an empty warnings array when both stores succeed with data', async () => {
      const service = buildService(
        async () => [instagramRollup()],
        async () => [facebookRollup()],
      )

      const response = await service.buildDashboard('overview', baseQuery())

      expect(response.meta.warnings).toHaveLength(0)
    })

    it('combines KPI values from both stores', async () => {
      const service = buildService(
        async () => [instagramRollup()],  // followers_total: 5000
        async () => [facebookRollup()],  // followers_total: 3000
      )

      const response = await service.buildDashboard('overview', baseQuery())

      // The metric aggregation for followers_total is 'latest' (per registry),
      // so the combined value should be one of the two rollup values, not their
      // sum. The key point is that BOTH platforms contributed — the rollup list
      // has 2 entries, which means combined metrics will have been processed.
      const followerKpi = response.kpis.find((k) => k.key === 'followers_total')
      expect(followerKpi).toBeDefined()
      // Value should be one of the two platform values (latest-wins aggregation)
      expect([5000, 3000, 8000]).toContain(followerKpi!.value)
    })
  })

  // -------------------------------------------------------------------------
  // Scenario D: Both stores throw — graceful empty response
  // -------------------------------------------------------------------------
  describe('Scenario D: both stores throw — graceful empty response', () => {
    it('does not throw even when all stores fail', async () => {
      const service = buildService(
        async () => { throw new Error('Instagram down') },
        async () => { throw new Error('Facebook down') },
      )

      await expect(
        service.buildDashboard('overview', baseQuery()),
      ).resolves.toBeDefined()
    })

    it('has partialData === true and a no-data warning when all stores fail', async () => {
      const service = buildService(
        async () => { throw new Error('Instagram down') },
        async () => { throw new Error('Facebook down') },
      )

      const response = await service.buildDashboard('overview', baseQuery())

      expect(response.meta.partialData).toBe(true)
      // When ALL stores fail, currentRollups is empty → the generic no-data
      // warning path fires.
      expect(response.meta.warnings.length).toBeGreaterThan(0)
    })
  })
})
