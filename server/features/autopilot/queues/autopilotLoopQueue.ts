/**
 * Auto Pilot — `autopilot-loop` repeatable queue.
 *
 * The Operating Loop's heartbeat. Each **active** Mission owns exactly one
 * BullMQ **repeatable** job that fires on a fixed cadence; every tick runs one
 * `AutoPilotOrchestrator.runIteration(missionId)` through the
 * {@link getAutopilotLoopWorker} worker (design "Queues" table · R3.2):
 *
 *   • {@link AutopilotLoopQueueManager.scheduleMission} registers the repeatable
 *     job when a Mission goes `active`. The cadence is clamped to ≤60 min so the
 *     next iteration always begins within 60 minutes of the previous one (R3.2).
 *   • {@link AutopilotLoopQueueManager.removeMission} removes the repeatable job
 *     when a Mission is paused/stopped, so no new autonomous iteration starts
 *     (R3.5/R3.6). The paused-state ACT suspension is additionally enforced by
 *     the orchestrator, but removing the job is what stops new ticks entirely.
 *
 * Null-safe / lazy, mirroring `server/queues/researchQueue.ts` and the sibling
 * autopilot queues:
 *   • when `REDIS_URL` is absent the queue is `null` and every schedule/remove is
 *     an inline no-op that returns `false` (Auto Pilot then has no background
 *     loop — the mission's actions are driven on-demand instead), and
 *   • the worker is initialised lazily on first schedule so importing this module
 *     never opens a Redis connection.
 *
 * A stable, deterministic `jobId` (`loop-<missionId>`) keys the repeatable job so
 * re-scheduling the same Mission de-duplicates rather than double-booking, and
 * removal can find the exact job to drop.
 *
 * Satisfies Requirements: 3.2, 3.5, 3.6
 */

import { Queue, type QueueOptions } from 'bullmq'
import { getSharedRedisConnection } from '../../../lib/redis'

/**
 * R3.2: the next Operating-Loop iteration must begin within 60 minutes of the
 * previous one, so the repeatable cadence is capped here.
 */
export const MAX_LOOP_CADENCE_MS = 60 * 60 * 1000

/**
 * Default repeatable cadence (15 min) — comfortably within the 60-minute ceiling
 * (R3.2), giving the loop headroom to react while keeping AI spend bounded.
 */
export const DEFAULT_LOOP_CADENCE_MS = 15 * 60 * 1000

/** Floor on the cadence so a misconfiguration can't hammer the loop. */
export const MIN_LOOP_CADENCE_MS = 60 * 1000

/** Payload for a single `autopilot-loop` tick. */
export interface AutopilotLoopJobData {
  /** The Mission whose Operating Loop this tick advances. */
  missionId: string
  /** Workspace the mission is bound to (convenience for logging/scoping). */
  workspaceId: string
}

/** The stable repeatable-job id for a Mission (also used to remove it). */
export function loopJobId(missionId: string): string {
  return `loop-${missionId}`
}

/**
 * Clamp a requested cadence into `[MIN_LOOP_CADENCE_MS, MAX_LOOP_CADENCE_MS]`.
 * A non-finite/absent value falls back to {@link DEFAULT_LOOP_CADENCE_MS}. This
 * is the guarantee behind R3.2 — the effective cadence never exceeds 60 min.
 */
export function clampLoopCadenceMs(requestedMs?: number): number {
  const value = Number.isFinite(requestedMs) ? Math.floor(requestedMs as number) : DEFAULT_LOOP_CADENCE_MS
  if (value < MIN_LOOP_CADENCE_MS) return MIN_LOOP_CADENCE_MS
  if (value > MAX_LOOP_CADENCE_MS) return MAX_LOOP_CADENCE_MS
  return value
}

// ── Null-safe queue construction (mirrors researchQueue) ─────────────────────
// Only touch Redis when REDIS_URL is configured; otherwise the queue is null and
// scheduling degrades to an inline no-op (graceful degradation without Redis).
const redisConnection = process.env.REDIS_URL ? getSharedRedisConnection() : null

const queueOptions: QueueOptions = redisConnection
  ? {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        // A single tick is idempotent (the orchestrator recomputes from persisted
        // state) and the loop is repeatable, so a failed tick simply recovers on
        // the next repeat — one attempt keeps AI spend bounded.
        attempts: 1,
      },
    }
  : ({} as QueueOptions)

/** The `autopilot-loop` queue, or `null` when Redis is unavailable. */
export const autopilotLoopQueue = redisConnection
  ? new Queue<AutopilotLoopJobData>('autopilot-loop', queueOptions)
  : null

/** True when the loop queue is backed by a ready Redis connection. */
export function isAutopilotLoopQueueAvailable(): boolean {
  return !!autopilotLoopQueue && !!redisConnection && redisConnection.status === 'ready'
}

/** Inputs describing the Mission whose repeatable loop should be scheduled. */
export interface ScheduleMissionInput {
  /** The active Mission's id. */
  missionId: string
  /** Workspace the mission is bound to. */
  workspaceId: string
  /** Requested cadence (ms); clamped to ≤60 min (R3.2). Defaults to 15 min. */
  cadenceMs?: number
}

/**
 * The minimal BullMQ `Queue` surface the schedule/remove logic needs. Extracted
 * as a port so the core scheduling/removal semantics are unit-testable against an
 * in-memory fake without a live Redis connection.
 */
export interface LoopQueueLike {
  add(name: string, data: AutopilotLoopJobData, opts: Record<string, unknown>): Promise<unknown>
  getRepeatableJobs(): Promise<Array<{ key: string; id?: string | null; name?: string }>>
  removeRepeatableByKey(key: string): Promise<unknown>
}

/**
 * Register (or re-register) the repeatable Operating-Loop job on the given queue
 * (R3.2). Pure over the injected queue — the cadence is clamped to ≤60 min and a
 * stable `jobId` de-duplicates re-scheduling. Returns `false` on any enqueue
 * error.
 */
export async function scheduleMissionOn(
  queue: LoopQueueLike,
  input: ScheduleMissionInput,
): Promise<boolean> {
  const cadenceMs = clampLoopCadenceMs(input.cadenceMs)
  const jobId = loopJobId(input.missionId)
  try {
    await queue.add(
      'iterate',
      { missionId: input.missionId, workspaceId: input.workspaceId },
      { jobId, repeat: { every: cadenceMs }, priority: 10 },
    )
    return true
  } catch (error) {
    console.error(
      '[AutopilotLoopQueueManager] Failed to schedule mission loop:',
      (error as Error).message,
    )
    return false
  }
}

/**
 * Remove the repeatable Operating-Loop job for a Mission from the given queue
 * (R3.5/R3.6). Pure over the injected queue. Returns `true` when a matching
 * repeatable job was found and removed, `false` otherwise (nothing to remove or
 * an error).
 */
export async function removeMissionOn(queue: LoopQueueLike, missionId: string): Promise<boolean> {
  const jobId = loopJobId(missionId)
  try {
    const repeatables = await queue.getRepeatableJobs()
    let removed = false
    for (const job of repeatables) {
      // A repeatable job's `id` echoes the jobId we scheduled it under.
      if (job.id === jobId) {
        await queue.removeRepeatableByKey(job.key)
        removed = true
      }
    }
    return removed
  } catch (error) {
    console.error(
      '[AutopilotLoopQueueManager] Failed to remove mission loop:',
      (error as Error).message,
    )
    return false
  }
}

/**
 * Schedules / removes the per-Mission repeatable Operating-Loop job. Null-safe +
 * lazy: returns `false` without touching Redis when the queue is unavailable, and
 * initialises the worker on first schedule.
 */
export class AutopilotLoopQueueManager {
  /**
   * Register (or re-register) the repeatable Operating-Loop job for an active
   * Mission (R3.2). The cadence is clamped to ≤60 min. Uses a stable `jobId`
   * (`loop-<missionId>`) so re-scheduling the same Mission de-duplicates.
   *
   * @returns `true` once the repeatable job is registered, `false` if Redis / the
   *   worker is unavailable or scheduling fails.
   */
  static async scheduleMission(input: ScheduleMissionInput): Promise<boolean> {
    if (!autopilotLoopQueue) return false
    if (!(await ensureWorker())) return false
    return scheduleMissionOn(autopilotLoopQueue as unknown as LoopQueueLike, input)
  }

  /**
   * Remove the repeatable Operating-Loop job for a Mission when it is paused or
   * stopped (R3.5/R3.6), so no new autonomous iteration starts. Idempotent:
   * removing an already-absent job resolves `false` (nothing removed) without
   * error.
   *
   * @returns `true` when a repeatable job was found and removed, `false` if the
   *   queue is unavailable, no matching job existed, or removal failed.
   */
  static async removeMission(missionId: string): Promise<boolean> {
    if (!autopilotLoopQueue) return false
    return removeMissionOn(autopilotLoopQueue as unknown as LoopQueueLike, missionId)
  }
}

/** Lazily initialise the worker; returns false when it cannot be created. */
async function ensureWorker(): Promise<boolean> {
  try {
    const { getAutopilotLoopWorker } = await import('../workers/autopilotLoopWorker')
    return getAutopilotLoopWorker() != null
  } catch (e) {
    console.warn('[AutopilotLoopQueueManager] Failed to init worker:', (e as Error).message)
    return false
  }
}
