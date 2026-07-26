/**
 * Tests for MeasureService (MEASURE stage — record goal-metric progress).
 *
 * Unit tests pin the concrete behaviours of `measure`:
 *   - happy path: reads the current goal-metric value from analytics and appends
 *     a `{ at, value }` progress point to the Mission history (R3.4);
 *   - metric extraction: `followers` / `engagement` / `reach` map to the right
 *     performance-summary fields, with `overview.*` fallbacks;
 *   - per-slot performance: published slots are reported with their metadata and,
 *     when a reader is supplied, their per-post metrics;
 *   - graceful degradation: analytics unavailable → no progress point, a failure
 *     Audit_Record, `recorded:false`, and per-slot performance still returned;
 *   - never throws, even when the slot store, progress store, or audit transport
 *     fail.
 *
 * A property test asserts the recorded progress value always equals the value
 * extracted from the goal metric across arbitrary summaries and metrics.
 *
 * Satisfies Requirements: 3.4
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  MeasureService,
  extractGoalMetricValue,
  DEFAULT_MEASURE_ANALYTICS_DAYS,
  type MeasureMissionInput,
  type MeasureServiceOptions,
  type SlotMetrics,
} from './MeasureService'
import type { PerformanceSummary } from './SenseService'
import type { IContentSlot, MissionMetric } from '../../db/models'
import type { AuditRecordInput } from '../AutoPilotAuditService'

// ─── Fixtures ─────────────────────────────────────────────────────────────

function mission(metric: MissionMetric = 'followers'): MeasureMissionInput {
  return { _id: 'mission-1', workspaceId: 'ws-1', goal: { metric } }
}

/** A minimal but structurally-valid performance summary. */
function summary(overrides: Record<string, unknown> = {}): PerformanceSummary {
  return {
    overview: {
      totalViews: 100,
      totalLikes: 10,
      totalComments: 2,
      totalShares: 1,
      avgEngagement: 5,
      totalReach: 80,
      latestFollowers: 1000,
      totalFollowers: 1000,
      followerGains: 5,
      followerLosses: 1,
    },
    reach: 80,
    followers: 1000,
    growthDelta: 4,
    engagement: 5,
    posts: 3,
    period: '30D',
    growth: null,
    dailyMetrics: [],
    ...overrides,
  } as unknown as PerformanceSummary
}

/** A published slot fixture. */
function slot(partial: Partial<IContentSlot> & { _id: string }): IContentSlot {
  return {
    format: 'reel',
    theme: 'protein reels',
    scheduledAt: new Date('2024-01-01T00:00:00Z'),
    status: 'published',
    ...partial,
  } as unknown as IContentSlot
}

/** Collects the progress points appended. */
function recordingProgressStore() {
  const calls: Array<{ missionId: string; point: { at: Date; value: number } }> = []
  const appendProgress = vi.fn(async (missionId: string, point: { at: Date; value: number }) => {
    calls.push({ missionId, point })
    return { _id: missionId }
  })
  return { appendProgress, calls }
}

/** Collects the audit records MEASURE writes. */
function recordingAudit() {
  const calls: AuditRecordInput[] = []
  const record = vi.fn(async (input: AuditRecordInput) => {
    calls.push(input)
    return { recorded: true, escalated: false }
  })
  return { record, calls }
}

/** Build a MeasureService with sensible test defaults, overridable per test. */
function makeService(overrides: MeasureServiceOptions = {}) {
  const progressStore = overrides.progressStore ?? recordingProgressStore()
  const audit = overrides.auditService ?? recordingAudit()
  const svc = new MeasureService({
    analyticsReader: { getPerformanceSummary: vi.fn(async () => summary()) },
    slotStore: { findByMissionAndStatus: vi.fn(async () => []) },
    progressStore: progressStore as any,
    auditService: audit as any,
    ...overrides,
  })
  return {
    svc,
    progressStore: progressStore as ReturnType<typeof recordingProgressStore>,
    audit: audit as ReturnType<typeof recordingAudit>,
  }
}

const NOW = Date.parse('2024-06-01T12:00:00Z')

// ─── Happy path (R3.4) ────────────────────────────────────────────────────

describe('MeasureService.measure — happy path (R3.4)', () => {
  it('records the current goal-metric value as a progress point', async () => {
    const { svc, progressStore } = makeService()

    const result = await svc.measure(mission('followers'), { now: NOW })

    expect(result.analyticsAvailable).toBe(true)
    expect(result.recorded).toBe(true)
    expect(result.metric).toBe('followers')
    expect(result.value).toBe(1000)
    expect(result.at.getTime()).toBe(NOW)

    // R3.4: exactly one progress point appended with the measured value + time.
    expect(progressStore.appendProgress).toHaveBeenCalledTimes(1)
    expect(progressStore.calls[0].missionId).toBe('mission-1')
    expect(progressStore.calls[0].point.value).toBe(1000)
    expect(progressStore.calls[0].point.at.getTime()).toBe(NOW)
  })

  it('reads analytics scoped to the workspace with the default window', async () => {
    const getPerformanceSummary = vi.fn(async () => summary())
    const { svc } = makeService({ analyticsReader: { getPerformanceSummary } })

    await svc.measure(mission(), {})

    expect(getPerformanceSummary).toHaveBeenCalledWith('ws-1', DEFAULT_MEASURE_ANALYTICS_DAYS)
  })

  it('honours a custom analytics look-back window', async () => {
    const getPerformanceSummary = vi.fn(async () => summary())
    const { svc } = makeService({ analyticsReader: { getPerformanceSummary } })

    await svc.measure(mission(), { analyticsDays: 7 })

    expect(getPerformanceSummary).toHaveBeenCalledWith('ws-1', 7)
  })
})

// ─── Metric extraction ────────────────────────────────────────────────────

describe('MeasureService — goal-metric extraction', () => {
  it('extracts engagement from the summary', async () => {
    const { svc } = makeService({
      analyticsReader: { getPerformanceSummary: vi.fn(async () => summary({ engagement: 42 })) },
    })
    const result = await svc.measure(mission('engagement'), {})
    expect(result.value).toBe(42)
  })

  it('extracts reach from the summary', async () => {
    const { svc } = makeService({
      analyticsReader: { getPerformanceSummary: vi.fn(async () => summary({ reach: 777 })) },
    })
    const result = await svc.measure(mission('reach'), {})
    expect(result.value).toBe(777)
  })

  it('falls back to overview.* when the top-level field is absent', () => {
    const s = summary({ followers: undefined, reach: undefined, engagement: undefined })
    expect(extractGoalMetricValue(s, 'followers')).toBe(1000) // overview.latestFollowers
    expect(extractGoalMetricValue(s, 'reach')).toBe(80) // overview.totalReach
    expect(extractGoalMetricValue(s, 'engagement')).toBe(5) // overview.avgEngagement
  })

  it('returns null when no usable value is present', () => {
    const empty = { overview: {} } as unknown as PerformanceSummary
    expect(extractGoalMetricValue(empty, 'followers')).toBeNull()
    expect(extractGoalMetricValue(null, 'reach')).toBeNull()
  })

  it('records a zero value (a valid measurement, not a missing one)', async () => {
    const { svc, progressStore } = makeService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () =>
          summary({ followers: 0, overview: { latestFollowers: 0 } }),
        ),
      },
    })
    const result = await svc.measure(mission('followers'), {})
    expect(result.value).toBe(0)
    expect(result.recorded).toBe(true)
    expect(progressStore.calls[0].point.value).toBe(0)
  })
})

// ─── Per-slot performance ─────────────────────────────────────────────────

describe('MeasureService — per-slot performance', () => {
  it('reports published slots with their metadata', async () => {
    const slots = [
      slot({ _id: 'slot-a', format: 'reel', theme: 'A', contentId: 'content-a' as any }),
      slot({ _id: 'slot-b', format: 'carousel', theme: 'B' }),
    ]
    const { svc } = makeService({
      slotStore: { findByMissionAndStatus: vi.fn(async () => slots) },
    })

    const result = await svc.measure(mission(), {})

    expect(result.perSlot).toHaveLength(2)
    expect(result.perSlot[0]).toMatchObject({ slotId: 'slot-a', format: 'reel', theme: 'A', contentId: 'content-a' })
    expect(result.perSlot[1]).toMatchObject({ slotId: 'slot-b', format: 'carousel', theme: 'B' })
    expect(result.perSlot[1].contentId).toBeUndefined()
  })

  it('queries only published slots', async () => {
    const findByMissionAndStatus = vi.fn(async () => [])
    const { svc } = makeService({ slotStore: { findByMissionAndStatus } })

    await svc.measure(mission(), {})

    expect(findByMissionAndStatus).toHaveBeenCalledWith('mission-1', 'published')
  })

  it('attaches per-post metrics when a reader is supplied', async () => {
    const metrics: SlotMetrics = { reach: 500, engagement: 30, likes: 40 }
    const { svc } = makeService({
      slotStore: { findByMissionAndStatus: vi.fn(async () => [slot({ _id: 'slot-a' })]) },
      slotPerformanceReader: { read: vi.fn(async () => metrics) },
    })

    const result = await svc.measure(mission(), {})

    expect(result.perSlot[0].metrics).toEqual(metrics)
  })

  it('omits metrics when the reader returns null or throws', async () => {
    const { svc } = makeService({
      slotStore: {
        findByMissionAndStatus: vi.fn(async () => [slot({ _id: 'slot-a' }), slot({ _id: 'slot-b' })]),
      },
      slotPerformanceReader: {
        read: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockRejectedValueOnce(new Error('metrics api down')),
      },
    })

    const result = await svc.measure(mission(), {})

    expect(result.perSlot[0].metrics).toBeUndefined()
    expect(result.perSlot[1].metrics).toBeUndefined()
    // The metric value was still recorded despite per-slot metrics failing.
    expect(result.recorded).toBe(true)
  })
})

// ─── Graceful degradation ─────────────────────────────────────────────────

describe('MeasureService.measure — degrades when analytics is unavailable', () => {
  it('skips the progress point and records a failure when analytics throws', async () => {
    const { svc, progressStore, audit } = makeService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () => {
          throw new Error('insights api down')
        }),
      },
    })

    const result = await svc.measure(mission(), { now: NOW })

    expect(result.analyticsAvailable).toBe(false)
    expect(result.recorded).toBe(false)
    expect(result.value).toBeUndefined()
    expect(progressStore.appendProgress).not.toHaveBeenCalled()

    const failure = audit.calls.find((c) => c.action === 'measure.metric-unavailable')
    expect(failure).toBeDefined()
    expect(failure?.stage).toBe('MEASURE')
    expect(failure?.outcome).toBe('failure')
  })

  it('treats a null summary as unavailable', async () => {
    const { svc, progressStore } = makeService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () => null as unknown as PerformanceSummary),
      },
    })

    const result = await svc.measure(mission(), {})

    expect(result.recorded).toBe(false)
    expect(progressStore.appendProgress).not.toHaveBeenCalled()
  })

  it('treats a summary with no goal-metric value as unavailable', async () => {
    const { svc } = makeService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () =>
          summary({ followers: undefined, overview: {} }),
        ),
      },
    })

    const result = await svc.measure(mission('followers'), {})

    expect(result.recorded).toBe(false)
    expect(result.analyticsAvailable).toBe(false)
  })

  it('still returns per-slot performance on a degraded iteration', async () => {
    const { svc } = makeService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () => {
          throw new Error('down')
        }),
      },
      slotStore: { findByMissionAndStatus: vi.fn(async () => [slot({ _id: 'slot-a' })]) },
    })

    const result = await svc.measure(mission(), {})

    expect(result.recorded).toBe(false)
    expect(result.perSlot).toHaveLength(1)
    expect(result.perSlot[0].slotId).toBe('slot-a')
  })

  it('records a failure when appending the progress point fails', async () => {
    const progressStore = {
      appendProgress: vi.fn(async () => {
        throw new Error('mongo write failed')
      }),
    }
    const { svc, audit } = makeService({ progressStore: progressStore as any })

    const result = await svc.measure(mission(), {})

    expect(result.analyticsAvailable).toBe(true)
    expect(result.recorded).toBe(false)
    expect(audit.calls.some((c) => c.action === 'measure.progress-record-failed')).toBe(true)
  })

  it('degrades to no per-slot performance when the slot store fails', async () => {
    const { svc } = makeService({
      slotStore: {
        findByMissionAndStatus: vi.fn(async () => {
          throw new Error('slot query failed')
        }),
      },
    })

    const result = await svc.measure(mission(), {})

    expect(result.perSlot).toEqual([])
    // The metric value was still recorded.
    expect(result.recorded).toBe(true)
  })

  it('never throws even when analytics, slots, and audit all fail', async () => {
    const svc = new MeasureService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () => {
          throw new Error('down')
        }),
      },
      slotStore: {
        findByMissionAndStatus: vi.fn(async () => {
          throw new Error('down')
        }),
      },
      progressStore: { appendProgress: vi.fn(async () => ({})) },
      auditService: {
        record: vi.fn(async () => {
          throw new Error('audit blew up')
        }),
      } as any,
    })

    const result = await svc.measure(mission(), {})

    expect(result.recorded).toBe(false)
    expect(result.analyticsAvailable).toBe(false)
    expect(result.perSlot).toEqual([])
  })
})

// ─── Property: recorded value equals the extracted goal-metric value (R3.4) ──
// **Validates: Requirements 3.4**
describe('Property — the recorded progress value equals the extracted goal-metric value', () => {
  it('appends exactly the extracted value whenever a value is available', async () => {
    const metricArb = fc.constantFrom<MissionMetric>('followers', 'engagement', 'reach')
    const valueArb = fc.integer({ min: 0, max: 100_000_000 })

    await fc.assert(
      fc.asyncProperty(metricArb, valueArb, async (metric, v) => {
        // Build a summary whose top-level field for `metric` is exactly `v`.
        const overrides: Record<string, unknown> = { followers: 0, reach: 0, engagement: 0 }
        overrides[metric] = v
        const s = summary(overrides)

        const progressStore = recordingProgressStore()
        const svc = new MeasureService({
          analyticsReader: { getPerformanceSummary: vi.fn(async () => s) },
          slotStore: { findByMissionAndStatus: vi.fn(async () => []) },
          progressStore: progressStore as any,
          auditService: recordingAudit() as any,
        })

        const expected = extractGoalMetricValue(s, metric)
        const result = await svc.measure(mission(metric), {})

        expect(result.value).toBe(expected)
        expect(result.recorded).toBe(true)
        expect(progressStore.calls).toHaveLength(1)
        expect(progressStore.calls[0].point.value).toBe(expected)
      }),
      { numRuns: 200 },
    )
  })
})
