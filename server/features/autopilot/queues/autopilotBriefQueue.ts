/**
 * Auto Pilot — `autopilot-brief` queue.
 *
 * Schedules the just-in-time Content_Brief flow as BullMQ **delayed jobs**
 * (design "Queues" table · R7):
 *
 *   • one `send` job at `publishTime − leadTime` (R7.3) that delivers the brief
 *     as a User_Input_Notification (R7.4), and
 *   • up to three `reminder` jobs fired when the remaining Lead_Time reaches
 *     50 % / 25 % / 10 % (R7.5), whose fire-times come from the pure
 *     {@link computeReminderSchedule} helper (Property 12).
 *
 * Null-safe / lazy, mirroring `server/queues/researchQueue.ts`:
 *   • when `REDIS_URL` is absent the queue is `null` and every enqueue is an
 *     inline no-op that returns `false` (the caller keeps the brief `pending` and
 *     retries on a later Operating-Loop iteration), and
 *   • the worker is initialised lazily on first enqueue so importing this module
 *     never opens a Redis connection.
 *
 * Satisfies Requirements: 7.3, 7.4, 7.5 (Property 12)
 */

import { Queue, type QueueOptions } from 'bullmq'
import { getSharedRedisConnection } from '../../../lib/redis'
import type { SessionContext } from '../services/NotificationDispatcher'
import { computeReminderSchedule, computeSendDelayMs } from './briefSchedule'

/** Which stage of the brief flow a job represents. */
export type AutopilotBriefJobKind = 'send' | 'reminder'

/**
 * Where a brief send / reminder notification should be routed (R7.4). Mirrors the
 * {@link NotificationDispatcher} target so mobile FCM / email fallback still work.
 */
export interface BriefDeliveryTarget {
  /** The user to notify. */
  userId: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** Payload for a single `autopilot-brief` job. */
export interface AutopilotBriefJobData {
  /** `send` (deliver the brief) or `reminder` (escalating nudge). */
  kind: AutopilotBriefJobKind
  /** The `ContentBrief._id` this job acts on. */
  briefId: string
  /** Owning mission — scopes audit + notifications. */
  missionId: string
  /** Workspace the brief is bound to. */
  workspaceId: string
  /** The Content_Slot the brief feeds. */
  slotId: string
  /** For reminders: 1-based reminder number (1 = 50 %, 2 = 25 %, 3 = 10 %). */
  reminderIndex?: number
  /** For reminders: the remaining-Lead_Time fraction this reminder fires at. */
  fraction?: number
  /** Who to notify (R7.4); when absent the worker skips the notification. */
  target?: BriefDeliveryTarget
}

// ── Null-safe queue construction (mirrors researchQueue) ─────────────────────
// Only touch Redis when REDIS_URL is configured; otherwise the queue is null and
// scheduling degrades to an inline no-op (R: graceful degradation without Redis).
const redisConnection = process.env.REDIS_URL ? getSharedRedisConnection() : null

const queueOptions: QueueOptions = redisConnection
  ? {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        // A missed send/reminder is retried a couple of times; the remindersSent
        // counter keeps retries from over-notifying (R7.5, design idempotency).
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }
  : ({} as QueueOptions)

/** The `autopilot-brief` queue, or `null` when Redis is unavailable. */
export const autopilotBriefQueue = redisConnection
  ? new Queue<AutopilotBriefJobData>('autopilot-brief', queueOptions)
  : null

/** True when the brief queue is backed by a ready Redis connection. */
export function isAutopilotBriefQueueAvailable(): boolean {
  return !!autopilotBriefQueue && !!redisConnection && redisConnection.status === 'ready'
}

/** Inputs describing the brief whose delivery should be scheduled. */
export interface ScheduleBriefDeliveryInput {
  /** `ContentBrief._id`. */
  briefId: string
  /** Owning mission id. */
  missionId: string
  /** Workspace id. */
  workspaceId: string
  /** The Content_Slot id. */
  slotId: string
  /** The brief send time — `publishTime − leadTime` (R7.3). */
  sendAt: Date
  /** Total Lead_Time (ms) = `publishTime − sendAt`; anchors the reminder fractions. */
  leadTimeMs: number
  /** Who to notify (R7.4). */
  target?: BriefDeliveryTarget
  /** Injectable "now" (ms) for deterministic tests. Defaults to `Date.now()`. */
  now?: number
  /** Override the reminder fractions (defaults to 50/25/10 %). */
  reminderFractions?: readonly number[]
}

/**
 * Enqueues the brief `send` job and its ≤3 escalating `reminder` jobs, computing
 * every delay from the pure scheduling helper. Null-safe + lazy: returns `false`
 * without touching Redis when the queue is unavailable, and initialises the
 * worker on first use.
 */
export class AutopilotBriefQueueManager {
  /**
   * Schedule the brief send (R7.3) and its escalating reminders (R7.5).
   *
   * Uses stable, deterministic `jobId`s (`brief-send-<id>` / `brief-reminder-<id>-<n>`)
   * so re-scheduling the same brief de-duplicates rather than double-booking.
   *
   * @returns `true` once the jobs are enqueued, `false` if Redis / the worker is
   *   unavailable or enqueueing fails (the caller preserves the brief's state).
   */
  static async scheduleBriefDelivery(input: ScheduleBriefDeliveryInput): Promise<boolean> {
    if (!autopilotBriefQueue) return false

    // Lazy worker init — nothing consumes the jobs until a worker exists.
    try {
      const { getAutopilotBriefWorker } = await import('../workers/autopilotBriefWorker')
      const worker = getAutopilotBriefWorker()
      if (!worker) return false
    } catch (e) {
      console.warn('[AutopilotBriefQueueManager] Failed to init worker:', (e as Error).message)
      return false
    }

    const now = input.now ?? Date.now()
    const sendAtMs = input.sendAt.getTime()
    const publishAtMs = sendAtMs + input.leadTimeMs

    const sendDelay = computeSendDelayMs(sendAtMs, now)
    const reminders = computeReminderSchedule({
      sendAtMs,
      publishAtMs,
      now,
      fractions: input.reminderFractions,
    })

    const base = {
      briefId: input.briefId,
      missionId: input.missionId,
      workspaceId: input.workspaceId,
      slotId: input.slotId,
      target: input.target,
    }

    try {
      await autopilotBriefQueue.add(
        'send',
        { ...base, kind: 'send' },
        { jobId: `brief-send-${input.briefId}`, delay: sendDelay, priority: 5 },
      )

      for (const reminder of reminders) {
        await autopilotBriefQueue.add(
          'reminder',
          { ...base, kind: 'reminder', reminderIndex: reminder.index, fraction: reminder.fraction },
          {
            jobId: `brief-reminder-${input.briefId}-${reminder.index}`,
            delay: reminder.delayMs,
            priority: 6,
          },
        )
      }

      return true
    } catch (error) {
      console.error(
        '[AutopilotBriefQueueManager] Failed to schedule brief delivery:',
        (error as Error).message,
      )
      return false
    }
  }
}
