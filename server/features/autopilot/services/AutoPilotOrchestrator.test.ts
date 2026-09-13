/**
 * Tests for AutoPilotOrchestrator (Operating-Loop iteration composer).
 *
 * These tests cover the orchestrator's cross-cutting contract (Task 17.1):
 *   - Stage ordering: stages always run in the canonical SENSE→…→LEARN order,
 *     regardless of injection order, and result counts aggregate correctly.
 *   - Per-mission lock: a held lock makes the tick a no-op; the lock is always
 *     released (success and failure paths).
 *   - Failure recovery (R2.4, R18.3): a throwing stage is converted into an
 *     Audit_Record + Escalation, the remaining stages are skipped, the loop
 *     never crashes, and Mission state is preserved.
 *   - Pause (R3.5): side-effecting stages are suspended while paused.
 *   - Property 9 (state preserved on failure): across any failing-stage index,
 *     the iteration resolves without throwing, runs only the stages before the
 *     failure, audits exactly the failed stage, releases the lock, and leaves
 *     the Mission object unmutated.
 *
 * All stage services + lock + audit are injected as fakes, so the tests need no
 * database, Redis, or network.
 *
 * Satisfies Requirements: 3.1, 2.4, 18.3, 18.4 (Property 9)
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  AutoPilotOrchestrator,
  LocalMissionLock,
  LOOP_STAGE_ORDER,
  SIDE_EFFECT_STAGES,
  OUTAGE_ESCALATION_STREAK,
  type LoopStageStep,
  type LoopContext,
  type MissionLock,
  type MissionLockHandle,
  type MissionOutageStore,
  type StageStepResult,
} from './AutoPilotOrchestrator'
import type { IAutoPilotMission, LoopStage, MissionStatus } from '../db/models'

// ---------------------------------------------------------------------------
// Fakes / helpers
// ---------------------------------------------------------------------------

function makeMission(overrides: Partial<IAutoPilotMission> = {}): IAutoPilotMission {
  return {
    _id: 'mission-1',
    workspaceId: 'ws-1',
    accountId: 'acct-1',
    platform: 'instagram',
    status: 'active' as MissionStatus,
    ...overrides,
  } as unknown as IAutoPilotMission
}

/** A fake audit service that records inputs and reports escalation. */
function makeAudit(opts: { escalated?: boolean; throws?: boolean } = {}) {
  const calls: Array<{ stage: LoopStage; action: string; outcome: string }> = []
  return {
    calls,
    record: vi.fn(async (input: any) => {
      calls.push({ stage: input.stage, action: input.action, outcome: input.outcome })
      if (opts.throws) throw new Error('audit transport down')
      return { recorded: !opts.escalated, escalated: opts.escalated ?? false }
    }),
  }
}

/** A lock that always grants and tracks acquire/release counts. */
function makeGrantingLock() {
  const state = { acquired: 0, released: 0 }
  const lock: MissionLock = {
    acquire: vi.fn(async () => {
      state.acquired += 1
      const handle: MissionLockHandle = {
        release: vi.fn(async () => {
          state.released += 1
        }),
      }
      return handle
    }),
  }
  return { lock, state }
}

/** A lock that always reports "held elsewhere" (returns null). */
function makeHeldLock(): MissionLock {
  return { acquire: vi.fn(async () => null) }
}

/**
 * Build a stage step that appends its stage to `order` when run, optionally
 * returning counts or throwing.
 */
function makeStep(
  stage: LoopStage,
  order: LoopStage[],
  opts: { result?: StageStepResult; throws?: boolean; sideEffect?: boolean } = {},
): LoopStageStep {
  return {
    stage,
    sideEffect: opts.sideEffect,
    run: vi.fn(async (_ctx: LoopContext) => {
      order.push(stage)
      if (opts.throws) throw new Error(`${stage} failed`)
      return opts.result
    }),
  }
}

function loaderFor(mission: IAutoPilotMission | null) {
  return { findById: vi.fn(async () => mission) }
}

/** A dispatcher fake that records dispatch calls and reports delivery. */
function makeDispatcher(opts: { undelivered?: boolean } = {}) {
  return {
    dispatch: vi.fn(async () => ({
      delivered: opts.undelivered ? [] : (['inApp'] as any),
      undelivered: opts.undelivered ?? false,
    })),
  }
}

/**
 * A stateful outage store bound to a mission object: `updateOutageStreak` mutates
 * the mission's persisted streak and `updateStatus` its status, so running
 * `runIteration` repeatedly against the same loaded mission models consecutive
 * ticks (the streak survives across iterations exactly as the DB would persist).
 */
function makeOutageStore(mission: IAutoPilotMission): {
  store: MissionOutageStore & {
    updateOutageStreak: ReturnType<typeof vi.fn>
    updateStatus: ReturnType<typeof vi.fn>
  }
} {
  const store = {
    updateOutageStreak: vi.fn(async (_id: string, streak: number) => {
      ;(mission as any).consecutiveOutageStreak = streak
      return mission
    }),
    updateStatus: vi.fn(async (_id: string, status: MissionStatus) => {
      ;(mission as any).status = status
      return mission
    }),
  }
  return { store }
}

// ---------------------------------------------------------------------------
// Stage ordering
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — stage ordering (R3.1)', () => {
  it('runs all stages in canonical order even when injected out of order', async () => {
    const order: LoopStage[] = []
    // Inject in a deliberately shuffled order.
    const shuffled: LoopStage[] = ['LEARN', 'SENSE', 'ACT', 'THINK', 'MEASURE', 'PLAN', 'GATE']
    const steps = shuffled.map((s) => makeStep(s, order))
    const mission = makeMission()

    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(mission),
    })

    const result = await orchestrator.runIteration('mission-1', 1000)

    expect(order).toEqual([...LOOP_STAGE_ORDER])
    expect(result.stagesRun).toEqual([...LOOP_STAGE_ORDER])
    expect(result.completed).toBe(true)
    expect(result.failedStage).toBeUndefined()
    expect(result.skipped).toBeUndefined()
  })

  it('skips missing stages without failing', async () => {
    const order: LoopStage[] = []
    const steps = [makeStep('SENSE', order), makeStep('ACT', order), makeStep('LEARN', order)]
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission()),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(order).toEqual(['SENSE', 'ACT', 'LEARN'])
    expect(result.stagesRun).toEqual(['SENSE', 'ACT', 'LEARN'])
    expect(result.completed).toBe(true)
  })

  it('aggregates actions, approvals, escalations and latest progress value', async () => {
    const order: LoopStage[] = []
    const steps = [
      makeStep('SENSE', order),
      makeStep('THINK', order),
      makeStep('PLAN', order, { result: { approvalsRaised: 2 } }),
      makeStep('GATE', order, { result: { approvalsRaised: 1, escalations: 1 } }),
      makeStep('ACT', order, { result: { actionsExecuted: 3 } }),
      makeStep('MEASURE', order, { result: { progressValue: 42 } }),
      makeStep('LEARN', order),
    ]
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission()),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(result.actionsExecuted).toBe(3)
    expect(result.approvalsRaised).toBe(3)
    expect(result.escalations).toBe(1)
    expect(result.progressValue).toBe(42)
    expect(result.completed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Per-mission lock + idempotency
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — per-mission lock', () => {
  it('is a no-op when the lock is held elsewhere', async () => {
    const order: LoopStage[] = []
    const steps = LOOP_STAGE_ORDER.map((s) => makeStep(s, order))
    const audit = makeAudit()

    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: makeHeldLock(),
      audit,
      missionLoader: loaderFor(makeMission()),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(result.skipped).toBe('locked')
    expect(result.stagesRun).toEqual([])
    expect(order).toEqual([])
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('releases the lock after a successful iteration', async () => {
    const order: LoopStage[] = []
    const { lock, state } = makeGrantingLock()
    const orchestrator = new AutoPilotOrchestrator({
      stages: LOOP_STAGE_ORDER.map((s) => makeStep(s, order)),
      lock,
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission()),
    })

    await orchestrator.runIteration('mission-1')

    expect(state.acquired).toBe(1)
    expect(state.released).toBe(1)
  })

  it('releases the lock even when a stage fails', async () => {
    const order: LoopStage[] = []
    const { lock, state } = makeGrantingLock()
    const steps = [
      makeStep('SENSE', order),
      makeStep('THINK', order, { throws: true }),
      makeStep('PLAN', order),
    ]
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock,
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission()),
    })

    await orchestrator.runIteration('mission-1')

    expect(state.acquired).toBe(1)
    expect(state.released).toBe(1)
  })

  it('LocalMissionLock prevents overlapping iterations for the same mission', async () => {
    const lock = new LocalMissionLock()
    const first = await lock.acquire('mission-1')
    const second = await lock.acquire('mission-1')
    expect(first).not.toBeNull()
    expect(second).toBeNull()
    await first!.release()
    const third = await lock.acquire('mission-1')
    expect(third).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Mission gating (not-found / load-error / not-runnable)
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — mission gating', () => {
  it('skips when the mission does not exist', async () => {
    const order: LoopStage[] = []
    const orchestrator = new AutoPilotOrchestrator({
      stages: LOOP_STAGE_ORDER.map((s) => makeStep(s, order)),
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(null),
    })

    const result = await orchestrator.runIteration('missing')
    expect(result.skipped).toBe('not-found')
    expect(order).toEqual([])
  })

  it('skips (and does not throw) when the mission fails to load', async () => {
    const order: LoopStage[] = []
    const orchestrator = new AutoPilotOrchestrator({
      stages: LOOP_STAGE_ORDER.map((s) => makeStep(s, order)),
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: {
        findById: vi.fn(async () => {
          throw new Error('mongo down')
        }),
      },
    })

    const result = await orchestrator.runIteration('mission-1')
    expect(result.skipped).toBe('load-error')
    expect(order).toEqual([])
  })

  it('skips a mission in a non-runnable status (draft)', async () => {
    const order: LoopStage[] = []
    const orchestrator = new AutoPilotOrchestrator({
      stages: LOOP_STAGE_ORDER.map((s) => makeStep(s, order)),
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission({ status: 'draft' as MissionStatus })),
    })

    const result = await orchestrator.runIteration('mission-1')
    expect(result.skipped).toBe('not-runnable')
    expect(order).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Failure recovery (R2.4, R18.3, Property 9)
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — failure recovery', () => {
  it('audits a failing stage, stops remaining stages, and never throws', async () => {
    const order: LoopStage[] = []
    const audit = makeAudit({ escalated: true })
    const steps = [
      makeStep('SENSE', order),
      makeStep('THINK', order),
      makeStep('PLAN', order, { throws: true }),
      makeStep('GATE', order),
      makeStep('ACT', order),
    ]
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit,
      missionLoader: loaderFor(makeMission()),
    })

    const result = await orchestrator.runIteration('mission-1', 5000)

    // Ran up to and including SENSE, THINK; PLAN threw; GATE/ACT never ran.
    expect(order).toEqual(['SENSE', 'THINK', 'PLAN'])
    expect(result.stagesRun).toEqual(['SENSE', 'THINK'])
    expect(result.failedStage).toBe('PLAN')
    expect(result.completed).toBe(false)

    // Exactly one failure audit record, for the failed stage.
    expect(audit.record).toHaveBeenCalledTimes(1)
    expect(audit.calls).toEqual([
      { stage: 'PLAN', action: 'plan-stage-failure', outcome: 'failure' },
    ])
    expect(result.escalations).toBe(1)
  })

  it('does not crash the loop even if the audit write itself throws', async () => {
    const order: LoopStage[] = []
    const audit = makeAudit({ throws: true })
    const steps = [makeStep('SENSE', order, { throws: true }), makeStep('THINK', order)]
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit,
      missionLoader: loaderFor(makeMission()),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(result.failedStage).toBe('SENSE')
    expect(result.completed).toBe(false)
    expect(result.escalations).toBe(0) // audit threw → not counted as escalated
    expect(order).toEqual(['SENSE']) // THINK never ran
  })

  it('resolves the escalation target from the mission when provided', async () => {
    const order: LoopStage[] = []
    const audit = makeAudit({ escalated: true })
    const resolveEscalationTarget = vi.fn(() => ({ userId: 'user-9' }))
    const steps = [makeStep('SENSE', order, { throws: true })]
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit,
      missionLoader: loaderFor(makeMission()),
      resolveEscalationTarget,
    })

    await orchestrator.runIteration('mission-1')

    expect(resolveEscalationTarget).toHaveBeenCalledTimes(1)
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'SENSE', outcome: 'failure' }),
      { userId: 'user-9' },
    )
  })
})

// ---------------------------------------------------------------------------
// Pause suspends ACT-side effects (R3.5)
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — pause suspends side effects (R3.5)', () => {
  it('skips side-effecting stages (GATE/ACT) while paused', async () => {
    const order: LoopStage[] = []
    const steps = LOOP_STAGE_ORDER.map((s) =>
      makeStep(s, order, { sideEffect: SIDE_EFFECT_STAGES.includes(s) }),
    )
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission({ status: 'paused' as MissionStatus })),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(order).toEqual(['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN'])
    expect(result.stagesRun).toEqual(['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN'])
    expect(result.completed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Non-Instagram platform guard (Task 18.3 · R18.6, R18.7)
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — unsupported-platform guard (R18.6, R18.7)', () => {
  it('declines side-effecting stages (GATE/ACT) for an unsupported-platform mission but runs read-only stages', async () => {
    const order: LoopStage[] = []
    const steps = LOOP_STAGE_ORDER.map((s) =>
      makeStep(s, order, { sideEffect: SIDE_EFFECT_STAGES.includes(s) }),
    )
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission({ platform: 'tiktok' })),
    })

    const result = await orchestrator.runIteration('mission-1')

    // GATE + ACT are suppressed; read-only stages still run.
    expect(order).toEqual(['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN'])
    expect(result.stagesRun).toEqual(['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN'])
    expect(result.declinedNonInstagram).toBe(true)
    expect(result.actionsExecuted).toBe(0)
    expect(result.completed).toBe(true)
  })

  it('runs all stages for a Facebook Page mission (now a supported platform)', async () => {
    const order: LoopStage[] = []
    const steps = LOOP_STAGE_ORDER.map((s) =>
      makeStep(s, order, { sideEffect: SIDE_EFFECT_STAGES.includes(s) }),
    )
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission({ platform: 'facebook' })),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(order).toEqual([...LOOP_STAGE_ORDER])
    expect(result.declinedNonInstagram).toBeUndefined()
    expect(result.completed).toBe(true)
  })

  it('does not flag or suppress anything for an Instagram mission', async () => {
    const order: LoopStage[] = []
    const steps = LOOP_STAGE_ORDER.map((s) =>
      makeStep(s, order, { sideEffect: SIDE_EFFECT_STAGES.includes(s) }),
    )
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission({ platform: 'instagram' })),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(order).toEqual([...LOOP_STAGE_ORDER])
    expect(result.declinedNonInstagram).toBeUndefined()
    expect(result.completed).toBe(true)
  })

  it('treats a case-different Instagram platform value as supported', async () => {
    const order: LoopStage[] = []
    const steps = LOOP_STAGE_ORDER.map((s) =>
      makeStep(s, order, { sideEffect: SIDE_EFFECT_STAGES.includes(s) }),
    )
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(makeMission({ platform: 'Instagram' })),
    })

    const result = await orchestrator.runIteration('mission-1')

    expect(order).toEqual([...LOOP_STAGE_ORDER])
    expect(result.declinedNonInstagram).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Property 9: state preserved on failure
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — Property 9: state preserved on failure', () => {
  /**
   * For any index at which a stage fails, the iteration:
   *   - resolves without throwing,
   *   - runs only the stages before the failure (+ the failing one attempts),
   *   - reports that exact stage as failedStage and completed=false,
   *   - produces exactly one failure Audit_Record for that stage,
   *   - releases the per-mission lock,
   *   - leaves the Mission object unmutated (state preserved).
   *
   * **Validates: Requirements 2.4, 18.4 (Property 9)**
   */
  it('holds across every failing-stage index', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: LOOP_STAGE_ORDER.length - 1 }),
        async (failAt) => {
          const order: LoopStage[] = []
          const audit = makeAudit({ escalated: true })
          const { lock, state } = makeGrantingLock()

          const steps = LOOP_STAGE_ORDER.map((stage, idx) =>
            makeStep(stage, order, { throws: idx === failAt }),
          )

          const mission = makeMission({
            goal: { metric: 'followers', targetValue: 1000, startValue: 0 },
          } as Partial<IAutoPilotMission>)
          const snapshot = JSON.stringify(mission)

          const orchestrator = new AutoPilotOrchestrator({
            stages: steps,
            lock,
            audit,
            missionLoader: loaderFor(mission),
          })

          const failedStage = LOOP_STAGE_ORDER[failAt]
          const expectedRun = LOOP_STAGE_ORDER.slice(0, failAt)

          // Never throws.
          const result = await orchestrator.runIteration('mission-1', 123456)

          // Only the stages before the failure completed; the failing stage was
          // attempted (appended to `order`) but nothing after it ran.
          expect(result.stagesRun).toEqual([...expectedRun])
          expect(order).toEqual([...expectedRun, failedStage])
          expect(result.failedStage).toBe(failedStage)
          expect(result.completed).toBe(false)

          // Exactly one failure audit record, for the failed stage.
          expect(audit.record).toHaveBeenCalledTimes(1)
          expect(audit.calls).toEqual([
            {
              stage: failedStage,
              action: `${failedStage.toLowerCase()}-stage-failure`,
              outcome: 'failure',
            },
          ])

          // Lock always released.
          expect(state.acquired).toBe(1)
          expect(state.released).toBe(1)

          // Mission state preserved (no mutation).
          expect(JSON.stringify(mission)).toBe(snapshot)
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ---------------------------------------------------------------------------
// Backing-service outage handling (Task 17.3 · R18.4, R18.5)
// ---------------------------------------------------------------------------

describe('AutoPilotOrchestrator — backing-service outage handling (R18.4, R18.5)', () => {
  const escalationTarget = () => ({ userId: 'user-1' })

  /**
   * Build an orchestrator whose THINK stage always fails (a backing-service
   * outage during the iteration), with a stateful outage store + dispatcher and
   * the store reported reachable so streak persistence + pause are exercised.
   */
  function makeOutageHarness(mission: IAutoPilotMission, opts: { failing?: boolean } = {}) {
    const order: LoopStage[] = []
    const steps = [
      makeStep('SENSE', order),
      makeStep('THINK', order, { throws: opts.failing ?? true }),
      makeStep('PLAN', order),
      makeStep('ACT', order, { sideEffect: true }),
    ]
    const { store } = makeOutageStore(mission)
    const dispatcher = makeDispatcher()
    const audit = makeAudit({ escalated: false })
    const orchestrator = new AutoPilotOrchestrator({
      stages: steps,
      lock: new LocalMissionLock(),
      audit,
      missionLoader: loaderFor(mission),
      missionOutageStore: store,
      dispatcher,
      resolveEscalationTarget: escalationTarget,
      isStoreReady: () => true,
    })
    return { orchestrator, store, dispatcher, audit, order }
  }

  it('preserves state and does NOT pause on a single outage (R18.4)', async () => {
    const mission = makeMission({
      goal: { metric: 'followers', targetValue: 1000, startValue: 0 },
      consecutiveOutageStreak: 0,
    } as Partial<IAutoPilotMission>)
    const { orchestrator, store, dispatcher } = makeOutageHarness(mission)

    const result = await orchestrator.runIteration('mission-1', 1000)

    // The outage was recorded (streak → 1) but the mission is not paused.
    expect(result.failedStage).toBe('THINK')
    expect(result.completed).toBe(false)
    expect(result.outageStreak).toBe(1)
    expect(result.pausedForOutage).toBeUndefined()

    expect(store.updateOutageStreak).toHaveBeenCalledWith('mission-1', 1)
    expect(store.updateStatus).not.toHaveBeenCalled()
    expect(dispatcher.dispatch).not.toHaveBeenCalled()

    // State preserved: still active, goal untouched (R18.4).
    expect(mission.status).toBe('active')
    expect(mission.goal.targetValue).toBe(1000)
  })

  it('pauses the mission and surfaces the failure after 3 consecutive outages (R18.5)', async () => {
    const mission = makeMission({
      goal: { metric: 'followers', targetValue: 1000, startValue: 0 },
      consecutiveOutageStreak: 0,
    } as Partial<IAutoPilotMission>)
    const { orchestrator, store, dispatcher } = makeOutageHarness(mission)

    // Tick 1 + 2: outage streak climbs, no pause yet.
    const r1 = await orchestrator.runIteration('mission-1', 1000)
    expect(r1.outageStreak).toBe(1)
    expect(r1.pausedForOutage).toBeUndefined()

    const r2 = await orchestrator.runIteration('mission-1', 2000)
    expect(r2.outageStreak).toBe(2)
    expect(r2.pausedForOutage).toBeUndefined()
    expect(store.updateStatus).not.toHaveBeenCalled()
    expect(dispatcher.dispatch).not.toHaveBeenCalled()

    // Tick 3: threshold reached → pause + surface failure (R18.5).
    const r3 = await orchestrator.runIteration('mission-1', 3000)
    expect(r3.outageStreak).toBe(OUTAGE_ESCALATION_STREAK)
    expect(r3.pausedForOutage).toBe(true)
    expect(r3.escalations).toBe(1)

    expect(store.updateStatus).toHaveBeenCalledWith('mission-1', 'paused')
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'alert' }),
    )

    // State preserved through the pause (R18.5: never discard mission state).
    expect(mission.status).toBe('paused')
    expect(mission.goal.targetValue).toBe(1000)
  })

  it('resets the outage streak after a successful iteration (R18.4 recovery)', async () => {
    const mission = makeMission({
      goal: { metric: 'followers', targetValue: 1000, startValue: 0 },
      consecutiveOutageStreak: 2, // two prior outages
    } as Partial<IAutoPilotMission>)
    // failing:false → every stage succeeds this tick.
    const { orchestrator, store, dispatcher } = makeOutageHarness(mission, { failing: false })

    const result = await orchestrator.runIteration('mission-1', 4000)

    expect(result.completed).toBe(true)
    expect(result.failedStage).toBeUndefined()
    // A successful iteration clears the streak (R18.4).
    expect(result.outageStreak).toBe(0)
    expect(store.updateOutageStreak).toHaveBeenCalledWith('mission-1', 0)
    expect(store.updateStatus).not.toHaveBeenCalled()
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
    expect(mission.consecutiveOutageStreak).toBe(0)
  })

  it('does not write the streak on a clean success from an already-zero streak', async () => {
    const mission = makeMission({ consecutiveOutageStreak: 0 })
    const { orchestrator, store } = makeOutageHarness(mission, { failing: false })

    const result = await orchestrator.runIteration('mission-1', 5000)

    expect(result.completed).toBe(true)
    expect(result.outageStreak).toBeUndefined()
    expect(store.updateOutageStreak).not.toHaveBeenCalled()
  })

  it('skips streak persistence + pause when the backing store is unavailable', async () => {
    const mission = makeMission({ consecutiveOutageStreak: 2 })
    const { store } = makeOutageStore(mission)
    const dispatcher = makeDispatcher()
    const order: LoopStage[] = []
    const orchestrator = new AutoPilotOrchestrator({
      stages: [makeStep('SENSE', order, { throws: true })],
      lock: new LocalMissionLock(),
      audit: makeAudit(),
      missionLoader: loaderFor(mission),
      missionOutageStore: store,
      dispatcher,
      resolveEscalationTarget: escalationTarget,
      isStoreReady: () => false, // store itself is down — nothing to persist against
    })

    const result = await orchestrator.runIteration('mission-1', 6000)

    expect(result.failedStage).toBe('SENSE')
    expect(result.outageStreak).toBeUndefined()
    expect(result.pausedForOutage).toBeUndefined()
    expect(store.updateOutageStreak).not.toHaveBeenCalled()
    expect(store.updateStatus).not.toHaveBeenCalled()
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
    // State preserved and recovered on the next tick when the store returns.
    expect(mission.status).toBe('active')
  })
})
