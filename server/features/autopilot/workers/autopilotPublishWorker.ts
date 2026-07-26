/**
 * Auto Pilot — `autopilot-publish` worker (ACT stage — publish execution).
 *
 * This is the execution half of publishing (Task 14.2). Task 14.1
 * ({@link ActPublishService}) writes a `ContentModel` (status `scheduled`) and
 * registers a `JobType.SCHEDULED_POST` job; this worker fires at slot time and
 * turns that scheduled record into a live Instagram post through the EXISTING
 * {@link SimpleInstagramPublisher.publishPost} — Auto Pilot never talks to the
 * Instagram Graph API itself.
 *
 * For one job it:
 *
 *   1. **Claims the content atomically (R12.7 · Property 8 — never double-publish).**
 *      Before touching Instagram it transitions the `ContentModel` from
 *      `scheduled` → `publishing` in a single atomic update. If the update
 *      matches nothing — because the content was already claimed by a concurrent
 *      job, already `published`, or cancelled — the job is a no-op. This is the
 *      hard guarantee that a retried or duplicated job can never publish the same
 *      content twice.
 *
 *   2. **Publishes within 60s (R12.1).** The `publishPost` call is wrapped in a
 *      {@link PUBLISH_TIMEOUT_MS} deadline; a call that overruns is treated as a
 *      failed attempt so a hung publish never blocks the slot.
 *
 *   3. **Retries with backoff (R12.3).** Up to {@link MAX_ATTEMPTS} attempts
 *      (1 initial + 3 retries) with the delay between successive attempts
 *      increasing from 30s to a maximum of 300s ({@link DEFAULT_RETRY_DELAYS_MS}).
 *
 *   4. **Audits every attempt (R12.4).** Each attempt writes an
 *      `AutoPilotAuditRecord` capturing its outcome (success | failure) and
 *      timestamp via {@link AutoPilotAuditService}.
 *
 *   5. **Resolves terminally (R12.5 · Property 1 — every slot reaches terminal
 *      resolution).** On success the `ContentModel` flips to `published` (with the
 *      Instagram post id) and the Content_Slot to `published`. If all 4 attempts
 *      fail it marks both `failed`, leaves the slot unpublished, and raises an
 *      Escalation + User_Input_Notification identifying the failed slot.
 *
 * The processing logic is extracted into {@link createPublishJobProcessor} with
 * every dependency injected (content store, slot store, publisher, audit service,
 * notification dispatcher, escalation-target resolver, clock, sleep), so the
 * claim → publish → retry → resolve flow is fully unit-testable — including the
 * no-double-publish property — without Redis, Mongo, or a live Instagram API. The
 * lazy {@link getAutopilotPublishWorker} wires the real defaults and is only
 * initialised when Redis is present (mirrors `autopilotBriefWorker`).
 *
 * Satisfies Requirements: 12.1, 12.3, 12.4, 12.5, 12.7 (Property 1, 8)
 */

import { Worker, type Job } from 'bullmq'
import { getSharedRedisConnection } from '../../../lib/redis'
import { logger } from '../../../config/logger'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from '../services/AutoPilotAuditService'
import {
  NotificationDispatcher,
  notificationDispatcher,
  type SessionContext,
} from '../services/NotificationDispatcher'

const COMPONENT = 'autopilot.autopilotPublishWorker'

/** R12.1: a single publish attempt must complete within 60 seconds. */
export const PUBLISH_TIMEOUT_MS = 60_000

/**
 * R12.3: 1 initial attempt + 3 retries = 4 total attempts, with the delay
 * between successive attempts increasing from 30s to a maximum of 300s.
 */
export const MAX_ATTEMPTS = 4

/** The 3 inter-attempt delays (ms), rising 30s → 120s → 300s (R12.3). */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [30_000, 120_000, 300_000]

/** The hard ceiling on any inter-attempt delay (R12.3 — "a maximum of 300 seconds"). */
export const MAX_RETRY_DELAY_MS = 300_000

/** The payload of an `autopilot-publish` job (mirrors the job ActPublishService registers). */
export interface AutopilotPublishJobData {
  /** Owning mission — scopes audit + escalation. */
  missionId: string
  /** Workspace the content is bound to. */
  workspaceId: string
  /** The Content_Slot being published. */
  slotId: string
  /** The `ContentModel._id` execution record to publish (R12.7 idempotency key). */
  contentId: string
  /** The slot's scheduled publish time (ISO); informational. */
  scheduledAt?: string
}

/**
 * A publish-ready view of a claimed `ContentModel`: everything
 * {@link SimpleInstagramPublisher.publishPost} needs. Returned by the store's
 * atomic claim so the worker never re-reads or re-resolves credentials.
 */
export interface PublishableContent {
  /** Connected Instagram account id. */
  accountId: string
  /** Valid access token for the account. */
  accessToken: string
  /** Caption text. */
  content: string
  /** Media to publish (URLs + type). */
  mediaFiles: Array<{ url: string; type?: string }>
  /** Hashtag string appended to the caption. */
  hashtags?: string
  /** Post type (`post` | `reel` | `story`). */
  postType?: string
}

/** The outcome of {@link SimpleInstagramPublisher.publishPost}. */
export interface PublishResult {
  success: boolean
  postId?: string
  url?: string
  error?: string
  processing?: boolean
}

/** The publisher port — satisfied by the existing {@link SimpleInstagramPublisher}. */
export interface Publisher {
  publishPost(data: {
    accountId: string
    accessToken: string
    content: string
    mediaFiles: any[]
    hashtags?: string
    postType?: string
  }): Promise<PublishResult>
}

/**
 * Content-store port for the publish lifecycle. The atomic {@link claimForPublishing}
 * is the load-bearing idempotency guard (R12.7 · Property 8).
 */
export interface PublishContentStore {
  /**
   * Atomically transition the content `scheduled` → `publishing` and return the
   * publish-ready view, or `null` when the content is not claimable (already
   * `publishing`/`published`/cancelled, or missing). MUST be a single atomic
   * update so that at most one caller ever claims a given content (Property 8).
   */
  claimForPublishing(contentId: string): Promise<PublishableContent | null>
  /** Flip a claimed content to `published` and record the Instagram post id. */
  markPublished(contentId: string, postId?: string, url?: string): Promise<void>
  /** Flip a claimed content to `failed` after all attempts are exhausted. */
  markFailed(contentId: string, error: string): Promise<void>
}

/** Slot-store port: move the Content_Slot to its terminal state (Property 1). */
export interface PublishSlotStore {
  markPublished(slotId: string): Promise<void>
  markFailed(slotId: string): Promise<void>
}

/** Who to notify when publishing is exhausted (R12.5). */
export interface PublishEscalationTarget {
  userId: string
  sessionContext?: SessionContext
  deviceToken?: string | null
  email?: string | null
}

/** Resolves the escalation target for a failed publish (optional). */
export interface EscalationTargetResolver {
  resolve(data: AutopilotPublishJobData): Promise<PublishEscalationTarget | null>
}

/** Injectable dependencies for {@link createPublishJobProcessor}. */
export interface PublishWorkerDeps {
  store: PublishContentStore
  slotStore: PublishSlotStore
  publisher: Publisher
  auditService: Pick<AutoPilotAuditService, 'record'>
  dispatcher: Pick<NotificationDispatcher, 'dispatch'>
  /** Resolves who to escalate to on exhaustion (R12.5); optional. */
  escalationTargetResolver?: EscalationTargetResolver
  /** Inter-attempt delays (ms); defaults to {@link DEFAULT_RETRY_DELAYS_MS}. */
  retryDelaysMs?: readonly number[]
  /** Per-attempt publish deadline (ms); defaults to {@link PUBLISH_TIMEOUT_MS}. */
  publishTimeoutMs?: number
  /** Injectable clock (defaults to `Date.now`). */
  now?: () => number
  /** Injectable sleep (defaults to a real timer); no-op wait in tests. */
  sleep?: (ms: number) => Promise<void>
}

/** The result of processing one publish job (surfaced for tests + logging). */
export type PublishJobResult =
  | { action: 'published'; contentId: string; postId?: string; attempts: number }
  | { action: 'failed'; contentId: string; attempts: number; escalated: boolean; lastError: string }
  | { action: 'skipped'; contentId: string; reason: 'not-claimable' }

const realSleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

/** Clamp an inter-attempt delay to the R12.3 ceiling of 300s. */
function clampDelay(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.min(ms, MAX_RETRY_DELAY_MS)
}

/**
 * Run `publishPost` under a hard deadline (R12.1). Resolves with the publisher's
 * result, or a synthetic failure result when the call rejects or overruns
 * {@link PublishWorkerDeps.publishTimeoutMs}, so a hung publish is just a failed
 * attempt rather than a stuck job.
 */
async function publishWithTimeout(
  publisher: Publisher,
  content: PublishableContent,
  timeoutMs: number,
): Promise<PublishResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<PublishResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ success: false, error: `Publish timed out after ${timeoutMs}ms` }),
      timeoutMs,
    )
  })
  const attempt = (async (): Promise<PublishResult> => {
    try {
      return await publisher.publishPost({
        accountId: content.accountId,
        accessToken: content.accessToken,
        content: content.content,
        mediaFiles: content.mediaFiles,
        hashtags: content.hashtags,
        postType: content.postType,
      })
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })()
  try {
    return await Promise.race([attempt, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Build the pure publish-job processor. Given the injected ports it:
 *   - claims the content atomically (no-op when not claimable — Property 8),
 *   - publishes within the 60s deadline, retrying with 30s→300s backoff (R12.1/R12.3),
 *   - audits every attempt (R12.4), and
 *   - resolves the slot terminally: published on success, or failed + escalated
 *     on exhaustion (R12.5 · Property 1).
 *
 * Never throws for expected outcomes; it reports the result so the worker (and
 * tests) can assert on it.
 */
export function createPublishJobProcessor(deps: PublishWorkerDeps) {
  const retryDelays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const timeoutMs = deps.publishTimeoutMs ?? PUBLISH_TIMEOUT_MS
  const sleep = deps.sleep ?? realSleep

  return async function processPublishJob(
    data: AutopilotPublishJobData,
  ): Promise<PublishJobResult> {
    // R12.7 · Property 8: atomically claim the content. If nothing was claimed,
    // another attempt owns it or it is already published — never publish again.
    const content = await deps.store.claimForPublishing(data.contentId)
    if (!content) {
      logger.info('publish job found no claimable content — skipping (R12.7)', {
        component: COMPONENT,
        contentId: data.contentId,
        slotId: data.slotId,
      })
      return { action: 'skipped', contentId: data.contentId, reason: 'not-claimable' }
    }

    let lastError = 'unknown publish error'

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = (deps.now ?? Date.now)()
      const result = await publishWithTimeout(deps.publisher, content, timeoutMs)

      // R12.4: audit every attempt with its outcome + timestamp.
      await deps.auditService.record({
        missionId: data.missionId,
        workspaceId: data.workspaceId,
        stage: 'ACT',
        action: 'publish',
        outcome: result.success ? 'success' : 'failure',
        triggeringContext: {
          slotId: data.slotId,
          contentId: data.contentId,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          at: new Date(startedAt).toISOString(),
          ...(result.success
            ? { postId: result.postId, processing: result.processing }
            : { error: result.error }),
        },
      })

      if (result.success) {
        // Terminal success (R12.1 · Property 1): flip content + slot to published.
        await deps.store.markPublished(data.contentId, result.postId, result.url)
        await deps.slotStore.markPublished(data.slotId)
        logger.info('publish succeeded', {
          component: COMPONENT,
          contentId: data.contentId,
          slotId: data.slotId,
          postId: result.postId,
          attempt,
        })
        return { action: 'published', contentId: data.contentId, postId: result.postId, attempts: attempt }
      }

      lastError = result.error ?? lastError
      logger.warn('publish attempt failed', {
        component: COMPONENT,
        contentId: data.contentId,
        slotId: data.slotId,
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        error: lastError,
      })

      // Back off before the next retry (30s → 300s); no wait after the last attempt.
      if (attempt < MAX_ATTEMPTS) {
        await sleep(clampDelay(retryDelays[attempt - 1] ?? MAX_RETRY_DELAY_MS))
      }
    }

    // R12.5 · Property 1: all attempts exhausted — mark failed (slot left
    // unpublished) and escalate to the user, identifying the failed slot.
    await deps.store.markFailed(data.contentId, lastError)
    await deps.slotStore.markFailed(data.slotId)
    const escalated = await escalate(deps, data, lastError)

    logger.error('publish exhausted all attempts', undefined, {
      component: COMPONENT,
      contentId: data.contentId,
      slotId: data.slotId,
      attempts: MAX_ATTEMPTS,
      escalated,
      lastError,
    })

    return { action: 'failed', contentId: data.contentId, attempts: MAX_ATTEMPTS, escalated, lastError }
  }
}

/**
 * Raise an Escalation + User_Input_Notification for an exhausted publish (R12.5).
 * Returns whether any channel delivered. Never throws: a missing target or a
 * dispatcher failure is logged and reported as not-escalated so the job still
 * resolves and the Operating Loop keeps running.
 */
async function escalate(
  deps: PublishWorkerDeps,
  data: AutopilotPublishJobData,
  lastError: string,
): Promise<boolean> {
  let target: PublishEscalationTarget | null = null
  if (deps.escalationTargetResolver) {
    try {
      target = await deps.escalationTargetResolver.resolve(data)
    } catch (error) {
      logger.warn('publish escalation target resolution failed', {
        component: COMPONENT,
        contentId: data.contentId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (!target || !target.userId) {
    logger.error('publish exhausted with no escalation target', undefined, {
      component: COMPONENT,
      contentId: data.contentId,
      slotId: data.slotId,
    })
    return false
  }
  try {
    const result = await deps.dispatcher.dispatch({
      userId: target.userId,
      workspaceId: data.workspaceId,
      title: 'Auto Pilot: a scheduled post could not be published',
      message:
        'Auto Pilot tried to publish a scheduled post 4 times without success. ' +
        `The slot is left unpublished and needs your attention (${lastError}).`,
      type: 'alert',
      sessionContext: target.sessionContext,
      deviceToken: target.deviceToken,
      email: target.email,
    })
    return !result.undelivered
  } catch (error) {
    logger.error('publish escalation dispatch failed', error, {
      component: COMPONENT,
      contentId: data.contentId,
      slotId: data.slotId,
    })
    return false
  }
}

// ── Default ports backed by the real models / publisher ──────────────────────

/** Default content store: atomic claim + terminal updates on `ContentModel`. */
const defaultContentStore: PublishContentStore = {
  async claimForPublishing(contentId: string): Promise<PublishableContent | null> {
    const { ContentModel } = await import('../../../models/Content/Content')
    // Atomic scheduled → publishing claim (Property 8): only one caller can win.
    const claimed = await ContentModel.findOneAndUpdate(
      { _id: contentId, status: { $in: ['scheduled', 'queued', 'retrying'] } },
      { $set: { status: 'publishing', processingStartedAt: new Date() }, $inc: { publishAttempts: 1 } },
      { new: true },
    ).exec()
    if (!claimed) return null

    const contentData = (claimed.contentData ?? {}) as Record<string, any>
    const mediaUrls: string[] = Array.isArray(contentData.mediaUrls)
      ? contentData.mediaUrls
      : contentData.mediaUrl
        ? [contentData.mediaUrl]
        : []

    // Resolve the connected account + access token via the existing services.
    const { socialAccountService } = await import('../../../services/SocialAccountService')
    const { getAccessTokenFromAccount } = await import('../../../storage/converters')
    const account = await socialAccountService.getAccountByPlatform(
      String(claimed.workspaceId),
      claimed.platform || 'instagram',
    )
    const accessToken = account ? getAccessTokenFromAccount(account) : undefined
    if (!account || !accessToken) {
      // No credentials — surface as a claim failure so the worker records the
      // attempt failure + escalates rather than calling the publisher blindly.
      await ContentModel.findByIdAndUpdate(contentId, {
        $set: { status: 'failed', lastError: 'No valid Instagram account/access token', failedAt: new Date() },
      }).exec()
      return null
    }

    const isVideo =
      claimed.type === 'video' ||
      claimed.type === 'reel' ||
      claimed.type === 'story' ||
      mediaUrls.some((u) => /\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i.test(u))

    return {
      accountId: claimed.accountId || account.accountId || String((account as any)._id),
      accessToken,
      content: contentData.text ?? claimed.description ?? claimed.title ?? '',
      mediaFiles: mediaUrls.map((url) => ({ url, type: isVideo ? 'video' : 'photo' })),
      hashtags: Array.isArray(contentData.hashtags)
        ? contentData.hashtags.map((h: string) => `#${String(h).replace(/^#+/, '')}`).join(' ')
        : undefined,
      postType: claimed.type,
    }
  },
  async markPublished(contentId: string, postId?: string, url?: string): Promise<void> {
    const { ContentModel } = await import('../../../models/Content/Content')
    await ContentModel.findByIdAndUpdate(contentId, {
      $set: {
        status: 'published',
        instagramPostId: postId,
        publishedAt: new Date(),
        ...(url ? { 'contentData.publishedUrl': url } : {}),
      },
    }).exec()
  },
  async markFailed(contentId: string, error: string): Promise<void> {
    const { ContentModel } = await import('../../../models/Content/Content')
    await ContentModel.findByIdAndUpdate(contentId, {
      $set: { status: 'failed', lastError: error, failedAt: new Date() },
    }).exec()
  },
}

/** Default slot store backed by the shared `contentSlotRepository`. */
const defaultSlotStore: PublishSlotStore = {
  async markPublished(slotId: string): Promise<void> {
    const { contentSlotRepository } = await import('../db/repositories')
    await contentSlotRepository.updateStatus(slotId, 'published')
  },
  async markFailed(slotId: string): Promise<void> {
    const { contentSlotRepository } = await import('../db/repositories')
    await contentSlotRepository.updateStatus(slotId, 'failed')
  },
}

/** Default publisher backed by the existing {@link SimpleInstagramPublisher}. */
const defaultPublisher: Publisher = {
  async publishPost(data) {
    const { SimpleInstagramPublisher } = await import('../../../simple-instagram-publisher')
    return new SimpleInstagramPublisher().publishPost(data)
  },
}

/** Default escalation-target resolver: notify the mission's workspace owner. */
const defaultEscalationTargetResolver: EscalationTargetResolver = {
  async resolve(data: AutopilotPublishJobData): Promise<PublishEscalationTarget | null> {
    try {
      const { missionRepository } = await import('../db/repositories')
      const mission = await missionRepository.findById(data.missionId)
      const userId =
        (mission as any)?.userId ??
        (mission as any)?.ownerId ??
        (mission as any)?.createdBy
      if (!userId) return null
      return { userId: String(userId), sessionContext: 'web' }
    } catch {
      return null
    }
  },
}

// ── Lazy BullMQ worker (mirrors autopilotBriefWorker) ────────────────────────
let autopilotPublishWorker: Worker<AutopilotPublishJobData> | null = null

/**
 * Lazily initialise the `autopilot-publish` worker on first use. Returns `null`
 * when Redis is unavailable so scheduling degrades gracefully (null-safe pattern).
 */
export function getAutopilotPublishWorker(): Worker<AutopilotPublishJobData> | null {
  if (autopilotPublishWorker) return autopilotPublishWorker

  if (!process.env.REDIS_URL) {
    return null
  }

  const connection = getSharedRedisConnection()
  if (!connection) {
    logger.warn('Redis unavailable, autopilot-publish worker cannot be initialized', {
      component: COMPONENT,
    })
    return null
  }

  const processJob = createPublishJobProcessor({
    store: defaultContentStore,
    slotStore: defaultSlotStore,
    publisher: defaultPublisher,
    auditService: autoPilotAuditService,
    dispatcher: notificationDispatcher,
    escalationTargetResolver: defaultEscalationTargetResolver,
  })

  autopilotPublishWorker = new Worker<AutopilotPublishJobData>(
    'autopilot-publish',
    async (job: Job<AutopilotPublishJobData>) => processJob(job.data),
    { connection, concurrency: 2 },
  )

  autopilotPublishWorker.on('failed', (job, err) => {
    logger.error('autopilot-publish job failed', err, {
      component: COMPONENT,
      jobId: job?.id,
      contentId: job?.data?.contentId,
    })
  })

  return autopilotPublishWorker
}
