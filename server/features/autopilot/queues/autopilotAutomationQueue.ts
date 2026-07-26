/**
 * Auto Pilot — `autopilot-automation` queue (Engagement_Automation lifecycle).
 *
 * Drives the go-live / stand-down lifecycle of the drafted Engagement_Automations
 * that {@link AutomationDecisionService.draftRule} produced (design "Queues" table
 * · R11). Two job kinds flow through it:
 *
 *   • `activate`   — enqueued the moment a slot's post is confirmed published, so
 *                    the guardrails-passed / approved drafted rule goes live within
 *                    60s of the publish confirm (R11.2). No delay — it runs now.
 *   • `deactivate` — a **delayed** job scheduled for `publishTime + 90 days`, when
 *                    the post's active engagement window closes and the rule is
 *                    stood down (R11.3). The delay comes from the pure
 *                    {@link computeDeactivationDelayMs} helper.
 *
 * Null-safe / lazy, mirroring `autopilotBriefQueue` and `server/queues/researchQueue.ts`:
 *   • when `REDIS_URL` is absent the queue is `null` and every enqueue is an inline
 *     no-op returning `false` (the caller keeps the rule in its current state and
 *     retries on a later Operating-Loop iteration), and
 *   • the worker is initialised lazily on first enqueue so importing this module
 *     never opens a Redis connection.
 *
 * Satisfies Requirements: 11.2, 11.3
 */

import { Queue, type QueueOptions } from 'bullmq'
import { getSharedRedisConnection } from '../../../lib/redis'
import type { SessionContext } from '../services/NotificationDispatcher'

/** Which half of the automation lifecycle a job represents. */
export type AutopilotAutomationJobKind = 'activate' | 'deactivate'

/**
 * R11.3: the active engagement window is 90 days from publish, after which the
 * drafted rule is deactivated. Exposed so the worker + tests share one source.
 */
export const ACTIVE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

/** R11.2: a drafted rule must go live within 60s of its post's publish confirm. */
export const ACTIVATION_WINDOW_MS = 60_000

/**
 * Where an activation-failure Escalation (R11.5) should be routed. Mirrors the
 * {@link NotificationDispatcher} target so mobile FCM / email fallback still work.
 */
export interface AutomationEscalationTarget {
  /** The user to notify when activation cannot be completed. */
  userId: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** Payload for a single `autopilot-automation` job. */
export interface AutopilotAutomationJobData {
  /** `activate` (go-live on publish confirm) or `deactivate` (90-day stand-down). */
  kind: AutopilotAutomationJobKind
  /** Owning mission — scopes audit + escalation. */
  missionId: string
  /** Workspace the mission (and rule) is bound to. */
  workspaceId: string
  /** The Content_Slot whose post the automation is attached to. */
  slotId: string
  /** The drafted `AutomationRule._id` to toggle active/inactive. */
  ruleId: string
  /** The post's publish confirmation time (ISO); anchors the 90-day window (R11.3). */
  publishedAt?: string
  /** Who to notify if activation is exhausted (R11.5). */
  target?: AutomationEscalationTarget
}

/**
 * Pure helper: the delay (ms) before a rule should be deactivated, i.e. the time
 * from `now` until `publishedAt + activeWindowMs` (R11.3). Never negative — a
 * window that has already elapsed schedules an immediate deactivation.
 */
export function computeDeactivationDelayMs(
  publishedAtMs: number,
  now: number,
  activeWindowMs: number = ACTIVE_WINDOW_MS,
): number {
  const target = publishedAtMs + activeWindowMs
  const delay = target - now
  return delay > 0 ? delay : 0
}

// ── Null-safe queue construction (mirrors autopilotBriefQueue) ───────────────
const redisConnection = process.env.REDIS_URL ? getSharedRedisConnection() : null

const queueOptions: QueueOptions = redisConnection
  ? {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        // A missed activate/deactivate is retried a few times; the worker's own
        // retry loop + idempotent toggle keep this from double-acting (R11.5/11.6).
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }
  : ({} as QueueOptions)

/** The `autopilot-automation` queue, or `null` when Redis is unavailable. */
export const autopilotAutomationQueue = redisConnection
  ? new Queue<AutopilotAutomationJobData>('autopilot-automation', queueOptions)
  : null

/** True when the automation queue is backed by a ready Redis connection. */
export function isAutopilotAutomationQueueAvailable(): boolean {
  return !!autopilotAutomationQueue && !!redisConnection && redisConnection.status === 'ready'
}

/** Inputs describing the activation to enqueue on publish confirm (R11.2). */
export interface ScheduleActivationInput {
  /** The drafted `AutomationRule._id`. */
  ruleId: string
  /** Owning mission id. */
  missionId: string
  /** Workspace id. */
  workspaceId: string
  /** The Content_Slot id. */
  slotId: string
  /** The post's publish confirmation time; anchors the later 90-day window. */
  publishedAt?: Date
  /** Who to notify if activation is exhausted (R11.5). */
  target?: AutomationEscalationTarget
}

/** Inputs describing the delayed deactivation to enqueue (R11.3). */
export interface ScheduleDeactivationInput {
  /** The `AutomationRule._id` to stand down. */
  ruleId: string
  /** Owning mission id. */
  missionId: string
  /** Workspace id. */
  workspaceId: string
  /** The Content_Slot id. */
  slotId: string
  /** The post's publish time; the window closes at `publishedAt + 90 days` (R11.3). */
  publishedAt: Date
  /** Injectable "now" (ms) for deterministic tests. Defaults to `Date.now()`. */
  now?: number
  /** Override the active-window length (ms); defaults to {@link ACTIVE_WINDOW_MS}. */
  activeWindowMs?: number
}

/**
 * Enqueues the automation `activate` job (immediately, R11.2) and the delayed
 * `deactivate` job (at publish + 90 days, R11.3). Null-safe + lazy: returns
 * `false` without touching Redis when the queue is unavailable, and initialises
 * the worker on first use. Stable `jobId`s de-duplicate re-scheduling.
 */
export class AutopilotAutomationQueueManager {
  /**
   * Enqueue the immediate `activate` job for a just-published slot (R11.2).
   *
   * @returns `true` once the job is enqueued, `false` if Redis / the worker is
   *   unavailable or enqueueing fails (the caller keeps the rule inactive).
   */
  static async scheduleActivation(input: ScheduleActivationInput): Promise<boolean> {
    if (!autopilotAutomationQueue) return false
    if (!(await ensureWorker())) return false

    try {
      await autopilotAutomationQueue.add(
        'activate',
        {
          kind: 'activate',
          missionId: input.missionId,
          workspaceId: input.workspaceId,
          slotId: input.slotId,
          ruleId: input.ruleId,
          publishedAt: input.publishedAt?.toISOString(),
          target: input.target,
        },
        { jobId: `automation-activate-${input.ruleId}`, delay: 0, priority: 5 },
      )
      return true
    } catch (error) {
      console.error(
        '[AutopilotAutomationQueueManager] Failed to schedule activation:',
        (error as Error).message,
      )
      return false
    }
  }

  /**
   * Enqueue the delayed `deactivate` job at `publishTime + 90 days` (R11.3). The
   * delay is computed by {@link computeDeactivationDelayMs} so a window that has
   * already elapsed deactivates immediately.
   *
   * @returns `true` once the job is enqueued, `false` if Redis / the worker is
   *   unavailable or enqueueing fails (the caller can retry on a later iteration).
   */
  static async scheduleDeactivation(input: ScheduleDeactivationInput): Promise<boolean> {
    if (!autopilotAutomationQueue) return false
    if (!(await ensureWorker())) return false

    const now = input.now ?? Date.now()
    const delay = computeDeactivationDelayMs(
      input.publishedAt.getTime(),
      now,
      input.activeWindowMs ?? ACTIVE_WINDOW_MS,
    )

    try {
      await autopilotAutomationQueue.add(
        'deactivate',
        {
          kind: 'deactivate',
          missionId: input.missionId,
          workspaceId: input.workspaceId,
          slotId: input.slotId,
          ruleId: input.ruleId,
          publishedAt: input.publishedAt.toISOString(),
        },
        { jobId: `automation-deactivate-${input.ruleId}`, delay, priority: 6 },
      )
      return true
    } catch (error) {
      console.error(
        '[AutopilotAutomationQueueManager] Failed to schedule deactivation:',
        (error as Error).message,
      )
      return false
    }
  }
}

/** Lazily initialise the worker; returns false when it cannot be created. */
async function ensureWorker(): Promise<boolean> {
  try {
    const { getAutopilotAutomationWorker } = await import('../workers/autopilotAutomationWorker')
    return getAutopilotAutomationWorker() != null
  } catch (e) {
    console.warn('[AutopilotAutomationQueueManager] Failed to init worker:', (e as Error).message)
    return false
  }
}
