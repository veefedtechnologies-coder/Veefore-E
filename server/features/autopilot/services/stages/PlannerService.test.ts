/**
 * Tests for PlannerService (PLAN stage).
 *
 * Unit tests pin the concrete behaviours:
 *   - produces Content_Slot docs covering ≥7 days (R2.5),
 *   - assigns each slot's source via ContentSourceResolver (task 9.1),
 *   - computes briefSendAt = scheduledAt − leadTime for user-brief slots (R7.2),
 *   - refreshes idempotently (a fully-planned mission adds nothing),
 *   - clamps a cadence that exceeds the cap to what the cap admits.
 *
 * The property test covers Property 2 (frequency cap never exceeded): for any
 * cadence, cap, window, and horizon, every slot the planner produces respects
 * the Mission's rolling-window posting-frequency cap.
 *
 * All I/O is faked (an in-memory slot store, a stub resolver, the real pure
 * LeadTimeEstimator + GuardrailService), so the scheduling logic is verified
 * without a database.
 *
 * Satisfies Requirements: 2.5, 2.7, 13.2 (Property 2)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  PlannerService,
  FORMAT_COMPLEXITY,
  MIN_PLANNING_HORIZON_DAYS,
  type PlannerMissionInput,
  type PlannerSlotStore,
  type PlannerPoolReader,
} from './PlannerService'
import type { Strategy } from './StrategyService'
import { GuardrailService, maxCountInAnyWindow } from '../GuardrailService'
import { LeadTimeEstimator } from '../LeadTimeEstimator'
import type { ContentSource, ResolverPoolItem } from '../ContentSourceResolver'
import type { IContentSlot } from '../../db/models'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const ITERATIONS = 300

let idCounter = 0

/** In-memory ContentSlot store recording every created doc. */
function makeStore(existing: Partial<IContentSlot>[] = []): PlannerSlotStore & {
  created: Partial<IContentSlot>[]
} {
  const created: Partial<IContentSlot>[] = []
  return {
    created,
    async findByMission() {
      return existing as IContentSlot[]
    },
    async create(doc: Partial<IContentSlot>) {
      const withId = { ...doc, _id: `slot-${++idCounter}` }
      created.push(withId)
      return withId as unknown as IContentSlot
    },
  }
}

/** A resolver stub that always returns a fixed source kind. */
function fixedResolver(source: ContentSource) {
  return {
    async resolve(): Promise<ContentSource> {
      return source
    },
  }
}

/** An empty media pool reader. */
const emptyPool: PlannerPoolReader = {
  async listAvailable() {
    return []
  },
}

function mission(
  overrides: Partial<PlannerMissionInput> = {},
  freq: { count: number; per: 'day' | 'week'; windowMs: number } = {
    count: 3,
    per: 'week',
    windowMs: WEEK_MS,
  },
): PlannerMissionInput {
  return {
    _id: 'mission-1',
    workspaceId: 'ws-1',
    contentSourcePreference: 'user-first',
    guardrails: { postingFrequency: freq, bannedTopics: [] },
    ...overrides,
  }
}

function strategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    themes: ['behind the scenes', 'tips'],
    cadence: { postsPer: 'week', count: 3 },
    growthActions: ['post consistently'],
    reducedInputs: false,
    ...overrides,
  }
}

const NOW = Date.UTC(2025, 0, 1, 0, 0, 0)

// ── Slot production + horizon coverage (R2.5) ───────────────────────────────

describe('PlannerService.plan — produces a Content_Plan covering ≥7 days (R2.5)', () => {
  it('creates slots and persists them with status "planned"', async () => {
    const store = makeStore()
    const planner = new PlannerService({
      slotStore: store,
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    const result = await planner.plan(mission(), strategy(), { now: NOW })

    expect(result.planned.length).toBeGreaterThan(0)
    expect(store.created).toHaveLength(result.planned.length)
    for (const doc of store.created) {
      expect(doc.status).toBe('planned')
      expect(doc.missionId).toBe('mission-1')
      expect(doc.workspaceId).toBe('ws-1')
    }
  })

  it('schedules all slots strictly in the future and within the horizon', async () => {
    const planner = new PlannerService({
      slotStore: makeStore(),
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    const result = await planner.plan(mission(), strategy(), { now: NOW })
    const horizonEndMs = NOW + MIN_PLANNING_HORIZON_DAYS * DAY_MS

    for (const slot of result.planned) {
      expect(slot.scheduledAt.getTime()).toBeGreaterThan(NOW)
      expect(slot.scheduledAt.getTime()).toBeLessThanOrEqual(horizonEndMs)
    }
    expect(result.horizonEnd.getTime()).toBe(horizonEndMs)
  })

  it('covers the full 7-day horizon (a daily cadence spans into the last days)', async () => {
    const planner = new PlannerService({
      slotStore: makeStore(),
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    // 1/day, cap 1/day → 7 slots across the week.
    const result = await planner.plan(
      mission({}, { count: 1, per: 'day', windowMs: DAY_MS }),
      strategy({ cadence: { postsPer: 'day', count: 1 } }),
      { now: NOW },
    )

    expect(result.planned.length).toBe(7)
    const last = Math.max(...result.planned.map((s) => s.scheduledAt.getTime()))
    // The plan reaches beyond day 6, i.e. genuinely covers ~7 days.
    expect(last).toBeGreaterThan(NOW + 6 * DAY_MS)
  })

  it('assigns themes and formats by round-robin over the strategy/rotation', async () => {
    const planner = new PlannerService({
      slotStore: makeStore(),
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    const result = await planner.plan(
      mission({}, { count: 1, per: 'day', windowMs: DAY_MS }),
      strategy({ themes: ['a', 'b'], cadence: { postsPer: 'day', count: 1 } }),
      { now: NOW },
    )

    // Themes alternate a, b, a, b, ...
    expect(result.planned.map((s) => s.theme).slice(0, 4)).toEqual(['a', 'b', 'a', 'b'])
    // Formats cycle reel, photo, carousel, reel, ...
    expect(result.planned.map((s) => s.format).slice(0, 4)).toEqual([
      'reel',
      'photo',
      'carousel',
      'reel',
    ])
  })
})

// ── Source assignment (task 9.1) ────────────────────────────────────────────

describe('PlannerService.plan — assigns each slot source via ContentSourceResolver', () => {
  it('records a pool source with the resolved media-pool item id', async () => {
    const store = makeStore()
    const planner = new PlannerService({
      slotStore: store,
      resolver: fixedResolver({ kind: 'pool', mediaPoolItemId: 'media-9' }),
      poolReader: emptyPool,
    })

    const result = await planner.plan(mission(), strategy(), { now: NOW })

    expect(result.planned.every((s) => s.source.kind === 'pool')).toBe(true)
    for (const doc of store.created) {
      expect(doc.source).toEqual({ kind: 'pool', mediaPoolItemId: 'media-9' })
    }
  })

  it('records an ai-generated source with no media id', async () => {
    const store = makeStore()
    const planner = new PlannerService({
      slotStore: store,
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    await planner.plan(mission(), strategy(), { now: NOW })

    for (const doc of store.created) {
      expect(doc.source).toEqual({ kind: 'ai-generated' })
    }
  })

  it('reads the workspace pool once and passes it to the resolver', async () => {
    const poolItems: ResolverPoolItem[] = [{ _id: 'm1', mediaType: 'video', available: true }]
    let reads = 0
    const poolReader: PlannerPoolReader = {
      async listAvailable() {
        reads++
        return poolItems
      },
    }
    let receivedPool: unknown
    const resolver = {
      async resolve(_m: unknown, _s: unknown, pool?: ResolverPoolItem[]): Promise<ContentSource> {
        receivedPool = pool
        return { kind: 'ai-generated' }
      },
    }

    const planner = new PlannerService({ slotStore: makeStore(), resolver, poolReader })
    await planner.plan(mission(), strategy(), { now: NOW })

    expect(reads).toBe(1)
    expect(receivedPool).toBe(poolItems)
  })
})

// ── briefSendAt computation for user-brief slots (R7.2) ─────────────────────

describe('PlannerService.plan — sets briefSendAt for user-brief slots (R7.2)', () => {
  it('computes briefSendAt = scheduledAt − leadTime using the format complexity', async () => {
    const estimator = new LeadTimeEstimator()
    const planner = new PlannerService({
      slotStore: makeStore(),
      resolver: fixedResolver({ kind: 'user-brief' }),
      leadTimeEstimator: estimator,
      poolReader: emptyPool,
    })

    const result = await planner.plan(
      mission({}, { count: 1, per: 'day', windowMs: DAY_MS }),
      strategy({ cadence: { postsPer: 'day', count: 1 } }),
      { now: NOW },
    )

    expect(result.planned.length).toBeGreaterThan(0)
    for (const slot of result.planned) {
      expect(slot.briefSendAt).toBeInstanceOf(Date)
      const expectedLead = estimator.estimate(slot.format, FORMAT_COMPLEXITY[slot.format])
      expect(slot.briefSendAt!.getTime()).toBe(slot.scheduledAt.getTime() - expectedLead)
      // The brief is sent before the publish slot.
      expect(slot.briefSendAt!.getTime()).toBeLessThan(slot.scheduledAt.getTime())
    }
  })

  it('does not set briefSendAt for non-brief sources', async () => {
    const planner = new PlannerService({
      slotStore: makeStore(),
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    const result = await planner.plan(mission(), strategy(), { now: NOW })
    expect(result.planned.every((s) => s.briefSendAt === undefined)).toBe(true)
  })
})

// ── Refresh / idempotency ───────────────────────────────────────────────────

describe('PlannerService.plan — refreshes without duplicating (idempotent)', () => {
  it('adds nothing when existing active slots already cover the horizon', async () => {
    // 3/week → target 3 over the 7-day horizon; pre-seed 3 in-horizon slots.
    const existing: Partial<IContentSlot>[] = [
      { scheduledAt: new Date(NOW + 1 * DAY_MS), status: 'planned' },
      { scheduledAt: new Date(NOW + 3 * DAY_MS), status: 'scheduled' },
      { scheduledAt: new Date(NOW + 5 * DAY_MS), status: 'published' },
    ]
    const store = makeStore(existing)
    const planner = new PlannerService({
      slotStore: store,
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    const result = await planner.plan(mission(), strategy(), { now: NOW })

    expect(result.existingActiveInHorizon).toBe(3)
    expect(result.planned).toHaveLength(0)
    expect(store.created).toHaveLength(0)
  })

  it('only fills the remaining gap up to the cadence target', async () => {
    const existing: Partial<IContentSlot>[] = [
      { scheduledAt: new Date(NOW + 1 * DAY_MS), status: 'planned' },
    ]
    const store = makeStore(existing)
    const planner = new PlannerService({
      slotStore: store,
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    // Target 3/week, 1 already present → creates 2.
    const result = await planner.plan(mission(), strategy(), { now: NOW })
    expect(result.planned).toHaveLength(2)
  })

  it('ignores cancelled/failed slots when counting coverage', async () => {
    const existing: Partial<IContentSlot>[] = [
      { scheduledAt: new Date(NOW + 1 * DAY_MS), status: 'cancelled' },
      { scheduledAt: new Date(NOW + 2 * DAY_MS), status: 'failed' },
    ]
    const store = makeStore(existing)
    const planner = new PlannerService({
      slotStore: store,
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    const result = await planner.plan(mission(), strategy(), { now: NOW })
    expect(result.existingActiveInHorizon).toBe(0)
    expect(result.planned).toHaveLength(3)
  })
})

// ── Cap clamping ────────────────────────────────────────────────────────────

describe('PlannerService.plan — clamps a cadence that exceeds the cap (R2.7)', () => {
  it('never schedules more than the cap allows even for an aggressive cadence', async () => {
    const store = makeStore()
    const planner = new PlannerService({
      slotStore: store,
      resolver: fixedResolver({ kind: 'ai-generated' }),
      poolReader: emptyPool,
    })

    // Cadence asks for 7/day (49 over the week) but cap is 2/week.
    const result = await planner.plan(
      mission({}, { count: 2, per: 'week', windowMs: WEEK_MS }),
      strategy({ cadence: { postsPer: 'day', count: 7 } }),
      { now: NOW },
    )

    const times = result.planned.map((s) => s.scheduledAt.getTime())
    expect(maxCountInAnyWindow(times, WEEK_MS)).toBeLessThanOrEqual(2)
  })
})

/**
 * Property 2 — Frequency cap never exceeded.
 *
 * For any cadence, posting-frequency cap, window length, and horizon, every slot
 * the planner produces (together with any pre-existing active slots it plans
 * around) respects the Mission's rolling-window cap: no window of length
 * `windowMs` ever holds more than `cap` scheduled actions.
 *
 * **Validates: Requirements 2.7, 13.2**
 */
describe('PlannerService — Property 2: frequency cap never exceeded', () => {
  const guardrail = new GuardrailService()

  it('every produced plan respects the cap across random cadences/caps/windows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // cap
        fc.constantFrom<'day' | 'week'>('day', 'week'), // window unit
        fc.integer({ min: 1, max: 10 }), // cadence count
        fc.constantFrom<'day' | 'week'>('day', 'week'), // cadence period
        fc.integer({ min: 7, max: 30 }), // horizon days
        async (cap, windowUnit, cadenceCount, cadencePeriod, horizonDays) => {
          const windowMs = windowUnit === 'day' ? DAY_MS : WEEK_MS
          const store = makeStore()
          const planner = new PlannerService({
            slotStore: store,
            resolver: fixedResolver({ kind: 'ai-generated' }),
            guardrailService: guardrail,
            poolReader: emptyPool,
          })

          const result = await planner.plan(
            mission({}, { count: cap, per: windowUnit, windowMs }),
            strategy({ cadence: { postsPer: cadencePeriod, count: cadenceCount } }),
            { now: NOW, horizonDays },
          )

          const times = result.planned.map((s) => s.scheduledAt.getTime())
          // Invariant: the produced plan never breaches the cap.
          expect(maxCountInAnyWindow(times, windowMs)).toBeLessThanOrEqual(cap)
        },
      ),
      { numRuns: ITERATIONS },
    )
  })

  it('respects the cap even when planning around pre-existing active slots', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }), // cap
        fc.integer({ min: 1, max: 8 }), // cadence/week
        fc.array(fc.integer({ min: 1, max: 30 * DAY_MS }), { maxLength: 10 }), // existing offsets
        async (cap, cadenceCount, existingOffsets) => {
          const windowMs = WEEK_MS
          // Pre-existing active slots — themselves within the cap by construction
          // is not guaranteed, so we only assert the *newly admitted* candidates
          // never create a fresh breach relative to what the guard sees.
          const existing: Partial<IContentSlot>[] = existingOffsets.map((off) => ({
            scheduledAt: new Date(NOW + off),
            status: 'planned' as const,
          }))
          const store = makeStore(existing)
          const planner = new PlannerService({
            slotStore: store,
            resolver: fixedResolver({ kind: 'ai-generated' }),
            guardrailService: guardrail,
            poolReader: emptyPool,
          })

          const result = await planner.plan(
            mission({}, { count: cap, per: 'week', windowMs }),
            strategy({ cadence: { postsPer: 'week', count: cadenceCount } }),
            { now: NOW, horizonDays: 14 },
          )

          // Each newly admitted slot passed the cap check against all existing +
          // previously admitted times, so no window of existing+new that INCLUDES
          // a new slot exceeds the cap.
          const existingTimes = existing.map((e) => (e.scheduledAt as Date).getTime())
          const newTimes = result.planned.map((s) => s.scheduledAt.getTime())
          for (let i = 0; i < newTimes.length; i++) {
            const upTo = [...existingTimes, ...newTimes.slice(0, i + 1)]
            expect(guardrail.wouldExceedFrequencyCap(
              { guardrails: { postingFrequency: { count: cap, windowMs } } },
              newTimes[i],
              [...existingTimes, ...newTimes.slice(0, i)],
            )).toBe(false)
            // And the running admitted-only schedule respects the cap.
            expect(maxCountInAnyWindow(newTimes.slice(0, i + 1), windowMs)).toBeLessThanOrEqual(cap)
            void upTo
          }
        },
      ),
      { numRuns: ITERATIONS },
    )
  })
})
