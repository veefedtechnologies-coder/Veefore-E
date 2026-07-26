/**
 * Auto Pilot — MediaPoolService.
 *
 * The Media_Pool is Auto Pilot's workspace-scoped store of reusable media
 * (user uploads, AI-generated backups, brief deliveries). This service owns the
 * pool's write-side behaviour that Requirement 6 defines:
 *
 *   • `validateUpload` (pure) — an uploaded media item is accepted only when it
 *     is ≤100MB AND a supported image/video type; otherwise it is rejected with
 *     a message identifying the reason (R6.5). Because it is pure it is fully
 *     unit-testable at the size/format bounds without a database.
 *
 *   • `addUpload` — validate, then add the passing item to the pool marked
 *     `available` so it can be assigned to future Content_Slots (R6.1). A
 *     failing item is rejected and never enters the pool (R6.5). The add is a
 *     single repository write, comfortably inside the 10-second budget (R6.1).
 *
 *   • `addGeneratedMedia` — AI-generated media (and brief deliveries) are added
 *     to the pool marked `available` for reuse, exactly like uploads (R6.3).
 *
 *   • `assignToSlot` — assign a pool item to a Content_Slot: record the assigned
 *     item and target slot in an Audit_Record (R6.4) and **retain** the item in
 *     the pool, still `available`, so it can be assigned to additional slots
 *     until the user removes it (R6.6). Assignment never consumes the item.
 *
 *   • `remove` — the only way an item leaves the reusable pool: the user removes
 *     it, which flips `available` to false (R6.6).
 *
 * The repository and audit service are injected (defaulting to the shared
 * singletons) so the reusability and audit behaviour is unit-testable without a
 * live database or notification transport.
 *
 * Satisfies Requirements: 6.1, 6.3, 6.4, 6.5, 6.6
 */

import { logger } from '../../../config/logger'
import {
  MediaPoolRepository,
  mediaPoolRepository,
} from '../db/repositories/MediaPoolRepository'
import type { IMediaPoolItem, MediaOrigin, MediaType } from '../db/models'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from './AutoPilotAuditService'

const COMPONENT = 'autopilot.MediaPoolService'

/** R6.5: the maximum accepted upload size — 100 MB, in bytes. */
export const MAX_MEDIA_SIZE_BYTES = 100 * 1024 * 1024

/**
 * Supported upload MIME types, grouped by the pool `mediaType` they map to.
 * Kept as data (not embedded in branching logic) so the accepted-format set is
 * explicit and easy to extend. Any type not listed here is unsupported (R6.5).
 */
export const SUPPORTED_MEDIA_TYPES: Record<MediaType, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
}

/** Why an upload failed validation (R6.5). */
export type MediaRejectionReason = 'too-large' | 'unsupported-format' | 'invalid-input'

/** The candidate upload to validate/add. `mimeType` and `sizeBytes` drive R6.5. */
export interface MediaUploadInput {
  /** Workspace the pool item is scoped to. */
  workspaceId: unknown
  /** Optional mission the item was uploaded for. */
  missionId?: string
  /** Public URL/location of the stored media. */
  mediaUrl: string
  /** MIME type reported for the upload (e.g. `image/png`, `video/mp4`). */
  mimeType: string
  /** Size of the upload in bytes. */
  sizeBytes: number
  /** Optional human/format label (e.g. `mp4`, `jpg`). */
  format?: string
  /** Origin of the item; defaults to `user-upload`. */
  origin?: MediaOrigin
}

/** The result of validating a candidate upload (R6.5). Pure, no side effects. */
export type MediaValidationResult =
  | { ok: true; mediaType: MediaType }
  | { ok: false; reason: MediaRejectionReason; message: string }

/** The outcome of an add-to-pool attempt (R6.1 / R6.3 / R6.5). */
export type AddMediaResult =
  | { added: true; item: IMediaPoolItem }
  | { added: false; reason: MediaRejectionReason; message: string }

/** Input for adding AI-generated / brief-delivery media to the pool (R6.3). */
export interface GeneratedMediaInput {
  workspaceId: unknown
  missionId?: string
  mediaUrl: string
  mediaType: MediaType
  format?: string
  sizeBytes: number
  /** Origin of the generated item; defaults to `ai-generated`. */
  origin?: Extract<MediaOrigin, 'ai-generated' | 'brief-delivery'>
}

/** The outcome of assigning a pool item to a slot (R6.4 / R6.6). */
export interface AssignToSlotResult {
  /** `true` when the item was found and assigned (and remains reusable). */
  assigned: boolean
  /** The item after assignment (still `available`), when `assigned`. */
  item?: IMediaPoolItem
  /** `true` when the assignment was recorded in an Audit_Record (R6.4). */
  audited: boolean
  /** A human-readable message describing the outcome. */
  message: string
}

/** Normalise a MIME type for comparison (lower-case, no parameters/whitespace). */
function normalizeMime(mimeType: string): string {
  return String(mimeType).trim().toLowerCase().split(';')[0]
}

/**
 * Owns the Media_Pool's write-side behaviour (validate, add, assign, remove).
 *
 * The repository and audit service are injected so reusability (R6.6) and the
 * assignment audit (R6.4) can be verified without a live database.
 */
export class MediaPoolService {
  constructor(
    private readonly repository: MediaPoolRepository = mediaPoolRepository,
    private readonly auditService: AutoPilotAuditService = autoPilotAuditService,
  ) {}

  /**
   * R6.5: validate a candidate upload. An item is accepted only when it is
   * ≤100MB (`MAX_MEDIA_SIZE_BYTES`) AND its MIME type is a supported image or
   * video type. Otherwise it is rejected with the reason and a message that
   * identifies why, so the caller can surface it to the user.
   *
   * Pure and side-effect-free.
   */
  validateUpload(input: Pick<MediaUploadInput, 'mimeType' | 'sizeBytes'>): MediaValidationResult {
    const { mimeType, sizeBytes } = input

    // Guard against malformed input (non-finite/negative size, empty type).
    if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
      return {
        ok: false,
        reason: 'invalid-input',
        message: 'The media could not be added: its size is missing or invalid.',
      }
    }
    if (typeof mimeType !== 'string' || mimeType.trim() === '') {
      return {
        ok: false,
        reason: 'invalid-input',
        message: 'The media could not be added: its file type is missing.',
      }
    }

    // R6.5: reject anything larger than 100MB.
    if (sizeBytes > MAX_MEDIA_SIZE_BYTES) {
      const mb = (sizeBytes / (1024 * 1024)).toFixed(1)
      return {
        ok: false,
        reason: 'too-large',
        message: `The media is ${mb}MB, which exceeds the 100MB maximum. Please upload a smaller file.`,
      }
    }

    // R6.5: reject anything that is not a supported image or video type.
    const normalized = normalizeMime(mimeType)
    const mediaType = this.resolveMediaType(normalized)
    if (!mediaType) {
      return {
        ok: false,
        reason: 'unsupported-format',
        message: `The file type "${mimeType}" is not a supported image or video format.`,
      }
    }

    return { ok: true, mediaType }
  }

  /**
   * R6.1 / R6.5: add an uploaded media item to the pool.
   *
   * Validates first; a failing item is rejected and never enters the pool
   * (R6.5). A passing item is persisted marked `available` so it is immediately
   * assignable to future Content_Slots (R6.1). The add is a single repository
   * write — well inside the 10-second budget R6.1 requires.
   */
  async addUpload(input: MediaUploadInput): Promise<AddMediaResult> {
    const validation = this.validateUpload(input)
    if (!validation.ok) {
      logger.info('Auto Pilot media upload rejected', {
        component: COMPONENT,
        workspaceId: String(input.workspaceId),
        reason: validation.reason,
      })
      return { added: false, reason: validation.reason, message: validation.message }
    }

    const item = await this.repository.create({
      workspaceId: input.workspaceId,
      missionId: input.missionId,
      origin: input.origin ?? 'user-upload',
      mediaUrl: input.mediaUrl,
      mediaType: validation.mediaType,
      format: input.format,
      sizeBytes: input.sizeBytes,
      // R6.1: available for assignment to future Content_Slots.
      available: true,
      usedInSlots: [],
    } as Partial<IMediaPoolItem>)

    return { added: true, item }
  }

  /**
   * R6.3: add AI-generated (or brief-delivery) media to the pool, marked
   * `available` for assignment to future Content_Slots — exactly like an
   * uploaded item, so generated backups accumulate in the reusable pool too.
   */
  async addGeneratedMedia(input: GeneratedMediaInput): Promise<IMediaPoolItem> {
    return this.repository.create({
      workspaceId: input.workspaceId,
      missionId: input.missionId,
      origin: input.origin ?? 'ai-generated',
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      format: input.format,
      sizeBytes: input.sizeBytes,
      // R6.3: available for assignment to future Content_Slots.
      available: true,
      usedInSlots: [],
    } as Partial<IMediaPoolItem>)
  }

  /**
   * R6.4 / R6.6: assign a pool item to a Content_Slot.
   *
   * Records the assigned item and target slot in an Audit_Record (R6.4) and
   * **retains** the item in the pool, still `available`, adding the slot to its
   * `usedInSlots` so it can be assigned to additional slots until the user
   * removes it (R6.6). Assignment therefore never consumes or hides the item.
   *
   * Returns `assigned: false` (without auditing) when the item does not exist.
   * The Audit_Record is best-effort: a failed audit write is escalated inside
   * the audit service and reported via `audited: false`, but the assignment
   * itself still stands.
   */
  async assignToSlot(
    itemId: string,
    slotId: string,
    context: { missionId: unknown; workspaceId: unknown },
  ): Promise<AssignToSlotResult> {
    const existing = await this.repository.findById(itemId)
    if (!existing) {
      return {
        assigned: false,
        audited: false,
        message: `Media item ${itemId} was not found in the pool.`,
      }
    }

    // R6.6: keep the item reusable — add the slot without flipping availability.
    const item = (await this.repository.addUsedInSlot(itemId, slotId)) ?? existing

    // R6.4: record the assignment (item + target slot) in an Audit_Record.
    const auditResult = await this.auditService.record({
      missionId: context.missionId,
      workspaceId: context.workspaceId,
      stage: 'ACT',
      action: 'assign-media',
      triggeringContext: { mediaPoolItemId: itemId, slotId },
      outcome: 'success',
      // Assignment is reversible: un-assign the item from the slot.
      reversible: true,
      preExecutionState: { usedInSlots: existing.usedInSlots?.map(String) ?? [] },
      reversalOp: { type: 'unassign-media', mediaPoolItemId: itemId, slotId },
    })

    return {
      assigned: true,
      item,
      audited: auditResult.recorded,
      message: `Media item ${itemId} assigned to slot ${slotId} and kept available for reuse.`,
    }
  }

  /**
   * R6.6: remove an item from the reusable pool at the user's request by
   * flipping `available` to false, so the resolver stops offering it while its
   * record (and assignment history) is preserved.
   */
  async remove(itemId: string): Promise<IMediaPoolItem | null> {
    return this.repository.setAvailability(itemId, false)
  }

  /** List the reusable (available) items for a workspace — resolver read. */
  async listAvailable(workspaceId: unknown): Promise<IMediaPoolItem[]> {
    return this.repository.findAvailableByWorkspace(workspaceId)
  }

  /** Map a normalised MIME type to its pool `mediaType`, or `null` if unsupported. */
  private resolveMediaType(normalizedMime: string): MediaType | null {
    if (SUPPORTED_MEDIA_TYPES.image.includes(normalizedMime)) return 'image'
    if (SUPPORTED_MEDIA_TYPES.video.includes(normalizedMime)) return 'video'
    return null
  }
}

/** Shared default instance using the real repository + shared audit service. */
export const mediaPoolService = new MediaPoolService()
