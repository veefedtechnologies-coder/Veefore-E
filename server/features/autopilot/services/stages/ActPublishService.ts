/**
 * Auto Pilot — ActPublishService (ACT stage — publishing hand-off).
 *
 * This is the publish-scheduling slice of the ACT stage (Task 14.1). Once GATE
 * has approved (or auto-approved) a ready Content_Slot, ACT turns that planning
 * record into a concrete, reliably-scheduled post:
 *
 *   1. **Write the execution record** — it creates a `ContentModel` document
 *      (collection `contents`) with status `scheduled` (R12.2, design decision
 *      #4). Reusing `ContentModel` makes Auto Pilot posts appear in the existing
 *      Posts UI and lets them ride the existing publish path + metrics polling.
 *      The slot is then linked to its `ContentModel` (`slot.contentId`) and moved
 *      to status `scheduled`.
 *
 *   2. **Register the publish job** — it registers a `JobType.SCHEDULED_POST`
 *      job with the EXISTING {@link TieredJobScheduler} (R12.2) via
 *      `dispatchOrDefer`. Auto Pilot does NOT re-implement scheduling; the
 *      `autopilot-publish` worker (Task 14.2) fires at slot time and publishes
 *      through `SimpleInstagramPublisher`.
 *
 *   3. **Pre-publish media/fallback guard** — {@link ActPublishService.runPrePublishGuard}
 *      enforces R12.6: while a slot is scheduled, it must have delivered media,
 *      generated media, or a fallback resolution assigned no later than 5 minutes
 *      before its publish time. Run at that checkpoint, the guard verifies media
 *      is present and, when it is not, triggers the undelivered-brief fallback
 *      (AI backup or reschedule) so no scheduled slot ever publishes empty.
 *
 * ── Idempotency (R12.7) ──────────────────────────────────────────────────────
 * A slot that is already published — or already linked to a `ContentModel` — is
 * never written or scheduled again. A retried ACT run recomputes from the
 * persisted slot state and is a no-op, so Auto Pilot can never double-publish.
 *
 * Every side effect is behind an injected port (content store, scheduler, slot
 * store, media resolver, fallback resolver, audit service, clock) with the real
 * `ContentModel` / shared `TieredJobScheduler` / repositories as defaults, so
 * the write + registration + guard logic is fully unit-testable without a
 * database, Redis, or a live scheduler.
 *
 * Satisfies Requirements: 12.2, 12.6
 */

import { logger } from '../../../../config/logger'
import {
  JobType,
  type ScheduledJob,
} from '../../../../services/TieredJobScheduler'
import type {
  ContentFormat,
  ContentSlotStatus,
  ContentSourceKind,
  FallbackResolution,
} from '../../db/models'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from '../AutoPilotAuditService'

const COMPONENT = 'autopilot.ActPublishService'

/**
 * R12.6: a scheduled slot must have its media/fallback assigned no later than 5
 * minutes before publish. This is both the guard's lead interval and the
 * checkpoint at which {@link ActPublishService.runPrePublishGuard} should run.
 */
export const PRE_PUBLISH_GUARD_LEAD_MS = 5 * 60 * 1000

/** Default retry budget for the registered publish job (Task 14.2 tunes backoff). */
export const DEFAULT_PUBLISH_MAX_RETRIES = 3

/**
 * Maps a Content_Slot `format` to the `ContentModel.type` the existing Posts UI
 * and publish path understand (`post` | `reel` | `story`). Carousels and photos
 * are both single-or-multi image `post`s; reels and stories keep their type.
 */
export const CONTENT_TYPE_BY_FORMAT: Record<ContentFormat, string> = {
  reel: 'reel',
  photo: 'post',
  carousel: 'post',
  story: 'story',
}

/** The minimal Mission shape ACT needs to write + schedule a post. */
export interface ActMissionInput {
  /** Mission id — scopes the audit record + job payload. */
  _id: unknown
  /** Workspace the mission is bound to; scopes the `ContentModel` + audit. */
  workspaceId: unknown
  /** Connected account the post publishes to; the scheduler's `accountId`. */
  accountId: string
  /** Target platform (`instagram` in v1). */
  platform?: string
}

/** The minimal Content_Slot shape ACT needs to write + schedule + guard. */
export interface ActSlotInput {
  /** Slot id — links the `ContentModel` and the job. */
  _id: unknown
  /** Scheduled publish time — the job's `scheduledAt` and the guard checkpoint. */
  scheduledAt: Date
  /** Post format, mapped to `ContentModel.type`. */
  format: ContentFormat
  /** Content theme (stored on the `ContentModel` for context). */
  theme: string
  /** Finalized caption (from the caption stage). */
  caption?: string
  /** Finalized hashtags (1–30 from the caption stage). */
  hashtags?: string[]
  /** Resolved content source; `mediaPoolItemId` present ⇒ media is assigned. */
  source: { kind: ContentSourceKind; mediaPoolItemId?: unknown }
  /** Current slot status — drives the idempotency guard (R12.7). */
  status: ContentSlotStatus
  /** Set once ACT has run; its presence makes a re-run a no-op (R12.7). */
  contentId?: unknown
  /** Set when an undelivered brief was already resolved (R12.6/R7). */
  fallbackResolution?: FallbackResolution
}

/**
 * The `contentData` payload written onto the `ContentModel`, mirroring the
 * shape the existing Posts UI + publish path read (caption text, media URLs,
 * hashtags, account + theme context).
 */
export interface ContentDataPayload {
  text?: string
  mediaUrls: string[]
  hashtags: string[]
  accountId: string
  theme: string
  autopilotSlotId: string
}

/** The document ACT writes to create a `ContentModel` (status `scheduled`). */
export interface ContentDocumentInput {
  workspaceId: unknown
  accountId: string
  type: string
  title: string
  platform: string
  status: 'scheduled'
  scheduledAt: Date
  contentData: ContentDataPayload
}

/**
 * Write port for creating the `ContentModel` execution record. Defaults to
 * `ContentModel.create`; a fake lets ACT be verified without a database.
 */
export interface ContentStore {
  /** Create one content document; resolves to the created doc (with an id). */
  create(doc: ContentDocumentInput): Promise<{ _id: unknown }>
  /**
   * Cancel a scheduled content document (used as the publish job's reversal op
   * + as cleanup when scheduling fails). Optional — best-effort.
   */
  cancel?(contentId: string): Promise<void>
}

/**
 * The scheduler port ACT registers the publish job through. Satisfied by the
 * existing {@link TieredJobScheduler}; a fake avoids Redis in tests. ACT calls
 * `dispatchOrDefer` — it never re-implements scheduling.
 */
export interface PublishScheduler {
  dispatchOrDefer(job: ScheduledJob): Promise<'dispatched' | 'deferred'>
}

/** Slot-store port: link the content record + transition the slot's status. */
export interface ActSlotStore {
  linkContent(slotId: string, contentId: string): Promise<unknown>
  updateStatus(slotId: string, status: ContentSlotStatus): Promise<unknown>
  setFallbackResolution(
    slotId: string,
    fallbackResolution: FallbackResolution,
  ): Promise<unknown>
}

/** Resolved media for a slot, used to populate `ContentModel.contentData`. */
export interface ResolvedSlotMedia {
  mediaUrls: string[]
  mediaType?: 'image' | 'video'
}

/**
 * Resolves a slot's assigned media (from the Media_Pool) to concrete URLs for
 * the `ContentModel`. Optional: when unset, ACT writes an empty media list and
 * relies on the pre-publish guard to ensure media exists before publish.
 */
export interface SlotMediaResolver {
  resolve(slot: ActSlotInput): Promise<ResolvedSlotMedia | null>
}

/**
 * Triggers the undelivered-brief fallback for a slot with no media at the guard
 * checkpoint (R12.6 → R7.6/R7.7): substitute AI-backup media if producible, else
 * reschedule. Satisfied by `BriefResolutionService.resolveUndeliveredBrief`
 * (Task 10.3); injected so this task does not depend on that implementation.
 */
export interface PrePublishFallbackResolver {
  resolve(slot: ActSlotInput): Promise<FallbackResolution>
}

/** Tunable dependencies for ACT publishing. */
export interface ActPublishServiceOptions {
  /** Content-record write port (defaults to `ContentModel.create`). */
  contentStore?: ContentStore
  /** The scheduler to register the publish job with (defaults to shared scheduler). */
  scheduler?: PublishScheduler
  /** Slot persistence (defaults to the shared `contentSlotRepository`). */
  slotStore?: ActSlotStore
  /** Media resolver for `contentData.mediaUrls` (optional). */
  mediaResolver?: SlotMediaResolver
  /** Fallback trigger for the pre-publish guard (optional; guard degrades without it). */
  fallbackResolver?: PrePublishFallbackResolver
  /** Audit service (defaults to the shared `autoPilotAuditService`). */
  auditService?: Pick<AutoPilotAuditService, 'record'>
  /** Retry budget for the registered publish job. */
  publishMaxRetries?: number
  /** Injectable clock (defaults to `Date.now`); overridable in tests. */
  now?: () => number
}

/** The outcome of writing + scheduling a slot for publishing. */
export interface ScheduleForPublishingResult {
  /** `true` when a `ContentModel` was written and a publish job registered. */
  scheduled: boolean
  /** `true` when the run was a no-op because the slot was already scheduled/published (R12.7). */
  skipped: boolean
  /** The created (or pre-existing) `ContentModel` id, when available. */
  contentId?: string
  /** The registered publish job id, when a job was registered. */
  jobId?: string
  /** Whether the scheduler dispatched or deferred the job. */
  dispatch?: 'dispatched' | 'deferred'
  /** A human-readable rationale for narration/audit. */
  reason: string
}

/** The outcome of the pre-publish media/fallback guard (R12.6). */
export interface PrePublishGuardResult {
  /** `true` when the slot has media or a fallback resolution ready to publish. */
  ok: boolean
  /** `true` when media was already present (no fallback needed). */
  hadMedia: boolean
  /** The fallback applied when media was missing (`ai-backup` | `rescheduled`). */
  fallback?: FallbackResolution
  /** A human-readable rationale for narration/audit. */
  reason: string
}

/**
 * Returns `true` when a slot's media/fallback is considered assigned: either the
 * resolved source carries a Media_Pool item, or a fallback resolution has
 * already been recorded (R12.6).
 */
export function slotHasMediaOrFallback(slot: ActSlotInput): boolean {
  return slot.source?.mediaPoolItemId != null || slot.fallbackResolution != null
}

/** Default content store backed by the real `ContentModel`. */
const defaultContentStore: ContentStore = {
  async create(doc: ContentDocumentInput): Promise<{ _id: unknown }> {
    const { ContentModel } = await import('../../../../models/Content/Content')
    return (await ContentModel.create(doc)) as unknown as { _id: unknown }
  },
  async cancel(contentId: string): Promise<void> {
    const { ContentModel } = await import('../../../../models/Content/Content')
    await ContentModel.findByIdAndUpdate(contentId, { $set: { status: 'cancelled' } })
  },
}

/** Default slot store backed by the shared `contentSlotRepository`. */
const defaultSlotStore: ActSlotStore = {
  async linkContent(slotId: string, contentId: string) {
    const { contentSlotRepository } = await import('../../db/repositories')
    return contentSlotRepository.linkContent(slotId, contentId)
  },
  async updateStatus(slotId: string, status: ContentSlotStatus) {
    const { contentSlotRepository } = await import('../../db/repositories')
    return contentSlotRepository.updateStatus(slotId, status)
  },
  async setFallbackResolution(slotId: string, fallbackResolution: FallbackResolution) {
    const { contentSlotRepository } = await import('../../db/repositories')
    return contentSlotRepository.setFallbackResolution(slotId, fallbackResolution)
  },
}

/**
 * Lazily resolves the shared {@link TieredJobScheduler}. Kept behind a getter so
 * importing this module never eagerly constructs the scheduler (and its Redis
 * connection) — tests inject a fake instead.
 */
async function getDefaultScheduler(): Promise<PublishScheduler> {
  const mod = await import('../../../../services/TieredJobScheduler')
  const sched = (mod as unknown as { tieredJobScheduler?: PublishScheduler }).tieredJobScheduler
  if (sched) return sched
  // Fall back to constructing one from the shared UsageStore if no singleton is exported.
  const { UsageStore } = await import('../../../../services/UsageStore')
  return new mod.TieredJobScheduler(new UsageStore(null)) as unknown as PublishScheduler
}

/**
 * ACT publishing: writes the `ContentModel` execution record, registers the
 * scheduled-post job with the existing scheduler, and enforces the pre-publish
 * media/fallback guard (R12.2, R12.6). Idempotent per slot (R12.7).
 */
export class ActPublishService {
  private readonly contentStore: ContentStore
  private schedulerRef: PublishScheduler | null
  private readonly slotStore: ActSlotStore
  private readonly mediaResolver?: SlotMediaResolver
  private readonly fallbackResolver?: PrePublishFallbackResolver
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>
  private readonly publishMaxRetries: number
  private readonly now: () => number

  constructor(options: ActPublishServiceOptions = {}) {
    this.contentStore = options.contentStore ?? defaultContentStore
    this.schedulerRef = options.scheduler ?? null
    this.slotStore = options.slotStore ?? defaultSlotStore
    this.mediaResolver = options.mediaResolver
    this.fallbackResolver = options.fallbackResolver
    this.auditService = options.auditService ?? autoPilotAuditService
    this.publishMaxRetries = options.publishMaxRetries ?? DEFAULT_PUBLISH_MAX_RETRIES
    this.now = options.now ?? Date.now
  }

  private async scheduler(): Promise<PublishScheduler> {
    if (!this.schedulerRef) this.schedulerRef = await getDefaultScheduler()
    return this.schedulerRef
  }

  /**
   * Write the `ContentModel` (status `scheduled`) and register the publish job
   * with the existing {@link TieredJobScheduler} (R12.2).
   *
   * Idempotent (R12.7): a slot that is already `published`/`scheduled` or already
   * linked to a `ContentModel` is returned untouched (`skipped: true`) so a
   * retried ACT run never writes a second record or double-schedules.
   *
   * Never throws to the caller: a scheduling failure after the content was
   * written is logged, best-effort rolled back (the content is cancelled), and
   * surfaced as `scheduled: false` so the Operating Loop keeps running.
   */
  async scheduleSlotForPublishing(
    mission: ActMissionInput,
    slot: ActSlotInput,
  ): Promise<ScheduleForPublishingResult> {
    const slotId = String(slot._id)

    // R12.7: never re-write or re-schedule an already-executed slot.
    if (slot.status === 'published') {
      return {
        scheduled: false,
        skipped: true,
        reason: 'Slot is already published; not scheduling again (R12.7).',
      }
    }
    if (slot.contentId != null || slot.status === 'scheduled') {
      return {
        scheduled: false,
        skipped: true,
        contentId: slot.contentId != null ? String(slot.contentId) : undefined,
        reason: 'Slot already has a scheduled ContentModel; ACT is a no-op (R12.7).',
      }
    }

    // 1. Resolve media (optional) and write the ContentModel execution record.
    const media = this.mediaResolver ? await this.mediaResolver.resolve(slot) : null
    const contentData: ContentDataPayload = {
      text: slot.caption,
      mediaUrls: media?.mediaUrls ?? [],
      hashtags: slot.hashtags ?? [],
      accountId: mission.accountId,
      theme: slot.theme,
      autopilotSlotId: slotId,
    }
    const doc: ContentDocumentInput = {
      workspaceId: mission.workspaceId,
      accountId: mission.accountId,
      type: CONTENT_TYPE_BY_FORMAT[slot.format] ?? 'post',
      title: slot.caption?.slice(0, 200) || `Auto Pilot ${slot.format}: ${slot.theme}`,
      platform: mission.platform ?? 'instagram',
      status: 'scheduled',
      scheduledAt: slot.scheduledAt,
      contentData,
    }

    let contentId: string
    try {
      const created = await this.contentStore.create(doc)
      contentId = String(created._id)
    } catch (error) {
      logger.error('ACT: failed to write ContentModel for slot', error, {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId,
      })
      await this.auditService.record({
        missionId: mission._id,
        workspaceId: mission.workspaceId,
        stage: 'ACT',
        action: 'schedule-publish',
        outcome: 'failure',
        triggeringContext: { slotId, reason: 'content-write-failed' },
      })
      return {
        scheduled: false,
        skipped: false,
        reason: 'Failed to write the ContentModel execution record.',
      }
    }

    // Link the slot to its execution record and mark it scheduled.
    await this.safeLinkAndMark(slotId, contentId)

    // 2. Register the JobType.SCHEDULED_POST job with the EXISTING scheduler.
    const jobId = `autopilot-publish-${slotId}`
    const job: ScheduledJob = {
      id: jobId,
      accountId: mission.accountId,
      type: JobType.SCHEDULED_POST,
      payload: {
        missionId: String(mission._id),
        workspaceId: String(mission.workspaceId),
        slotId,
        contentId,
        scheduledAt: slot.scheduledAt.toISOString(),
      },
      priority: 1, // SCHEDULED_POST is Tier 1 — highest priority.
      scheduledAt: slot.scheduledAt.getTime(),
      retryCount: 0,
      maxRetries: this.publishMaxRetries,
    }

    let dispatch: 'dispatched' | 'deferred'
    try {
      const scheduler = await this.scheduler()
      dispatch = await scheduler.dispatchOrDefer(job)
    } catch (error) {
      logger.error('ACT: failed to register publish job; rolling back content', error, {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId,
        contentId,
      })
      // Best-effort rollback so a slot is not left with an orphan scheduled record.
      if (this.contentStore.cancel) {
        try {
          await this.contentStore.cancel(contentId)
        } catch {
          /* best-effort */
        }
      }
      await this.auditService.record({
        missionId: mission._id,
        workspaceId: mission.workspaceId,
        stage: 'ACT',
        action: 'schedule-publish',
        outcome: 'failure',
        triggeringContext: { slotId, contentId, reason: 'scheduler-registration-failed' },
      })
      return {
        scheduled: false,
        skipped: false,
        contentId,
        reason: 'Failed to register the publish job with the scheduler.',
      }
    }

    // R13.5/R17: audit the scheduling with pre-execution state + reversal op.
    await this.auditService.record({
      missionId: mission._id,
      workspaceId: mission.workspaceId,
      stage: 'ACT',
      action: 'schedule-publish',
      outcome: 'success',
      reversible: true,
      triggeringContext: { slotId, contentId, jobId, dispatch },
      preExecutionState: { slotStatusBefore: slot.status },
      reversalOp: { type: 'cancel-content', contentId, slotId },
    })

    logger.info('ACT: slot written + publish job registered', {
      component: COMPONENT,
      missionId: String(mission._id),
      slotId,
      contentId,
      jobId,
      dispatch,
    })

    return {
      scheduled: true,
      skipped: false,
      contentId,
      jobId,
      dispatch,
      reason: `ContentModel written (scheduled) and publish job ${dispatch}.`,
    }
  }

  /**
   * Pre-publish media/fallback guard (R12.6). Run no later than 5 minutes before
   * the slot's publish time (see {@link PRE_PUBLISH_GUARD_LEAD_MS}), it verifies
   * the slot has media or a fallback resolution assigned:
   *
   *   - **Media/fallback present** → passes with `hadMedia`/`fallback` set; the
   *     slot is ready to publish.
   *   - **Missing, resolver configured** → triggers the undelivered-brief
   *     fallback (AI backup if producible, else reschedule — R7.6/R7.7), records
   *     the applied resolution on the slot, audits it, and passes with the
   *     applied `fallback`.
   *   - **Missing, no resolver** → cannot self-heal; audits the gap and returns
   *     `ok: false` so the caller escalates rather than publishing empty.
   *
   * Never throws: a fallback-resolver failure is caught, audited, and reported
   * as `ok: false` so the Operating Loop keeps running.
   */
  async runPrePublishGuard(
    mission: ActMissionInput,
    slot: ActSlotInput,
  ): Promise<PrePublishGuardResult> {
    const slotId = String(slot._id)

    if (slotHasMediaOrFallback(slot)) {
      const fallback = slot.source?.mediaPoolItemId == null ? slot.fallbackResolution : undefined
      return {
        ok: true,
        hadMedia: slot.source?.mediaPoolItemId != null,
        ...(fallback ? { fallback } : {}),
        reason:
          slot.source?.mediaPoolItemId != null
            ? 'Slot has assigned media; ready to publish (R12.6).'
            : `Slot has a ${slot.fallbackResolution} fallback resolution; ready to publish (R12.6).`,
      }
    }

    // No media and no fallback yet — attempt to self-heal via the fallback path.
    if (!this.fallbackResolver) {
      logger.warn('ACT: pre-publish guard found no media and no fallback resolver', {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId,
      })
      await this.auditService.record({
        missionId: mission._id,
        workspaceId: mission.workspaceId,
        stage: 'ACT',
        action: 'pre-publish-guard',
        outcome: 'blocked',
        triggeringContext: { slotId, reason: 'no-media-no-fallback-resolver' },
      })
      return {
        ok: false,
        hadMedia: false,
        reason: 'Slot has no media and no fallback could be applied (R12.6).',
      }
    }

    try {
      const fallback = await this.fallbackResolver.resolve(slot)
      await this.slotStore.setFallbackResolution(slotId, fallback)
      await this.auditService.record({
        missionId: mission._id,
        workspaceId: mission.workspaceId,
        stage: 'ACT',
        action: 'pre-publish-guard',
        outcome: 'success',
        triggeringContext: { slotId, fallback, reason: 'media-missing-fallback-applied' },
      })
      logger.info('ACT: pre-publish guard applied fallback', {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId,
        fallback,
      })
      return {
        ok: true,
        hadMedia: false,
        fallback,
        reason: `Media missing; applied ${fallback} fallback before publish (R12.6).`,
      }
    } catch (error) {
      logger.error('ACT: pre-publish fallback resolution failed', error, {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId,
      })
      await this.auditService.record({
        missionId: mission._id,
        workspaceId: mission.workspaceId,
        stage: 'ACT',
        action: 'pre-publish-guard',
        outcome: 'failure',
        triggeringContext: { slotId, reason: 'fallback-resolution-failed' },
      })
      return {
        ok: false,
        hadMedia: false,
        reason: 'Media missing and the fallback resolution failed (R12.6).',
      }
    }
  }

  /**
   * `true` when the pre-publish guard is due for a slot: the current time is
   * within {@link PRE_PUBLISH_GUARD_LEAD_MS} of the slot's publish time (R12.6).
   */
  isGuardDue(slot: ActSlotInput, now: number = this.now()): boolean {
    return now >= slot.scheduledAt.getTime() - PRE_PUBLISH_GUARD_LEAD_MS
  }

  /** Link the slot to its content record + mark it `scheduled` (best-effort). */
  private async safeLinkAndMark(slotId: string, contentId: string): Promise<void> {
    try {
      await this.slotStore.linkContent(slotId, contentId)
      await this.slotStore.updateStatus(slotId, 'scheduled')
    } catch (error) {
      logger.warn('ACT: failed to link/mark slot after content write', {
        component: COMPONENT,
        slotId,
        contentId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Shared default instance wired to the real content store, scheduler, and repositories. */
export const actPublishService = new ActPublishService()
