/**
 * Auto Pilot — `autopilot-brief` worker.
 *
 * Consumes the delayed jobs scheduled by {@link AutopilotBriefQueueManager} and
 * turns them into delivered User_Input_Notifications:
 *
 *   • `send`     → deliver the Content_Brief once and mark it `sent` (R7.3/R7.4).
 *   • `reminder` → send an escalating nudge, but only while the brief is still
 *                  undelivered and fewer than {@link MAX_REMINDERS} reminders have
 *                  gone out (R7.5). The persisted `remindersSent` counter is the
 *                  runtime guard, so even a retried/duplicated job can never push
 *                  a brief past 3 reminders (design idempotency note · Property 12).
 *
 * The job-processing logic is extracted into {@link createBriefJobProcessor} with
 * every dependency (brief store + notification dispatcher) injected, so it is
 * fully unit-testable without Redis, Mongo, or a real notification transport. The
 * lazy {@link getAutopilotBriefWorker} wires the real defaults and is initialised
 * on first enqueue (mirrors `server/workers/researchWorker.ts`).
 *
 * Fallback resolution (AI-backup / reschedule at `publishTime − 30m`) is Task 10.3
 * and deliberately not handled here.
 *
 * Satisfies Requirements: 7.3, 7.4, 7.5 (Property 12)
 */

import { Worker, type Job } from 'bullmq'
import { getSharedRedisConnection } from '../../../lib/redis'
import { logger } from '../../../config/logger'
import {
  ContentBriefModel,
  type ContentBriefStatus,
} from '../db/models'
import {
  NotificationDispatcher,
  notificationDispatcher,
} from '../services/NotificationDispatcher'
import { MAX_REMINDERS } from '../queues/briefSchedule'
import type { AutopilotBriefJobData, BriefDeliveryTarget } from '../queues/autopilotBriefQueue'

const COMPONENT = 'autopilot.autopilotBriefWorker'

/** Statuses at which a brief is still awaiting the user's media (R7.5). */
const UNDELIVERED_STATUSES: ReadonlyArray<ContentBriefStatus> = ['pending', 'sent']

/** The minimal brief view the worker needs to route + gate a notification. */
export interface BriefJobView {
  status: ContentBriefStatus
  remindersSent: number
  workspaceId: string
  slotId: string
  concept?: string
}

/**
 * Persistence port for the worker. Defaults read/update `ContentBriefModel`, but
 * tests inject an in-memory implementation.
 */
export interface BriefWorkerStore {
  /** Load the brief's routing/gating view, or `null` if it no longer exists. */
  load(briefId: string): Promise<BriefJobView | null>
  /**
   * Mark a `pending` brief `sent` after its send notification is delivered.
   * A no-op if the brief has already advanced past `pending`.
   */
  markSent(briefId: string): Promise<void>
  /**
   * Atomically bump `remindersSent` **iff** the brief is still undelivered and
   * under the {@link MAX_REMINDERS} cap. Returns the new count, or `null` when the
   * bound/undelivered guard rejected the bump (R7.5).
   */
  incrementReminderIfUndelivered(briefId: string): Promise<number | null>
}

/** Injectable dependencies for {@link createBriefJobProcessor}. */
export interface BriefWorkerDeps {
  store: BriefWorkerStore
  dispatcher: Pick<NotificationDispatcher, 'dispatch'>
}

/** Outcome of processing one brief job (surfaced for tests + logging). */
export type BriefJobResult =
  | { action: 'sent'; delivered: boolean }
  | { action: 'reminded'; reminderCount: number; delivered: boolean }
  | { action: 'skipped'; reason: 'not-found' | 'already-sent' | 'capped-or-delivered' }

/** The default store backed by `ContentBriefModel`. */
const defaultStore: BriefWorkerStore = {
  async load(briefId) {
    const doc = await ContentBriefModel.findById(briefId)
      .select('status remindersSent workspaceId slotId concept')
      .lean()
      .exec()
    if (!doc) return null
    return {
      status: doc.status,
      remindersSent: doc.remindersSent ?? 0,
      workspaceId: String(doc.workspaceId),
      slotId: String(doc.slotId),
      concept: doc.concept,
    }
  },
  async markSent(briefId) {
    await ContentBriefModel.updateOne(
      { _id: briefId, status: 'pending' },
      { $set: { status: 'sent' } },
    ).exec()
  },
  async incrementReminderIfUndelivered(briefId) {
    const updated = await ContentBriefModel.findOneAndUpdate(
      {
        _id: briefId,
        status: { $in: UNDELIVERED_STATUSES as ContentBriefStatus[] },
        remindersSent: { $lt: MAX_REMINDERS },
      },
      { $inc: { remindersSent: 1 } },
      { new: true },
    )
      .select('remindersSent')
      .lean()
      .exec()
    return updated ? (updated.remindersSent ?? null) : null
  },
}

/** Build the send notification for a brief (R7.4). */
function sendNotification(data: AutopilotBriefJobData, brief: BriefJobView, target: BriefDeliveryTarget) {
  const concept = brief.concept ? ` "${brief.concept}"` : ''
  return {
    userId: target.userId,
    workspaceId: brief.workspaceId,
    title: 'Auto Pilot: your content brief is ready',
    message:
      `Here's what to shoot for an upcoming post${concept}. ` +
      'Open Auto Pilot to see the concept, hook, shot list, and suggested caption.',
    type: 'alert' as const,
    sessionContext: target.sessionContext,
    deviceToken: target.deviceToken,
    email: target.email,
  }
}

/** Build the Nth escalating reminder notification for a brief (R7.5). */
function reminderNotification(
  data: AutopilotBriefJobData,
  brief: BriefJobView,
  target: BriefDeliveryTarget,
  reminderNumber: number,
) {
  return {
    userId: target.userId,
    workspaceId: brief.workspaceId,
    title: `Auto Pilot reminder (${reminderNumber}/${MAX_REMINDERS})`,
    message:
      'Your content brief is still waiting. Create and upload the media soon so ' +
      'your scheduled post goes out on time.',
    type: 'alert' as const,
    sessionContext: target.sessionContext,
    deviceToken: target.deviceToken,
    email: target.email,
  }
}

/**
 * Build the pure job processor for the brief flow. Given the injected store +
 * dispatcher, it delivers sends once and reminders only while undelivered and
 * under the ≤3 cap (R7.4/R7.5). Never throws for an expected-missing brief; it
 * reports the outcome so the worker (and tests) can assert on it.
 */
export function createBriefJobProcessor(deps: BriefWorkerDeps) {
  return async function processBriefJob(data: AutopilotBriefJobData): Promise<BriefJobResult> {
    const brief = await deps.store.load(data.briefId)
    if (!brief) {
      logger.warn('brief job for missing brief — skipping', {
        component: COMPONENT,
        briefId: data.briefId,
        kind: data.kind,
      })
      return { action: 'skipped', reason: 'not-found' }
    }

    if (data.kind === 'send') {
      // Deliver the brief exactly once (R7.3/R7.4). A brief already advanced past
      // `pending` was sent (or resolved) already — skip to stay idempotent.
      if (brief.status !== 'pending') {
        return { action: 'skipped', reason: 'already-sent' }
      }
      const delivered = await maybeDispatch(deps, data, () => sendNotification(data, brief, data.target!))
      await deps.store.markSent(data.briefId)
      return { action: 'sent', delivered }
    }

    // Reminder: enforce the ≤3 cap + undelivered guard atomically (R7.5). The
    // store returns null when the brief is already delivered or at the cap, so a
    // retried/duplicate job can never over-notify (Property 12).
    const newCount = await deps.store.incrementReminderIfUndelivered(data.briefId)
    if (newCount === null) {
      return { action: 'skipped', reason: 'capped-or-delivered' }
    }
    const delivered = await maybeDispatch(deps, data, () =>
      reminderNotification(data, brief, data.target!, newCount),
    )
    return { action: 'reminded', reminderCount: newCount, delivered }
  }
}

/**
 * Dispatch a notification when a target is present. Returns whether any channel
 * delivered; a missing target (nothing to notify) counts as not delivered but is
 * not an error — the state transition still applies.
 */
async function maybeDispatch(
  deps: BriefWorkerDeps,
  data: AutopilotBriefJobData,
  build: () => ReturnType<typeof sendNotification>,
): Promise<boolean> {
  if (!data.target || !data.target.userId) {
    logger.warn('brief job has no notification target', {
      component: COMPONENT,
      briefId: data.briefId,
      kind: data.kind,
    })
    return false
  }
  const result = await deps.dispatcher.dispatch(build())
  return !result.undelivered
}

// ── Lazy BullMQ worker (mirrors researchWorker) ──────────────────────────────
let autopilotBriefWorker: Worker<AutopilotBriefJobData> | null = null

/**
 * Lazily initialise the `autopilot-brief` worker on first use. Returns `null`
 * when Redis is unavailable so the queue manager degrades gracefully.
 */
export function getAutopilotBriefWorker(): Worker<AutopilotBriefJobData> | null {
  if (autopilotBriefWorker) return autopilotBriefWorker

  if (!process.env.REDIS_URL) {
    return null
  }

  const connection = getSharedRedisConnection()
  if (!connection) {
    logger.warn('Redis unavailable, autopilot-brief worker cannot be initialized', {
      component: COMPONENT,
    })
    return null
  }

  const processJob = createBriefJobProcessor({
    store: defaultStore,
    dispatcher: notificationDispatcher,
  })

  autopilotBriefWorker = new Worker<AutopilotBriefJobData>(
    'autopilot-brief',
    async (job: Job<AutopilotBriefJobData>) => processJob(job.data),
    { connection, concurrency: 3 },
  )

  autopilotBriefWorker.on('failed', (job, err) => {
    logger.error('autopilot-brief job failed', err, {
      component: COMPONENT,
      jobId: job?.id,
      kind: job?.data?.kind,
    })
  })

  return autopilotBriefWorker
}
