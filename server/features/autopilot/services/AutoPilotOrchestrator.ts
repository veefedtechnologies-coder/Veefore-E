/**
 * Auto Pilot — AutoPilotOrchestrator.
 *
 * Runs exactly ONE iteration of the Operating Loop for a single Mission,
 * advancing the stages in their fixed order (R3.1):
 *
 *   SENSE → THINK → PLAN → GATE → ACT → MEASURE → LEARN
 *
 * The orchestrator is deliberately a *composer*, not a reimplementation. Each
 * stage is supplied as an injected {@link LoopStageStep} that wraps the real
 * stage service (SenseService, StrategyService, PlannerService, GateService,
 * ActPublishService, MeasureService, LearnService). The orchestrator owns only
 * the cross-cutting loop concerns:
 *
 *  1. **Deterministic ordering (R3.1).** Regardless of the order steps are
 *     injected in, the orchestrator runs them in the canonical
 *     {@link LOOP_STAGE_ORDER}. A missing stage step is simply skipped.
 *
 *  2. **Idempotency + per-mission lock.** Only one iteration per Mission may run
 *     at a time. The orchestrator acquires a per-mission lock through the
 *     injected {@link MissionLock}; a retried/overlapping tick that finds the
 *     lock held is a no-op (`skipped: 'locked'`). The default lock degrades to
 *     an in-process guard when the shared backing store is unavailable, so the
 *     loop is null-safe without Redis/Mongo (mirrors the researchQueue pattern).
 *     The orchestrator itself keeps no cross-tick mutable state — idempotency of
 *     the *actions* (e.g. publishing) lives in the stage services, which recompute
 *     from persisted state on a retried tick.
 *
 *  3. **Failure recovery, never crash the loop (R2.4, R18.3, R18.4 · Property 9).**
 *     A stage that throws is converted into an Audit_Record (`outcome: 'failure'`)
 *     plus an Escalation via {@link AutoPilotAuditService}; the remaining stages
 *     for this tick are skipped (downstream stages depend on the failed one) and
 *     the next tick recovers. The orchestrator never mutates Mission or slot
 *     state on the failure path — it only appends an append-only audit record —
 *     so a failed iteration leaves state unchanged (Property 9: state preserved
 *     on failure).
 *
 *  4. **Pause honours ACT suspension (R3.5).** When the Mission is `paused`,
 *     side-effecting stages (those flagged `sideEffect: true`, i.e. GATE/ACT) are
 *     skipped so no new autonomous action starts; read-only stages may still run.
 *
 *  5. **Backing-service outage streak (R18.4, R18.5).** A stage failure means a
 *     required backing service was unreachable during the iteration. A *single*
 *     outage only preserves state and recovers on the next tick (R18.4). The
 *     orchestrator tracks how many *consecutive* iterations have been outages on
 *     the Mission (`consecutiveOutageStreak`, persisted so it survives across
 *     ticks/instances): it increments on each outage iteration and resets to 0
 *     after a successful one. When the streak reaches {@link OUTAGE_ESCALATION_STREAK}
 *     (3), the orchestrator sets the Mission to `paused` and surfaces a failure
 *     indication to the creator, **without discarding the preserved Mission
 *     state** (R18.5). Streak persistence + pause are gated on the shared backing
 *     store being reachable — when it is not (e.g. the DB itself is the outage),
 *     there is nothing to persist or pause against, so the tick simply preserves
 *     state and recovers when the store returns.
 *
 *  6. **Non-Instagram platform guard (R18.6/R18.7 · Task 18.3).** v1 executes
 *     autonomously on Instagram only. The Mission model may *represent* another
 *     platform for future extension, but the orchestrator declines a
 *     non-Instagram mission's side-effecting (GATE/ACT) stages — the same
 *     suppression used for a paused mission — so no autonomous action is taken.
 *     Read-only stages may still run. Activation-time rejection (Task 18.2
 *     controller) is the primary guard; this is the defensive backstop.
 *
 * `runIteration` NEVER throws to its caller (the loop worker): every failure is
 * captured in the returned {@link IterationResult}.
 *
 * Satisfies Requirements: 3.1, 2.4, 18.3, 18.4, 18.5, 18.6, 18.7 (Property 9)
 */

import mongoose from 'mongoose'
import { logger } from '../../../config/logger'
import { distributedLock as sharedDistributedLock } from '../../../services/distributed-lock'
import { isSupportedExecutionPlatform, type IAutoPilotMission, type LoopStage, type MissionStatus } from '../db/models'
import { missionRepository, type MissionRepository } from '../db/repositories'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
  type AuditEscalationTarget,
} from './AutoPilotAuditService'
import {
  NotificationDispatcher,
  notificationDispatcher,
} from './NotificationDispatcher'

/** The canonical Operating-Loop stage order (R3.1). */
export const LOOP_STAGE_ORDER: readonly LoopStage[] = [
  'SENSE',
  'THINK',
  'PLAN',
  'GATE',
  'ACT',
  'MEASURE',
  'LEARN',
] as const

/** Stages whose ACT-side effects are suspended while a Mission is paused (R3.5). */
export const SIDE_EFFECT_STAGES: readonly LoopStage[] = ['GATE', 'ACT'] as const

const COMPONENT = 'autopilot.AutoPilotOrchestrator'
const LOCK_PREFIX = 'autopilot:mission:'
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000

/**
 * Consecutive backing-service outage iterations that pause the Mission and
 * surface a failure to the creator (R18.5). Below this threshold a single outage
 * only preserves state and recovers on the next tick (R18.4).
 */
export const OUTAGE_ESCALATION_STREAK = 3

// ---------------------------------------------------------------------------
// Context + step contract
// ---------------------------------------------------------------------------

/** The shared context threaded through every stage step of one iteration. */
export interface LoopContext {
  /** The Mission being advanced this tick. */
  mission: IAutoPilotMission
  /** The Mission id as a string (convenience). */
  missionId: string
  /** Injectable clock for deterministic tests (epoch ms). */
  now: number
  /** `true` when the Mission is paused (side-effecting stages are skipped). */
  paused: boolean
  /** Cross-stage data bag: a stage may publish outputs consumed by later stages. */
  shared: Map<string, unknown>
}

/** What a stage step reports back so the orchestrator can aggregate the result. */
export interface StageStepResult {
  /** Autonomous actions executed by this stage (e.g. posts published). */
  actionsExecuted?: number
  /** Approval cards raised by this stage. */
  approvalsRaised?: number
  /** A progress value produced by this stage (MEASURE). */
  progressValue?: number
  /** Escalations raised *inside* the stage (added to the iteration total). */
  escalations?: number
}

/**
 * One Operating-Loop stage, injected into the orchestrator. Wraps the real stage
 * service so the orchestrator composes rather than reimplements. A step SHOULD
 * throw on an unrecoverable failure — the orchestrator turns that into an
 * Audit_Record + Escalation and preserves state (Property 9).
 */
export interface LoopStageStep {
  /** Which loop stage this step implements. */
  stage: LoopStage
  /** `true` if the stage has autonomous side effects; skipped when paused (R3.5). */
  sideEffect?: boolean
  /** Run the stage for this iteration. May return counts to aggregate. */
  run(ctx: LoopContext): Promise<StageStepResult | void>
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Why an iteration ran no stages. */
export type IterationSkipReason =
  /** No Mission exists for the given id. */
  | 'not-found'
  /** The per-mission lock is held — another iteration is in progress (no-op). */
  | 'locked'
  /** The Mission is not in a runnable status (e.g. draft/completed/failed). */
  | 'not-runnable'
  /** The Mission could not be loaded (backing store error) — recover next tick. */
  | 'load-error'
  /**
   * The Mission's AI usage allowance is spent, so the tick did not run (spec §23).
   *
   * A distinct reason on purpose: this is neither a failure nor a lock. The
   * mission stays healthy and the next tick retries once capacity or the billing
   * period frees up, and the UI can say "Autopilot reached its AI capacity for
   * this task" instead of showing an error.
   */
  | 'ai-capacity'

/** The outcome of a single Operating-Loop iteration. */
export interface IterationResult {
  /** The stages that ran to completion this tick, in execution order. */
  stagesRun: LoopStage[]
  /** Total autonomous actions executed across all stages. */
  actionsExecuted: number
  /** Total approval cards raised across all stages. */
  approvalsRaised: number
  /** Total escalations raised (stage failures + in-stage escalations). */
  escalations: number
  /** The latest progress value produced by MEASURE, when any. */
  progressValue?: number
  /** `true` when every applicable stage ran without a failure. */
  completed: boolean
  /** The first stage that failed this tick, when the loop was cut short. */
  failedStage?: LoopStage
  /** Set when no stages ran; explains why the iteration was a no-op. */
  skipped?: IterationSkipReason
  /**
   * The consecutive backing-service outage streak *after* this iteration was
   * accounted for (R18.4/R18.5), when it was updated. Present on an outage tick
   * (incremented) and on a success that reset a non-zero streak (0). Absent when
   * the streak was untouched (e.g. the backing store was unavailable to persist
   * against, or a success from an already-zero streak).
   */
  outageStreak?: number
  /**
   * `true` when this iteration's outage streak reached the escalation threshold
   * and the Mission was paused + the failure surfaced (R18.5).
   */
  pausedForOutage?: boolean
  /**
   * `true` when this Mission targets a non-Instagram platform. v1 executes
   * autonomously on Instagram only (R18.6/R18.7), so the orchestrator declines
   * the Mission's side-effecting (GATE/ACT) stages defensively — read-only
   * stages may still run, but no autonomous action is taken.
   */
  declinedNonInstagram?: boolean
}

// ---------------------------------------------------------------------------
// Per-mission lock port (null-safe, degrades to a local in-process guard)
// ---------------------------------------------------------------------------

/** A held per-mission lock; call {@link MissionLockHandle.release} when done. */
export interface MissionLockHandle {
  /** Release the lock. Best-effort and must never throw. */
  release(): Promise<void>
}

/**
 * Per-mission lock port. `acquire` resolves to a handle when the lock is held by
 * this iteration, or `null` when it is held elsewhere (the iteration should be a
 * no-op). It must be null-safe: when the shared backing store is unavailable it
 * degrades to a local guard rather than blocking the loop.
 */
export interface MissionLock {
  acquire(missionId: string): Promise<MissionLockHandle | null>
}

/** The subset of the shared distributed lock the {@link DistributedMissionLock} needs. */
export interface DistributedLockClient {
  acquireLock(lockName: string, options?: { ttlMs?: number; renewIntervalMs?: number }): Promise<boolean>
  releaseLock(lockName: string): Promise<void>
}

export interface DistributedMissionLockOptions {
  /** The shared distributed lock client (defaults to `distributedLock`). */
  lock?: DistributedLockClient
  /** Lock TTL in ms (defaults to 5 minutes). */
  ttlMs?: number
  /** Reports whether the shared backing store is reachable (defaults to a Mongo check). */
  isStoreReady?: () => boolean
}

const defaultIsStoreReady = (): boolean => {
  try {
    return mongoose.connection?.readyState === 1
  } catch {
    return false
  }
}

/**
 * Default {@link MissionLock}: an in-process guard for same-process overlap plus
 * a best-effort cross-instance lock through the shared distributed lock.
 *
 *  - The in-process guard (a module-level {@link Set}) always applies, so two
 *    ticks for the same Mission in the same worker never overlap.
 *  - When the backing store is reachable, it also takes the shared distributed
 *    lock so two *instances* never overlap; a store-held lock → `null` (no-op).
 *  - When the backing store is unavailable, it degrades to the in-process guard
 *    only (null-safe), mirroring the researchQueue "null queue" fallback.
 */
export class DistributedMissionLock implements MissionLock {
  /** Process-wide guard shared across all instances of this lock. */
  private static readonly localHeld = new Set<string>()
  private readonly lock: DistributedLockClient
  private readonly ttlMs: number
  private readonly isStoreReady: () => boolean

  constructor(options: DistributedMissionLockOptions = {}) {
    this.lock = options.lock ?? (sharedDistributedLock as DistributedLockClient)
    this.ttlMs = options.ttlMs ?? DEFAULT_LOCK_TTL_MS
    this.isStoreReady = options.isStoreReady ?? defaultIsStoreReady
  }

  async acquire(missionId: string): Promise<MissionLockHandle | null> {
    const key = `${LOCK_PREFIX}${missionId}`

    // In-process overlap guard (always applies, always null-safe).
    if (DistributedMissionLock.localHeld.has(key)) return null
    DistributedMissionLock.localHeld.add(key)

    let distributedHeld = false
    if (this.isStoreReady()) {
      try {
        const acquired = await this.lock.acquireLock(key, { ttlMs: this.ttlMs })
        if (!acquired) {
          // Held by another instance → this tick is a no-op.
          DistributedMissionLock.localHeld.delete(key)
          return null
        }
        distributedHeld = true
      } catch (error) {
        // Backing store hiccup → degrade to the in-process guard only.
        logger.warn('AutoPilot lock: distributed acquire failed; using local guard', {
          component: COMPONENT,
          missionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return {
      release: async () => {
        if (distributedHeld) {
          try {
            await this.lock.releaseLock(key)
          } catch (error) {
            logger.warn('AutoPilot lock: distributed release failed', {
              component: COMPONENT,
              missionId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
        DistributedMissionLock.localHeld.delete(key)
      },
    }
  }
}

/** Minimal in-process-only lock, handy for tests and single-instance setups. */
export class LocalMissionLock implements MissionLock {
  private readonly held = new Set<string>()

  async acquire(missionId: string): Promise<MissionLockHandle | null> {
    if (this.held.has(missionId)) return null
    this.held.add(missionId)
    return { release: async () => void this.held.delete(missionId) }
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Loads the Mission an iteration operates on. Defaults to `missionRepository`. */
export interface MissionLoader {
  findById(missionId: string): Promise<IAutoPilotMission | null>
}

/**
 * Persists the outage streak and pauses a Mission when the backing-service
 * outage streak reaches the escalation threshold (R18.4/R18.5). Defaults to
 * `missionRepository`.
 */
export interface MissionOutageStore {
  /** Persist the consecutive-outage streak (increment on outage, 0 on success). */
  updateOutageStreak(missionId: string, streak: number): Promise<IAutoPilotMission | null>
  /** Pause a Mission whose outage streak reached the threshold (R18.5). */
  updateStatus(missionId: string, status: MissionStatus): Promise<IAutoPilotMission | null>
}

/** Resolves who to notify when a stage failure must be escalated (R17.2). */
export type EscalationTargetResolver = (
  mission: IAutoPilotMission,
) => AuditEscalationTarget | undefined

export interface AutoPilotOrchestratorOptions {
  /** Ordered (or unordered) stage steps; run in {@link LOOP_STAGE_ORDER}. */
  stages: LoopStageStep[]
  /** Per-mission lock (defaults to {@link DistributedMissionLock}). */
  lock?: MissionLock
  /** Audit transport (defaults to the shared `autoPilotAuditService`). */
  audit?: Pick<AutoPilotAuditService, 'record'>
  /** Mission loader (defaults to `missionRepository`). */
  missionLoader?: MissionLoader
  /** Resolves the escalation target for a failed stage (defaults to none). */
  resolveEscalationTarget?: EscalationTargetResolver
  /** Statuses in which the loop may run (defaults to `active` + `paused`). */
  runnableStatuses?: IAutoPilotMission['status'][]
  /** Persists the outage streak + pauses on sustained outage (defaults to `missionRepository`). */
  missionOutageStore?: MissionOutageStore
  /** Notification transport for surfacing a sustained-outage pause (defaults to the shared dispatcher). */
  dispatcher?: Pick<NotificationDispatcher, 'dispatch'>
  /** Consecutive outages that pause the Mission (defaults to 3, R18.5). */
  outageThreshold?: number
  /**
   * Reports whether the shared backing store is reachable. Outage-streak
   * persistence + pause are skipped when it is not (defaults to a Mongo check).
   */
  isStoreReady?: () => boolean
}

const defaultMissionLoader = (repo: MissionRepository): MissionLoader => ({
  findById: (missionId: string) => repo.findById(missionId),
})

/**
 * Advances a Mission's Operating Loop one iteration at a time. See the file
 * header for the full contract.
 */
export class AutoPilotOrchestrator {
  private readonly steps: Map<LoopStage, LoopStageStep>
  private readonly lock: MissionLock
  private readonly audit: Pick<AutoPilotAuditService, 'record'>
  private readonly missionLoader: MissionLoader
  private readonly resolveEscalationTarget?: EscalationTargetResolver
  private readonly runnableStatuses: Set<IAutoPilotMission['status']>
  private readonly missionOutageStore: MissionOutageStore
  private readonly dispatcher: Pick<NotificationDispatcher, 'dispatch'>
  private readonly outageThreshold: number
  private readonly isStoreReady: () => boolean

  constructor(options: AutoPilotOrchestratorOptions) {
    this.steps = new Map()
    for (const step of options.stages ?? []) {
      // Last step registered for a stage wins (allows targeted overrides).
      this.steps.set(step.stage, step)
    }
    this.lock = options.lock ?? new DistributedMissionLock()
    this.audit = options.audit ?? autoPilotAuditService
    this.missionLoader = options.missionLoader ?? defaultMissionLoader(missionRepository)
    this.resolveEscalationTarget = options.resolveEscalationTarget
    this.runnableStatuses = new Set(options.runnableStatuses ?? ['active', 'paused'])
    this.missionOutageStore = options.missionOutageStore ?? missionRepository
    this.dispatcher = options.dispatcher ?? notificationDispatcher
    this.outageThreshold = Math.max(1, Math.floor(options.outageThreshold ?? OUTAGE_ESCALATION_STREAK))
    this.isStoreReady = options.isStoreReady ?? defaultIsStoreReady
  }

  /**
   * Run one Operating-Loop iteration for a Mission.
   *
   * Never throws: acquires the per-mission lock (no-op if held), runs the
   * applicable stages in canonical order, converts any stage failure into an
   * Audit_Record + Escalation (and stops the remaining stages for this tick),
   * and always releases the lock. State is preserved on the failure path
   * (Property 9).
   *
   * @param missionId The Mission to advance.
   * @param now Injectable clock (epoch ms) for deterministic tests.
   */
  async runIteration(missionId: string, now: number = Date.now()): Promise<IterationResult> {
    const result: IterationResult = {
      stagesRun: [],
      actionsExecuted: 0,
      approvalsRaised: 0,
      escalations: 0,
      completed: false,
    }

    // 1. Load the Mission. A load failure preserves state and recovers next tick.
    let mission: IAutoPilotMission | null
    try {
      mission = await this.missionLoader.findById(missionId)
    } catch (error) {
      logger.warn('AutoPilot iteration: failed to load mission; will retry next tick', {
        component: COMPONENT,
        missionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return { ...result, skipped: 'load-error' }
    }
    if (!mission) {
      return { ...result, skipped: 'not-found' }
    }

    // A mission in a terminal/not-yet-started status runs nothing.
    if (!this.runnableStatuses.has(mission.status)) {
      return { ...result, skipped: 'not-runnable' }
    }

    // 2. Acquire the per-mission lock; a held lock makes this tick a no-op.
    const handle = await this.lock.acquire(missionId)
    if (!handle) {
      return { ...result, skipped: 'locked' }
    }

    try {
      const ctx: LoopContext = {
        mission,
        missionId,
        now,
        paused: mission.status === 'paused',
        shared: new Map<string, unknown>(),
      }

      // Auto Pilot executes autonomously on Instagram + Facebook Pages. If a
      // mission on an unsupported platform somehow reaches an active/runnable
      // state, the loop declines its autonomous (side-effecting) stages
      // defensively — the primary guard is activation-time (controller), this is
      // the belt-and-braces backstop so no autonomous action is ever taken on an
      // unsupported platform. Read-only stages (SENSE/THINK/PLAN/MEASURE/LEARN)
      // may still run.
      const declineNonInstagram = !isSupportedExecutionPlatform(mission.platform)
      if (declineNonInstagram) {
        result.declinedNonInstagram = true
        logger.warn('AutoPilot iteration: declining autonomous execution for unsupported platform', {
          component: COMPONENT,
          missionId,
          platform: mission.platform,
        })
      }

      // 3. Run stages in canonical order (R3.1). Stop at the first failure.
      for (const stage of LOOP_STAGE_ORDER) {
        const step = this.steps.get(stage)
        if (!step) continue

        // R3.5: while paused, suspend side-effecting stages (GATE/ACT).
        // R18.6/R18.7: likewise suspend them for a non-Instagram mission so no
        // autonomous action executes on an unsupported platform in v1.
        if ((ctx.paused || declineNonInstagram) && step.sideEffect) {
          logger.info('AutoPilot iteration: skipping side-effect stage', {
            component: COMPONENT,
            missionId,
            stage,
            reason: ctx.paused ? 'paused' : 'non-instagram-platform',
          })
          continue
        }

        try {
          const stepResult = (await step.run(ctx)) ?? {}
          result.stagesRun.push(stage)
          result.actionsExecuted += stepResult.actionsExecuted ?? 0
          result.approvalsRaised += stepResult.approvalsRaised ?? 0
          result.escalations += stepResult.escalations ?? 0
          if (stepResult.progressValue !== undefined) {
            result.progressValue = stepResult.progressValue
          }
        } catch (error) {
          // Property 9 / R2.4 / R18.3: audit + escalate, never crash, preserve
          // state, stop the tick. Downstream stages depend on this one, so we do
          // not run them — the next iteration recovers.
          result.failedStage = stage
          const escalated = await this.recordStageFailure(ctx, stage, error)
          result.escalations += escalated ? 1 : 0
          break
        }
      }

      result.completed = result.failedStage === undefined

      // R18.4/R18.5: account for the backing-service outage streak. A single
      // outage only preserves state (already done — no mutation on the failure
      // path); 3 consecutive outages pause the Mission + surface the failure.
      await this.accountForOutageStreak(ctx, result)

      return result
    } finally {
      await handle.release()
    }
  }

  /**
   * Track the consecutive backing-service outage streak (R18.4/R18.5).
   *
   * A stage failure this tick is treated as a backing-service outage during the
   * iteration: the streak is incremented and persisted so it survives across
   * ticks/instances. A successful iteration resets a non-zero streak to 0. When
   * the streak reaches {@link outageThreshold} the Mission is paused (R18.5) and
   * a failure indication is surfaced to the creator — the preserved Mission state
   * is never discarded.
   *
   * Persisting + pausing require the shared backing store to be reachable; when
   * it is not (the store itself may be the outage), there is nothing to persist
   * or pause against, so the tick simply preserves state and recovers when the
   * store returns. Best-effort throughout — never throws (would crash the loop).
   */
  private async accountForOutageStreak(
    ctx: LoopContext,
    result: IterationResult,
  ): Promise<void> {
    // Nothing to persist/pause against when the backing store is unavailable.
    if (!this.isStoreReady()) return

    const previousStreak = Math.max(0, Math.floor(Number(ctx.mission.consecutiveOutageStreak ?? 0)))
    const isOutage = result.failedStage !== undefined

    try {
      if (!isOutage) {
        // A successful iteration clears any prior outage streak (R18.4 recovery).
        if (previousStreak > 0) {
          await this.missionOutageStore.updateOutageStreak(ctx.missionId, 0)
          result.outageStreak = 0
        }
        return
      }

      const newStreak = previousStreak + 1
      result.outageStreak = newStreak
      await this.missionOutageStore.updateOutageStreak(ctx.missionId, newStreak)

      // R18.5: sustained outage → pause the Mission + surface the failure.
      if (newStreak >= this.outageThreshold) {
        await this.missionOutageStore.updateStatus(ctx.missionId, 'paused')
        result.pausedForOutage = true
        const surfaced = await this.surfaceOutageFailure(ctx, newStreak)
        result.escalations += surfaced ? 1 : 0
        logger.warn('AutoPilot iteration: mission paused after consecutive backing-service outages', {
          component: COMPONENT,
          missionId: ctx.missionId,
          outageStreak: newStreak,
          surfaced,
        })
      }
    } catch (error) {
      // Preserve state and recover next tick — never crash the loop.
      logger.warn('AutoPilot iteration: failed to account for outage streak', {
        component: COMPONENT,
        missionId: ctx.missionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Surface a sustained-outage pause to the creator (R18.5): deliver a
   * User_Input_Notification identifying the affected Mission. Returns `true` when
   * the notification reached at least one channel. Best-effort — never throws.
   */
  private async surfaceOutageFailure(ctx: LoopContext, streak: number): Promise<boolean> {
    const target = this.resolveEscalationTarget?.(ctx.mission)
    if (!target) {
      logger.error(
        'AutoPilot iteration: outage streak reached threshold with no target to notify',
        undefined,
        { component: COMPONENT, missionId: ctx.missionId, streak },
      )
      return false
    }

    try {
      const dispatch = await this.dispatcher.dispatch({
        userId: target.userId,
        workspaceId: String(ctx.mission.workspaceId),
        title: 'Auto Pilot paused — service unavailable',
        message:
          `Auto Pilot paused this mission after a required service was unreachable on ` +
          `${streak} consecutive checks. Your mission and its content are preserved; ` +
          `resume it once the service is back.`,
        type: 'alert',
        sessionContext: target.sessionContext,
        deviceToken: target.deviceToken,
        email: target.email,
      })
      return !dispatch.undelivered
    } catch (error) {
      logger.error('AutoPilot iteration: outage-pause notification dispatch failed', error, {
        component: COMPONENT,
        missionId: ctx.missionId,
        streak,
      })
      return false
    }
  }

  /**
   * Convert a stage failure into an Audit_Record (`outcome: 'failure'`) and an
   * Escalation (R2.4, R17.2). Best-effort and never throws — the audit service
   * itself retries then escalates, and any residual error is swallowed so a
   * failed stage never crashes the loop. Returns `true` when the failure was
   * escalated to at least one channel.
   */
  private async recordStageFailure(
    ctx: LoopContext,
    stage: LoopStage,
    error: unknown,
  ): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('AutoPilot iteration: stage failed; recording audit + escalation', {
      component: COMPONENT,
      missionId: ctx.missionId,
      stage,
      error: message,
    })

    try {
      const target = this.resolveEscalationTarget?.(ctx.mission)
      const auditResult = await this.audit.record(
        {
          missionId: ctx.mission._id,
          workspaceId: ctx.mission.workspaceId,
          stage,
          action: `${stage.toLowerCase()}-stage-failure`,
          outcome: 'failure',
          reversible: false,
          triggeringContext: { error: message, iterationAt: ctx.now },
        },
        target,
      )
      return auditResult.escalated
    } catch (auditError) {
      // The audit path already escalates internally; a throw here must not crash
      // the loop, so we log and preserve state.
      logger.error('AutoPilot iteration: failed to record stage-failure audit', auditError, {
        component: COMPONENT,
        missionId: ctx.missionId,
        stage,
      })
      return false
    }
  }
}

/**
 * Factory for an orchestrator wired with the shared lock + audit service. The
 * concrete stage steps (wrapping the real stage services) are assembled where
 * their data-access dependencies are available (the loop worker, Task 17.2).
 */
export function createAutoPilotOrchestrator(
  options: AutoPilotOrchestratorOptions,
): AutoPilotOrchestrator {
  return new AutoPilotOrchestrator(options)
}
