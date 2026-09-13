/**
 * Auto Pilot — `autopilot-loop` worker.
 *
 * Consumes the per-Mission repeatable jobs scheduled by
 * {@link AutopilotLoopQueueManager} and turns each tick into exactly one
 * Operating-Loop iteration by invoking
 * `AutoPilotOrchestrator.runIteration(missionId)` (design "The Operating Loop" ·
 * R3.2). The orchestrator owns the cross-cutting loop concerns (canonical stage
 * ordering, per-mission lock/idempotency, pause suspension of ACT, and
 * failure→audit→escalation), and it never throws — so the worker's job is simply
 * to run one iteration per tick and stamp the Mission's `lastIterationAt`.
 *
 * The processing logic is extracted into {@link createLoopJobProcessor} with the
 * orchestrator + mission store injected, so it is fully unit-testable without
 * Redis, Mongo, or the real stage services. The lazy {@link getAutopilotLoopWorker}
 * wires the real orchestrator (assembled from the default stage steps in
 * {@link buildDefaultLoopStages}) and is only initialised when Redis is present
 * (mirrors `autopilotBriefWorker` / `autopilotAutomationWorker`).
 *
 * Satisfies Requirements: 3.2
 */

import { Worker, type Job } from 'bullmq'
import { getSharedRedisConnection } from '../../../lib/redis'
import { logger } from '../../../config/logger'
import { missionRepository, type MissionRepository } from '../db/repositories'
import {
  createAutoPilotOrchestrator,
  type AutoPilotOrchestrator,
  type IterationResult,
} from '../services/AutoPilotOrchestrator'
import { buildDefaultLoopStages } from './loopStages'
import type { AutopilotLoopJobData } from '../queues/autopilotLoopQueue'

const COMPONENT = 'autopilot.autopilotLoopWorker'

/** The orchestrator surface the worker needs. */
export interface LoopOrchestrator {
  runIteration(missionId: string, now?: number): Promise<IterationResult>
}

/** Injectable dependencies for {@link createLoopJobProcessor}. */
export interface LoopWorkerDeps {
  /** Runs one Operating-Loop iteration for a Mission (defaults to the real orchestrator). */
  orchestrator: LoopOrchestrator
  /** Stamps `lastIterationAt` after a tick (defaults to `missionRepository`). */
  missionStore?: Pick<MissionRepository, 'markIteration'>
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number
}

/** Outcome of processing one loop tick (surfaced for tests + logging). */
export interface LoopJobResult {
  missionId: string
  /** The orchestrator's iteration result for this tick. */
  iteration: IterationResult
  /** Whether `lastIterationAt` was stamped (only when the tick actually ran stages). */
  marked: boolean
  /**
   * Set when the tick was refused by the AI usage engine instead of running.
   * `message` is the sentence to show the user (spec §23).
   */
  blocked?: { code: string; message: string }
}

/**
 * Spec §23, verbatim: what the user is told when Autopilot hits its AI ceiling.
 * A generic error would leave them thinking Autopilot is broken rather than
 * capped.
 */
export const AUTOPILOT_CAPACITY_MESSAGE =
  'Autopilot reached its AI capacity for this task.'

/** An iteration that never ran because the AI allowance is spent. */
const CAPACITY_SKIPPED: IterationResult = {
  stagesRun: [],
  actionsExecuted: 0,
  approvalsRaised: 0,
  escalations: 0,
  completed: false,
  skipped: 'ai-capacity',
}

/**
 * Who pays for a Mission's AI.
 *
 * A Mission is workspace-scoped, so the cost belongs to the workspace's owner.
 * Cached briefly because the loop ticks repeatedly for the same mission and this
 * would otherwise be two database reads per tick.
 *
 * Returning no userId is deliberate: the caller then runs the tick UNMETERED
 * rather than stopping a paying customer's automation because a lookup failed.
 * Usage is still recorded; only the reservation is skipped.
 */
const missionOwnerCache = new Map<
  string,
  { at: number; userId?: string; workspaceId?: string }
>()
const MISSION_OWNER_TTL_MS = 5 * 60 * 1000

async function resolveMissionOwner(
  missionId: string
): Promise<{ userId?: string; workspaceId?: string }> {
  const cached = missionOwnerCache.get(missionId)
  if (cached && Date.now() - cached.at < MISSION_OWNER_TTL_MS) {
    return { userId: cached.userId, workspaceId: cached.workspaceId }
  }
  let userId: string | undefined
  let workspaceId: string | undefined
  try {
    const mission = await missionRepository.findById(missionId)
    const ws = (mission as { workspaceId?: unknown } | null)?.workspaceId
    workspaceId = ws ? String(ws) : undefined
    if (workspaceId) {
      const { storage } = await import('../../../storage')
      const workspace = await storage.getWorkspace(workspaceId)
      const owner = (workspace as { userId?: unknown } | undefined)?.userId
      if (owner) userId = String(owner)
    }
  } catch (error) {
    logger.warn('autopilot-loop: could not resolve the mission owner', {
      component: COMPONENT,
      missionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  missionOwnerCache.set(missionId, { at: Date.now(), userId, workspaceId })
  return { userId, workspaceId }
}

/**
 * Build the pure loop-tick processor. Runs one `runIteration` for the Mission and
 * — when the iteration actually ran (was not a no-op skip) — stamps its
 * `lastIterationAt` so the ≤60-minute cadence (R3.2) is observable. Never throws:
 * the orchestrator captures every failure in its result, and a `markIteration`
 * write failure is logged but does not fail the tick.
 */
export function createLoopJobProcessor(deps: LoopWorkerDeps) {
  const now = deps.now ?? Date.now
  const missionStore = deps.missionStore ?? missionRepository

  return async function processLoopJob(data: AutopilotLoopJobData): Promise<LoopJobResult> {
    // ── One iteration = one governed AI operation (spec §23) ─────────────────
    // Autopilot is an agent loop: without its own budget it would keep calling
    // providers every tick, forever, bounded by nothing. The nested VGU scope
    // gives each iteration the ceilings the registry declares for it — VGU per
    // job, monthly Autopilot allowance, one iteration at a time, a provider-call
    // limit and a wall-clock budget — and records it in the ledger as Autopilot
    // usage so it can be reported separately from chat.
    //
    // `nested: true` because a tick may itself be invoked from an already-metered
    // context; the plan-wide concurrency slot must not be double-taken.
    const owner = await resolveMissionOwner(data.missionId)
    if (!owner.userId) {
      // No quota owner resolvable → run unmetered rather than silently stopping a
      // paying customer's automation. The provider guard still records usage.
      const iteration = await deps.orchestrator.runIteration(data.missionId, now())
      return finish(data, iteration)
    }

    let iteration: IterationResult
    try {
      const { withVGUForUser } = await import('../../../services/veegpt-metering')
      const { AUTOPILOT_FEATURE } = await import('../../../config/veegpt-vgu.config')
      const run = await withVGUForUser(
        {
          userId: owner.userId,
          workspaceId: owner.workspaceId,
          feature: AUTOPILOT_FEATURE,
          nested: true,
          meta: {
            userId: owner.userId,
            source: 'autopilot-loop',
            missionId: data.missionId,
          },
        },
        () => deps.orchestrator.runIteration(data.missionId, now())
      )
      iteration = run.result
    } catch (error) {
      const code = (error as { code?: string })?.code
      const isQuota = (error as { name?: string })?.name === 'VGUQuotaError'
      if (!isQuota) throw error
      // STOP SAFELY. The mission is not failed and not escalated — it simply did
      // not run this tick, and the next tick will try again once capacity or the
      // billing period frees up.
      logger.warn(AUTOPILOT_CAPACITY_MESSAGE, {
        component: COMPONENT,
        missionId: data.missionId,
        code,
        reason: (error as Error).message,
      })
      return {
        missionId: data.missionId,
        iteration: CAPACITY_SKIPPED,
        marked: false,
        blocked: { code: code || 'QUOTA', message: AUTOPILOT_CAPACITY_MESSAGE },
      }
    }

    return finish(data, iteration)
  }

  /** Stamp the cadence timestamp and log, exactly as before. */
  async function finish(
    data: AutopilotLoopJobData,
    iteration: IterationResult
  ): Promise<LoopJobResult> {

    // Only stamp when a real iteration ran (skipped ticks — locked / not-runnable
    // / not-found — leave the timestamp untouched).
    let marked = false
    if (!iteration.skipped) {
      try {
        await missionStore.markIteration(data.missionId, new Date(now()))
        marked = true
      } catch (error) {
        logger.warn('autopilot-loop: failed to stamp lastIterationAt', {
          component: COMPONENT,
          missionId: data.missionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    logger.info('autopilot-loop tick complete', {
      component: COMPONENT,
      missionId: data.missionId,
      stagesRun: iteration.stagesRun,
      skipped: iteration.skipped,
      completed: iteration.completed,
      escalations: iteration.escalations,
    })

    return { missionId: data.missionId, iteration, marked }
  }
}

// ── Lazy BullMQ worker (mirrors autopilotBriefWorker) ────────────────────────
let autopilotLoopWorker: Worker<AutopilotLoopJobData> | null = null

/** Build the real orchestrator wired with the default SENSE→…→LEARN stage steps. */
function defaultOrchestrator(): AutoPilotOrchestrator {
  return createAutoPilotOrchestrator({ stages: buildDefaultLoopStages() })
}

/**
 * Lazily initialise the `autopilot-loop` worker on first use. Returns `null`
 * when Redis is unavailable so the queue manager degrades gracefully.
 */
export function getAutopilotLoopWorker(): Worker<AutopilotLoopJobData> | null {
  if (autopilotLoopWorker) return autopilotLoopWorker

  if (!process.env.REDIS_URL) {
    return null
  }

  const connection = getSharedRedisConnection()
  if (!connection) {
    logger.warn('Redis unavailable, autopilot-loop worker cannot be initialized', {
      component: COMPONENT,
    })
    return null
  }

  const processJob = createLoopJobProcessor({ orchestrator: defaultOrchestrator() })

  autopilotLoopWorker = new Worker<AutopilotLoopJobData>(
    'autopilot-loop',
    async (job: Job<AutopilotLoopJobData>) => processJob(job.data),
    { connection, concurrency: 2 },
  )

  autopilotLoopWorker.on('failed', (job, err) => {
    logger.error('autopilot-loop job failed', err, {
      component: COMPONENT,
      jobId: job?.id,
      missionId: job?.data?.missionId,
    })
  })

  return autopilotLoopWorker
}
