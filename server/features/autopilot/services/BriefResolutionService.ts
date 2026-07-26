/**
 * Auto Pilot — BriefResolutionService (Content-Brief flow · terminal resolution).
 *
 * The just-in-time Content_Brief flow (Tasks 10.1–10.2) generates a brief and
 * schedules its send + escalating reminders. This service closes the loop: it
 * takes a brief to a **terminal state** so its Content_Slot never publishes empty
 * (design "ContentBriefService.resolveUndeliveredBrief" · Property 1). There are
 * exactly two ways a brief resolves:
 *
 *   1. **The user delivers the media** (`deliverBrief`, R7.8) — the delivered
 *      media is validated + added to the Media_Pool, attached to the associated
 *      Content_Slot (the slot's source becomes that pool item and the slot is
 *      marked `ready`), and the brief is marked `delivered`. The assignment is
 *      audited by `MediaPoolService.assignToSlot` (R6.4) and the delivery itself
 *      is recorded in an Audit_Record.
 *
 *   2. **The fallback deadline passes with no delivery** (`resolveUndeliveredBrief`,
 *      R7.6/R7.7) — at `publishTime − 30m` Auto Pilot either
 *        • substitutes AI-generated backup media matching the slot's format, when
 *          such media can be produced (R7.6): the backup is added to the pool,
 *          attached to the slot, the slot is marked `ready` with
 *          `fallbackResolution = 'ai-backup'`, and the brief is marked `ai-backup`;
 *          or
 *        • reschedules the Content_Slot when a matching backup cannot be produced
 *          (R7.7): the slot's publish time is moved forward, the slot is marked
 *          `rescheduled` with `fallbackResolution = 'rescheduled'`, and the brief
 *          is marked `rescheduled`,
 *      recording the substitution / rescheduling in an Audit_Record either way.
 *
 * ── Property 1: no slot is silently dropped ─────────────────────────────────
 * `resolveUndeliveredBrief` on an undelivered brief ALWAYS returns a terminal
 * resolution — `'ai-backup'` or `'rescheduled'` — and always leaves the slot with
 * a `fallbackResolution` set. A brief already resolved (delivered / ai-backup /
 * rescheduled) is treated idempotently so a retried/duplicated deadline job never
 * re-acts (design idempotency note · R7.8, R12.6).
 *
 * Every transport (brief store, slot store, media pool, AI backup generator,
 * rescheduler, audit) is injected as a port with the real singletons as defaults,
 * so the whole resolution flow is unit- and property-testable without a database,
 * an AI provider, or a queue.
 *
 * Satisfies Requirements: 7.6, 7.7, 7.8 (Property 1)
 */

import { logger } from '../../../config/logger'
import {
  ContentBriefModel,
  type ContentBriefStatus,
  type ContentFormat,
  type FallbackResolution,
  type MediaType,
} from '../db/models'
import {
  contentSlotRepository,
  type ContentSlotRepository,
} from '../db/repositories/ContentSlotRepository'
import { MediaPoolService, mediaPoolService } from './MediaPoolService'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from './AutoPilotAuditService'

const COMPONENT = 'autopilot.BriefResolutionService'

/** Default reschedule step when a slot must be pushed forward (R7.7): 24h. */
export const DEFAULT_RESCHEDULE_STEP_MS = 24 * 60 * 60 * 1000

/** Statuses at which a brief is still awaiting the user's media (unresolved). */
const UNRESOLVED_STATUSES: ReadonlyArray<ContentBriefStatus> = ['pending', 'sent']

/** The media type each slot format needs for an AI backup (R7.6). */
export const BACKUP_MEDIA_TYPE_BY_FORMAT: Record<ContentFormat, MediaType> = {
  reel: 'video',
  photo: 'image',
  carousel: 'image',
  story: 'image',
}

/** The minimal brief view the resolution flow reads. */
export interface ResolutionBriefView {
  _id: unknown
  missionId: unknown
  workspaceId: unknown
  slotId: string
  status: ContentBriefStatus
}

/** The minimal Content_Slot view the resolution flow reads. */
export interface ResolutionSlotView {
  _id: unknown
  format: ContentFormat
  scheduledAt: Date
  status: string
}

/**
 * The slot patch the resolution flow applies. Only the fields a resolution can
 * change are expressible, keeping the store port narrow + testable.
 */
export interface ResolutionSlotPatch {
  source?: { kind: 'pool' | 'ai-generated'; mediaPoolItemId: string }
  status?: string
  scheduledAt?: Date
  fallbackResolution?: FallbackResolution
}

/**
 * Read/update port for the brief. Defaults read/update `ContentBriefModel`; tests
 * inject an in-memory implementation.
 */
export interface ResolutionBriefStore {
  /** Load the brief's resolution view, or `null` when it no longer exists. */
  load(briefId: string): Promise<ResolutionBriefView | null>
  /**
   * Set the brief's terminal status, optionally stamping the delivered pool item
   * id. Idempotent at the caller; a resolved brief is never re-driven here.
   */
  setStatus(
    briefId: string,
    status: ContentBriefStatus,
    deliveredMediaPoolItemId?: string,
  ): Promise<void>
}

/** Read/update port for the Content_Slot. Defaults wrap `ContentSlotRepository`. */
export interface ResolutionSlotStore {
  /** Load the slot's resolution view, or `null` when it no longer exists. */
  load(slotId: string): Promise<ResolutionSlotView | null>
  /** Apply a resolution patch to the slot. */
  apply(slotId: string, patch: ResolutionSlotPatch): Promise<void>
}

/** A produced AI backup media item, ready to add to the pool (R7.6). */
export interface GeneratedBackupMedia {
  mediaUrl: string
  mediaType: MediaType
  sizeBytes: number
  format?: string
}

/**
 * Produces AI-generated backup media for a slot format (R7.6). `generate` returns
 * `null` (or throws) when a matching backup cannot be produced, which routes the
 * resolution to a reschedule (R7.7). Injectable so the fallback branches are
 * testable without a real generation service; the default cannot produce backups
 * until the media-generation adapter (Task 11.1) wires a real implementation.
 */
export interface BackupMediaGenerator {
  /** Whether an AI backup can be produced for this format at all (R7.6/R7.7). */
  canGenerate(format: ContentFormat): boolean
  /** Produce backup media for the format, or `null` when it cannot be produced. */
  generate(input: {
    missionId: unknown
    workspaceId: unknown
    slotId: string
    format: ContentFormat
  }): Promise<GeneratedBackupMedia | null>
}

/**
 * Computes a Content_Slot's new publish time when it must be rescheduled (R7.7).
 * The default pushes the later of the original slot time and `now` forward by
 * {@link DEFAULT_RESCHEDULE_STEP_MS} so the slot always lands in the future.
 */
export type Rescheduler = (slot: ResolutionSlotView, now: number) => Date

const defaultRescheduler: Rescheduler = (slot, now) => {
  const base = Math.max(slot.scheduledAt.getTime(), now)
  return new Date(base + DEFAULT_RESCHEDULE_STEP_MS)
}

/**
 * Default backup generator: no generation transport is wired at this layer, so it
 * reports it cannot produce a backup. This makes an undelivered brief safely
 * reschedule (R7.7) until Task 11.1 injects a real generator.
 */
const defaultBackupGenerator: BackupMediaGenerator = {
  canGenerate: () => false,
  async generate() {
    return null
  },
}

/** The default brief store backed by `ContentBriefModel`. */
const defaultBriefStore: ResolutionBriefStore = {
  async load(briefId) {
    const doc = await ContentBriefModel.findById(briefId)
      .select('status slotId missionId workspaceId')
      .lean()
      .exec()
    if (!doc) return null
    return {
      _id: doc._id,
      missionId: doc.missionId,
      workspaceId: doc.workspaceId,
      slotId: String(doc.slotId),
      status: doc.status,
    }
  },
  async setStatus(briefId, status, deliveredMediaPoolItemId) {
    const set: Record<string, unknown> = { status }
    if (deliveredMediaPoolItemId) set.deliveredMediaPoolItemId = deliveredMediaPoolItemId
    await ContentBriefModel.updateOne({ _id: briefId }, { $set: set }).exec()
  },
}

/** The default slot store backed by `ContentSlotRepository`. */
function makeDefaultSlotStore(repo: ContentSlotRepository): ResolutionSlotStore {
  return {
    async load(slotId) {
      const doc = await repo.findById(slotId)
      if (!doc) return null
      return {
        _id: doc._id,
        format: doc.format,
        scheduledAt: doc.scheduledAt,
        status: doc.status,
      }
    },
    async apply(slotId, patch) {
      await repo.updateById(slotId, patch as any)
    },
  }
}

/** Delivered media the user submitted in response to a brief (R7.8). */
export interface DeliveredMediaInput {
  /** Public URL/location of the stored media. */
  mediaUrl: string
  /** MIME type reported for the upload (drives R6.5 validation). */
  mimeType: string
  /** Size of the upload in bytes (drives R6.5 validation). */
  sizeBytes: number
  /** Optional human/format label (e.g. `mp4`, `jpg`). */
  format?: string
}

/** The outcome of a `deliverBrief` call (R7.8). */
export type DeliverBriefResult =
  /** Media validated, added to the pool, attached to the slot; brief delivered. */
  | { status: 'delivered'; mediaPoolItemId: string; slotId: string }
  /** The delivered media failed validation (R6.5); nothing changed. */
  | { status: 'rejected'; reason: string }
  /** The brief was already resolved (delivered / ai-backup / rescheduled). */
  | { status: 'already-resolved'; resolution: ContentBriefStatus }
  /** The brief (or its slot) no longer exists. */
  | { status: 'not-found' }

/** The outcome of a `resolveUndeliveredBrief` call (R7.6/R7.7 · Property 1). */
export type ResolveUndeliveredResult =
  /** A terminal resolution was applied: AI backup substituted or slot rescheduled. */
  | { status: 'resolved'; resolution: FallbackResolution; slotId: string }
  /** The brief was already resolved; the prior terminal state is reported. */
  | { status: 'already-resolved'; resolution: ContentBriefStatus }
  /** The brief (or its slot) no longer exists. */
  | { status: 'not-found' }

/** Per-call options for the resolution flow. */
export interface ResolveOptions {
  /** Injectable "now" (ms) for deterministic tests. Defaults to `Date.now()`. */
  now?: number
}

/** Tunable dependencies for the brief-resolution flow. */
export interface BriefResolutionServiceOptions {
  briefStore?: ResolutionBriefStore
  slotStore?: ResolutionSlotStore
  slotRepository?: ContentSlotRepository
  mediaPoolService?: MediaPoolService
  auditService?: Pick<AutoPilotAuditService, 'record'>
  backupGenerator?: BackupMediaGenerator
  rescheduler?: Rescheduler
}

/**
 * Drives a Content_Brief to a terminal state so its slot never publishes empty:
 * delivery (R7.8) or fallback resolution — AI backup (R7.6) or reschedule (R7.7).
 */
export class BriefResolutionService {
  private readonly briefStore: ResolutionBriefStore
  private readonly slotStore: ResolutionSlotStore
  private readonly mediaPool: MediaPoolService
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>
  private readonly backupGenerator: BackupMediaGenerator
  private readonly rescheduler: Rescheduler

  constructor(options: BriefResolutionServiceOptions = {}) {
    const repo = options.slotRepository ?? contentSlotRepository
    this.briefStore = options.briefStore ?? defaultBriefStore
    this.slotStore = options.slotStore ?? makeDefaultSlotStore(repo)
    this.mediaPool = options.mediaPoolService ?? mediaPoolService
    this.auditService = options.auditService ?? autoPilotAuditService
    this.backupGenerator = options.backupGenerator ?? defaultBackupGenerator
    this.rescheduler = options.rescheduler ?? defaultRescheduler
  }

  /**
   * R7.8: attach media the user delivered in response to a Content_Brief.
   *
   * Validates the delivered media (R6.5), adds it to the Media_Pool as a
   * `brief-delivery` item, assigns it to the associated Content_Slot (auditing
   * the assignment via `MediaPoolService.assignToSlot`, R6.4), points the slot's
   * source at that pool item, marks the slot `ready`, and marks the brief
   * `delivered`. A delivery Audit_Record is recorded for traceability.
   *
   * Idempotent: a brief already resolved is reported as `already-resolved` and no
   * new media is added, so a re-submitted delivery never double-adds.
   */
  async deliverBrief(briefId: string, media: DeliveredMediaInput): Promise<DeliverBriefResult> {
    const brief = await this.briefStore.load(briefId)
    if (!brief) return { status: 'not-found' }

    if (!this.isUnresolved(brief.status)) {
      return { status: 'already-resolved', resolution: brief.status }
    }

    const slot = await this.slotStore.load(brief.slotId)
    if (!slot) return { status: 'not-found' }

    // R6.5 + R6.1: validate and add the delivered media to the pool (brief-delivery).
    const added = await this.mediaPool.addUpload({
      workspaceId: brief.workspaceId,
      missionId: String(brief.missionId),
      mediaUrl: media.mediaUrl,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      format: media.format,
      origin: 'brief-delivery',
    })
    if (!added.added) {
      logger.info('brief delivery rejected at validation', {
        component: COMPONENT,
        briefId,
        slotId: brief.slotId,
        reason: added.reason,
      })
      return { status: 'rejected', reason: added.message }
    }

    const mediaPoolItemId = String((added.item as { _id?: unknown })._id)

    // R6.4/R6.6: assign the pool item to the slot (kept reusable + audited).
    await this.mediaPool.assignToSlot(mediaPoolItemId, brief.slotId, {
      missionId: brief.missionId,
      workspaceId: brief.workspaceId,
    })

    // R7.8: attach the delivered media to the slot as its source; slot is ready.
    await this.slotStore.apply(brief.slotId, {
      source: { kind: 'pool', mediaPoolItemId },
      status: 'ready',
    })

    // Mark the brief delivered + remember which pool item satisfied it.
    await this.briefStore.setStatus(briefId, 'delivered', mediaPoolItemId)

    // Record the delivery itself (reversible: detach the delivered media).
    await this.auditService.record({
      missionId: brief.missionId,
      workspaceId: brief.workspaceId,
      stage: 'ACT',
      action: 'brief.delivered',
      outcome: 'success',
      reversible: true,
      triggeringContext: { briefId, slotId: brief.slotId, mediaPoolItemId },
      preExecutionState: { slotStatus: slot.status },
      reversalOp: { type: 'detach-delivered-media', slotId: brief.slotId, mediaPoolItemId },
    })

    logger.info('brief delivered — media attached to slot', {
      component: COMPONENT,
      briefId,
      slotId: brief.slotId,
      mediaPoolItemId,
    })

    return { status: 'delivered', mediaPoolItemId, slotId: brief.slotId }
  }

  /**
   * R7.6/R7.7 (Property 1): resolve an undelivered brief at its fallback deadline.
   *
   * Substitutes AI-generated backup media when a backup matching the slot's format
   * can be produced (R7.6); otherwise reschedules the slot so it never publishes
   * empty (R7.7). Either way the slot ends with a `fallbackResolution` set, the
   * brief is marked with the matching terminal status, and an Audit_Record is
   * written.
   *
   * Idempotent: a brief already resolved (delivered / ai-backup / rescheduled) is
   * reported as `already-resolved` without re-acting, so a retried deadline job is
   * a no-op.
   */
  async resolveUndeliveredBrief(
    briefId: string,
    options: ResolveOptions = {},
  ): Promise<ResolveUndeliveredResult> {
    const now = options.now ?? Date.now()

    const brief = await this.briefStore.load(briefId)
    if (!brief) return { status: 'not-found' }

    // Idempotency: a delivered/already-resolved brief needs no fallback (R7.8).
    if (!this.isUnresolved(brief.status)) {
      return { status: 'already-resolved', resolution: brief.status }
    }

    const slot = await this.slotStore.load(brief.slotId)
    if (!slot) return { status: 'not-found' }

    // R7.6: try an AI backup matching the slot's format first.
    const backup = await this.tryProduceBackup(brief, slot)
    if (backup) {
      return this.applyAiBackup(brief, slot, backup)
    }

    // R7.7: a matching backup cannot be produced → reschedule the slot.
    return this.applyReschedule(brief, slot, now)
  }

  /**
   * R7.6: attempt to produce AI backup media for the slot's format. Returns the
   * generated media on success, or `null` when a matching backup cannot be
   * produced (generator declines, returns nothing, or throws) so the caller
   * reschedules instead (R7.7).
   */
  private async tryProduceBackup(
    brief: ResolutionBriefView,
    slot: ResolutionSlotView,
  ): Promise<GeneratedBackupMedia | null> {
    if (!this.backupGenerator.canGenerate(slot.format)) return null
    try {
      const media = await this.backupGenerator.generate({
        missionId: brief.missionId,
        workspaceId: brief.workspaceId,
        slotId: brief.slotId,
        format: slot.format,
      })
      if (!media) return null
      // Guard: the produced media must match the format's required media type.
      if (media.mediaType !== BACKUP_MEDIA_TYPE_BY_FORMAT[slot.format]) {
        logger.warn('backup media type mismatch — rescheduling instead', {
          component: COMPONENT,
          briefId: String(brief._id),
          slotId: brief.slotId,
          format: slot.format,
          produced: media.mediaType,
        })
        return null
      }
      return media
    } catch (error) {
      logger.warn('AI backup generation failed — rescheduling instead', {
        component: COMPONENT,
        briefId: String(brief._id),
        slotId: brief.slotId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * R7.6: add the produced backup to the pool, attach it to the slot as its
   * source, mark the slot `ready` with `fallbackResolution = 'ai-backup'`, mark
   * the brief `ai-backup`, and record the substitution in an Audit_Record.
   */
  private async applyAiBackup(
    brief: ResolutionBriefView,
    slot: ResolutionSlotView,
    backup: GeneratedBackupMedia,
  ): Promise<ResolveUndeliveredResult> {
    const item = await this.mediaPool.addGeneratedMedia({
      workspaceId: brief.workspaceId,
      missionId: String(brief.missionId),
      mediaUrl: backup.mediaUrl,
      mediaType: backup.mediaType,
      format: backup.format,
      sizeBytes: backup.sizeBytes,
      origin: 'ai-generated',
    })
    const mediaPoolItemId = String((item as { _id?: unknown })._id)

    // Keep the item reusable + audit the assignment (R6.4/R6.6).
    await this.mediaPool.assignToSlot(mediaPoolItemId, brief.slotId, {
      missionId: brief.missionId,
      workspaceId: brief.workspaceId,
    })

    await this.slotStore.apply(brief.slotId, {
      source: { kind: 'ai-generated', mediaPoolItemId },
      status: 'ready',
      fallbackResolution: 'ai-backup',
    })

    await this.briefStore.setStatus(String(brief._id), 'ai-backup', mediaPoolItemId)

    // R7.6: record the substitution in an Audit_Record.
    await this.auditService.record({
      missionId: brief.missionId,
      workspaceId: brief.workspaceId,
      stage: 'ACT',
      action: 'brief.ai-backup-substituted',
      outcome: 'success',
      reversible: true,
      triggeringContext: {
        briefId: String(brief._id),
        slotId: brief.slotId,
        format: slot.format,
        mediaPoolItemId,
      },
      preExecutionState: { slotStatus: slot.status },
      reversalOp: { type: 'remove-ai-backup', slotId: brief.slotId, mediaPoolItemId },
    })

    logger.info('undelivered brief resolved with AI backup', {
      component: COMPONENT,
      briefId: String(brief._id),
      slotId: brief.slotId,
      mediaPoolItemId,
    })

    return { status: 'resolved', resolution: 'ai-backup', slotId: brief.slotId }
  }

  /**
   * R7.7: move the slot's publish time forward, mark it `rescheduled` with
   * `fallbackResolution = 'rescheduled'`, mark the brief `rescheduled`, and record
   * the rescheduling in an Audit_Record — so no scheduled slot publishes empty.
   */
  private async applyReschedule(
    brief: ResolutionBriefView,
    slot: ResolutionSlotView,
    now: number,
  ): Promise<ResolveUndeliveredResult> {
    const newScheduledAt = this.rescheduler(slot, now)

    await this.slotStore.apply(brief.slotId, {
      scheduledAt: newScheduledAt,
      status: 'rescheduled',
      fallbackResolution: 'rescheduled',
    })

    await this.briefStore.setStatus(String(brief._id), 'rescheduled')

    // R7.7: record the rescheduling in an Audit_Record.
    await this.auditService.record({
      missionId: brief.missionId,
      workspaceId: brief.workspaceId,
      stage: 'ACT',
      action: 'brief.rescheduled',
      outcome: 'success',
      reversible: true,
      triggeringContext: {
        briefId: String(brief._id),
        slotId: brief.slotId,
        from: slot.scheduledAt.toISOString(),
        to: newScheduledAt.toISOString(),
      },
      preExecutionState: { scheduledAt: slot.scheduledAt.toISOString(), slotStatus: slot.status },
      reversalOp: {
        type: 'restore-slot-schedule',
        slotId: brief.slotId,
        scheduledAt: slot.scheduledAt.toISOString(),
      },
    })

    logger.info('undelivered brief resolved by rescheduling the slot', {
      component: COMPONENT,
      briefId: String(brief._id),
      slotId: brief.slotId,
      to: newScheduledAt.toISOString(),
    })

    return { status: 'resolved', resolution: 'rescheduled', slotId: brief.slotId }
  }

  /** A brief is unresolved while it is still `pending` or `sent`. */
  private isUnresolved(status: ContentBriefStatus): boolean {
    return UNRESOLVED_STATUSES.includes(status)
  }
}

/** Shared default instance wired to the real stores + shared services. */
export const briefResolutionService = new BriefResolutionService()
