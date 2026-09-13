/**
 * Tests for LearnService (LEARN stage — update strategy memory from measured results).
 *
 * Unit tests pin the concrete behaviours:
 *   - deriveInsights: aggregates per-slot performance by format and theme, ranks
 *     by the goal-aligned metric, and picks the best format/theme (R2.6);
 *   - metric alignment: `reach`/`engagement` score by their field, `followers`
 *     scores by engagement (per-post proxy);
 *   - no signal: returns null when no measured slot carries a usable score;
 *   - persistence: `learn` appends exactly the derived insight via the store;
 *   - graceful degradation: no signal → not persisted; store write fails → a
 *     failure Audit_Record, `learned:false`, insight still returned; never throws.
 *
 * A property test asserts derivation is pure/deterministic over its inputs — the
 * same MeasureResult always yields an identical insight.
 *
 * Satisfies Requirements: 2.6
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  LearnService,
  deriveInsights,
  scoreFieldForMetric,
  LEARN_INSIGHT_VERSION,
  type DerivableMeasureResult,
  type LearnMissionInput,
  type LearnServiceOptions,
} from './LearnService'
import type { SlotPerformance, SlotMetrics } from './MeasureService'
import type { ContentFormat, MissionMetric } from '../../db/models'
import type { AuditRecordInput } from '../AutoPilotAuditService'

// ─── Fixtures ─────────────────────────────────────────────────────────────

function mission(): LearnMissionInput {
  return { _id: 'mission-1', workspaceId: 'ws-1' }
}

const AT = new Date('2024-06-01T12:00:00Z')

function perf(
  slotId: string,
  format: ContentFormat,
  theme: string,
  metrics?: SlotMetrics,
): SlotPerformance {
  const entry: SlotPerformance = {
    slotId,
    format,
    theme,
    scheduledAt: new Date('2024-05-01T00:00:00Z'),
  }
  if (metrics) entry.metrics = metrics
  return entry
}

function measure(
  metric: MissionMetric,
  perSlot: SlotPerformance[],
  value?: number,
): DerivableMeasureResult {
  return { metric, value, at: AT, perSlot }
}

function recordingMemoryStore() {
  const calls: Array<{ missionId: string; insight: Record<string, unknown> }> = []
  const appendStrategyMemory = vi.fn(
    async (missionId: string, insight: Record<string, unknown>) => {
      calls.push({ missionId, insight })
      return { _id: missionId }
    },
  )
  return { appendStrategyMemory, calls }
}

function recordingAudit() {
  const calls: AuditRecordInput[] = []
  const record = vi.fn(async (input: AuditRecordInput) => {
    calls.push(input)
    return { recorded: true, escalated: false }
  })
  return { record, calls }
}

function makeService(overrides: LearnServiceOptions = {}) {
  const memoryStore = overrides.memoryStore ?? recordingMemoryStore()
  const audit = overrides.auditService ?? recordingAudit()
  const svc = new LearnService({
    memoryStore: memoryStore as any,
    auditService: audit as any,
    ...overrides,
  })
  return {
    svc,
    memoryStore: memoryStore as ReturnType<typeof recordingMemoryStore>,
    audit: audit as ReturnType<typeof recordingAudit>,
  }
}

// ─── deriveInsights — aggregation + ranking (R2.6) ──────────────────────────

describe('deriveInsights — aggregates and ranks measured performance (R2.6)', () => {
  it('ranks formats by the goal-aligned metric and picks the best', () => {
    const result = measure('engagement', [
      perf('a', 'reel', 'protein', { engagement: 40, reach: 500 }),
      perf('b', 'reel', 'protein', { engagement: 60, reach: 700 }),
      perf('c', 'carousel', 'recipes', { engagement: 5, reach: 300 }),
    ])

    const insight = deriveInsights(result)!

    expect(insight).not.toBeNull()
    expect(insight.version).toBe(LEARN_INSIGHT_VERSION)
    expect(insight.metric).toBe('engagement')
    expect(insight.scoredBy).toBe('engagement')
    expect(insight.sampleSize).toBe(3)
    expect(insight.measuredAt).toBe(AT.toISOString())

    // reel avg engagement = 50, carousel = 5 → reel ranks first.
    expect(insight.byFormat.map((f) => f.format)).toEqual(['reel', 'carousel'])
    expect(insight.byFormat[0]).toMatchObject({
      format: 'reel',
      samples: 2,
      avgScore: 50,
      avgReach: 600,
      avgEngagement: 50,
    })
    expect(insight.bestFormat?.format).toBe('reel')
    expect(insight.bestTheme?.theme).toBe('protein')
  })

  it('scores followers goal by engagement (per-post proxy)', () => {
    expect(scoreFieldForMetric('followers')).toBe('engagement')
    const insight = deriveInsights(
      measure('followers', [perf('a', 'reel', 't', { engagement: 12, reach: 1 })]),
    )!
    expect(insight.scoredBy).toBe('engagement')
    expect(insight.bestFormat?.avgScore).toBe(12)
  })

  it('scores reach goal by reach', () => {
    const insight = deriveInsights(
      measure('reach', [
        perf('a', 'photo', 't', { reach: 100, engagement: 999 }),
        perf('b', 'reel', 't', { reach: 200, engagement: 1 }),
      ]),
    )!
    expect(insight.scoredBy).toBe('reach')
    // reel has higher reach despite lower engagement.
    expect(insight.bestFormat?.format).toBe('reel')
  })

  it('includes the goal value when present and omits it otherwise', () => {
    const withValue = deriveInsights(
      measure('reach', [perf('a', 'reel', 't', { reach: 10 })], 1234),
    )!
    expect(withValue.goalValue).toBe(1234)

    const withoutValue = deriveInsights(
      measure('reach', [perf('a', 'reel', 't', { reach: 10 })]),
    )!
    expect(withoutValue.goalValue).toBeUndefined()
  })

  it('breaks ties deterministically by name ascending', () => {
    const insight = deriveInsights(
      measure('reach', [
        perf('a', 'reel', 'zebra', { reach: 10 }),
        perf('b', 'carousel', 'apple', { reach: 10 }),
      ]),
    )!
    // Equal avgScore → format sorted ascending: carousel before reel.
    expect(insight.byFormat.map((f) => f.format)).toEqual(['carousel', 'reel'])
    // Themes equal avgScore → apple before zebra.
    expect(insight.byTheme.map((t) => t.theme)).toEqual(['apple', 'zebra'])
  })

  it('produces a human-readable summary', () => {
    const insight = deriveInsights(
      measure('engagement', [
        perf('a', 'reel', 'protein', { engagement: 40 }),
        perf('b', 'carousel', 'protein', { engagement: 5 }),
      ]),
    )!
    expect(insight.summary).toContain('reel led on engagement')
    expect(insight.summary).toContain('carousel next')
    expect(insight.summary).toContain('protein')
  })

  it('ignores slots without metrics or without the goal-aligned field', () => {
    const insight = deriveInsights(
      measure('reach', [
        perf('a', 'reel', 't', { reach: 100 }),
        perf('b', 'photo', 't'), // no metrics
        perf('c', 'photo', 't', { engagement: 5 }), // no reach field
      ]),
    )!
    expect(insight.sampleSize).toBe(1)
    expect(insight.byFormat).toHaveLength(1)
    expect(insight.byFormat[0].format).toBe('reel')
  })

  it('returns null when no measured slot has a usable goal-aligned score', () => {
    expect(deriveInsights(measure('reach', []))).toBeNull()
    expect(deriveInsights(measure('reach', [perf('a', 'reel', 't')]))).toBeNull()
    expect(
      deriveInsights(measure('reach', [perf('a', 'reel', 't', { engagement: 5 })])),
    ).toBeNull()
  })
})

// ─── learn — persistence (R2.6) ─────────────────────────────────────────────

describe('LearnService.learn — persists the insight to strategy memory (R2.6)', () => {
  it('appends exactly the derived insight and reports learned:true', async () => {
    const { svc, memoryStore } = makeService()
    const result = measure('engagement', [
      perf('a', 'reel', 'protein', { engagement: 40 }),
    ])

    const learnResult = await svc.learn(mission(), result)

    expect(learnResult.learned).toBe(true)
    expect(learnResult.insight).not.toBeNull()
    expect(memoryStore.appendStrategyMemory).toHaveBeenCalledTimes(1)
    expect(memoryStore.calls[0].missionId).toBe('mission-1')
    expect(memoryStore.calls[0].insight).toBe(learnResult.insight as unknown as Record<string, unknown>)
  })

  it('does not persist and reports learned:false when there is no signal', async () => {
    const { svc, memoryStore, audit } = makeService()

    const learnResult = await svc.learn(mission(), measure('reach', []))

    expect(learnResult.learned).toBe(false)
    expect(learnResult.insight).toBeNull()
    expect(memoryStore.appendStrategyMemory).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('records a failure Audit_Record and returns the insight when the store fails', async () => {
    const memoryStore = {
      appendStrategyMemory: vi.fn(async () => {
        throw new Error('mongo write failed')
      }),
    }
    const { svc, audit } = makeService({ memoryStore: memoryStore as any })

    const learnResult = await svc.learn(
      mission(),
      measure('reach', [perf('a', 'reel', 't', { reach: 100 })]),
    )

    expect(learnResult.learned).toBe(false)
    expect(learnResult.insight).not.toBeNull() // insight still derived + returned
    const failure = audit.calls.find((c) => c.action === 'learn.memory-record-failed')
    expect(failure).toBeDefined()
    expect(failure?.stage).toBe('LEARN')
    expect(failure?.outcome).toBe('failure')
  })

  it('never throws even when the store and audit both fail', async () => {
    const svc = new LearnService({
      memoryStore: {
        appendStrategyMemory: vi.fn(async () => {
          throw new Error('store down')
        }),
      } as any,
      auditService: {
        record: vi.fn(async () => {
          throw new Error('audit blew up')
        }),
      } as any,
    })

    const learnResult = await svc.learn(
      mission(),
      measure('reach', [perf('a', 'reel', 't', { reach: 100 })]),
    )

    expect(learnResult.learned).toBe(false)
    expect(learnResult.insight).not.toBeNull()
  })
})

// ─── Property: derivation is pure/deterministic over inputs (R2.6) ──────────
// **Validates: Requirements 2.6**
describe('Property — deriveInsights is deterministic/pure over its inputs', () => {
  it('yields an identical insight for the same MeasureResult across runs', () => {
    const metricArb = fc.constantFrom<MissionMetric>('followers', 'engagement', 'reach')
    const formatArb = fc.constantFrom<ContentFormat>('reel', 'photo', 'carousel', 'story')
    const themeArb = fc.constantFrom('protein', 'recipes', 'travel', 'coding')
    const metricsArb = fc.record({
      reach: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: undefined }),
      engagement: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: undefined }),
      likes: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: undefined }),
    })
    const slotArb = fc.record({
      slotId: fc.string({ minLength: 1, maxLength: 6 }),
      format: formatArb,
      theme: themeArb,
      metrics: fc.option(metricsArb, { nil: undefined }),
    })

    fc.assert(
      fc.property(
        metricArb,
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.array(slotArb, { maxLength: 12 }),
        (metric, value, slots) => {
          const perSlot: SlotPerformance[] = slots.map((s) =>
            perf(s.slotId, s.format, s.theme, s.metrics as SlotMetrics | undefined),
          )
          const input = measure(metric, perSlot, value)

          const first = deriveInsights(input)
          const second = deriveInsights(input)

          // Pure: identical structural output on repeated calls.
          expect(second).toEqual(first)

          if (first !== null) {
            // Determinism of ranking: byFormat is sorted by avgScore desc, name asc.
            for (let i = 1; i < first.byFormat.length; i++) {
              const prev = first.byFormat[i - 1]
              const cur = first.byFormat[i]
              const ordered =
                prev.avgScore > cur.avgScore ||
                (prev.avgScore === cur.avgScore && prev.format.localeCompare(cur.format) <= 0)
              expect(ordered).toBe(true)
            }
            expect(first.bestFormat).toEqual(first.byFormat[0])
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
