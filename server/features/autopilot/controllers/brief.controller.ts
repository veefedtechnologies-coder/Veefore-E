/**
 * Auto Pilot — Content_Brief delivery controller.
 *
 * HTTP surface for attaching user-delivered media to a Content_Brief's slot
 * (design "REST API" · Task 10.3):
 *
 *   • POST /briefs/:id/deliver → attach delivered media to the brief's slot (R7.8)
 *
 * This layer owns HTTP concerns only — zod validation, workspace ownership, and
 * response shaping. The delivery behaviour (validate media → add to Media_Pool →
 * assign to the Content_Slot → mark the slot `ready` → mark the brief
 * `delivered` → audit) is delegated wholesale to
 * {@link BriefResolutionService.deliverBrief}.
 *
 * Client contract: the ContentBriefCard (Task 19.5) delivers media in two steps —
 * it first uploads the file to the pool (`POST /missions/:id/media`) and then
 * calls this endpoint with the resulting `{ mediaPoolItemId }`. The controller
 * therefore resolves that already-stored pool item into the
 * {@link DeliveredMediaInput} the service expects (its `mediaUrl` / `mediaType` /
 * `sizeBytes` / `format`) and hands it to `deliverBrief`, which validates it
 * against the R6.5 bounds and records it as a `brief-delivery` pool item bound to
 * the slot.
 *
 * Ownership: every request resolves the brief first, confirms the brief's
 * `workspaceId` belongs to the authenticated user, and confirms the referenced
 * pool item lives in that same workspace before delegating — preventing
 * cross-workspace access (mirrors the Media_Pool + Approval controllers).
 *
 * Satisfies Requirements: 7.8
 */

import { type Request, type Response } from 'express'
import { z } from 'zod'
import { logger } from '../../../config/logger'
import { storage } from '../../../mongodb-storage'
import {
  BriefResolutionService,
  briefResolutionService,
  type DeliveredMediaInput,
} from '../services/BriefResolutionService'
import {
  MediaPoolRepository,
  mediaPoolRepository,
} from '../db/repositories/MediaPoolRepository'
import { ContentBriefModel, type MediaType } from '../db/models'

const COMPONENT = 'autopilot.BriefController'

/** Route-param schema — reject obviously malformed ids before any DB read. */
const BriefIdParam = z.object({ id: z.string().min(1) })

/**
 * Delivery body: the id of the Media_Pool item the user already uploaded for the
 * brief (the ContentBriefCard uploads first, then delivers by id — R7.8).
 */
const DeliverBody = z.object({ mediaPoolItemId: z.string().min(1) })

/**
 * Reads the workspace a brief is bound to, so the controller can enforce
 * ownership before delegating. Extracted as a port so delivery is unit-testable
 * without a live database. The default reads `ContentBriefModel` directly (there
 * is no dedicated brief repository; the resolution service does the same).
 */
export interface BriefWorkspaceReader {
  load(briefId: string): Promise<{ workspaceId: unknown } | null>
}

const defaultBriefWorkspaceReader: BriefWorkspaceReader = {
  async load(briefId) {
    const doc = await ContentBriefModel.findById(briefId).select('workspaceId').lean().exec()
    if (!doc) return null
    return { workspaceId: (doc as { workspaceId?: unknown }).workspaceId }
  },
}

/**
 * Reconstruct the MIME type of a stored pool item from its `mediaType` + `format`
 * (e.g. `image` + `png` → `image/png`), so the delivered media can be re-validated
 * by the service against the R6.5 supported-format set. Falls back to a canonical
 * type per media kind when the format label is absent.
 */
function mimeTypeForItem(mediaType: MediaType, format?: string | null): string {
  if (format && format.trim()) return `${mediaType}/${format.trim().toLowerCase()}`
  return mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
}

/**
 * Handler for the Content_Brief delivery endpoint. Dependencies are injected
 * (defaulting to the shared singletons) so the controller can be unit-tested
 * without a live database.
 */
export class BriefController {
  constructor(
    private readonly briefs: BriefResolutionService = briefResolutionService,
    private readonly pool: MediaPoolRepository = mediaPoolRepository,
    private readonly briefReader: BriefWorkspaceReader = defaultBriefWorkspaceReader,
  ) {}

  /** Resolve the authenticated user's id, or send 401 and return null. */
  private resolveUserId(req: Request, res: Response): string | null {
    const userId = (req as Request & { user?: { id?: string } }).user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    return userId
  }

  /**
   * Confirm the given workspaceId belongs to the authenticated user. Returns
   * true when the user owns it; otherwise sends 403 and returns false.
   */
  private async assertWorkspaceOwnership(
    userId: string,
    workspaceId: unknown,
    res: Response,
  ): Promise<boolean> {
    const workspaces = (await storage.getWorkspacesByUserId(userId)) ?? []
    const owns = workspaces.some((w: { id?: unknown }) => String(w.id) === String(workspaceId))
    if (!owns) {
      logger.warn('Auto Pilot brief: workspace ownership check failed', {
        component: COMPONENT,
        userId,
        workspaceId: String(workspaceId),
      })
      res.status(403).json({ error: 'Forbidden: you do not have access to this workspace' })
      return false
    }
    return true
  }

  /**
   * POST /briefs/:id/deliver — attach media the user delivered for a Content_Brief
   * to its Content_Slot (R7.8). Resolves the referenced pool item into the media
   * facts the resolution service validates + records, then delegates to
   * {@link BriefResolutionService.deliverBrief}.
   */
  async deliver(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const params = BriefIdParam.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({ error: 'Validation failed', details: params.error.flatten() })
        return
      }

      const body = DeliverBody.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: 'Validation failed', details: body.error.flatten() })
        return
      }

      const briefId = params.data.id
      const brief = await this.briefReader.load(briefId)
      if (!brief) {
        res.status(404).json({ error: 'Content brief not found' })
        return
      }

      // Ownership is enforced through the brief's workspace.
      if (!(await this.assertWorkspaceOwnership(userId, brief.workspaceId, res))) {
        return
      }

      // Resolve the already-uploaded pool item into the media the service needs.
      const item = await this.pool.findById(body.data.mediaPoolItemId)
      if (!item) {
        res.status(404).json({ error: 'Media item not found' })
        return
      }

      // Defense in depth: the referenced item must live in the brief's workspace.
      if (String(item.workspaceId) !== String(brief.workspaceId)) {
        logger.warn('Auto Pilot brief: media item workspace mismatch', {
          component: COMPONENT,
          userId,
          briefId,
          itemWorkspaceId: String(item.workspaceId),
          briefWorkspaceId: String(brief.workspaceId),
        })
        res.status(403).json({ error: 'Forbidden: media item does not belong to this workspace' })
        return
      }

      const media: DeliveredMediaInput = {
        mediaUrl: item.mediaUrl,
        mimeType: mimeTypeForItem(item.mediaType, item.format),
        sizeBytes: item.sizeBytes,
        format: item.format ?? undefined,
      }

      const result = await this.briefs.deliverBrief(briefId, media)

      switch (result.status) {
        case 'delivered':
          res.status(200).json({
            success: true,
            slotId: result.slotId,
            mediaPoolItemId: result.mediaPoolItemId,
          })
          return
        case 'rejected':
          // R6.5: the delivered media failed validation; nothing changed.
          res.status(400).json({ error: 'Invalid media', message: result.reason })
          return
        case 'already-resolved':
          res.status(409).json({ error: 'Brief already resolved', resolution: result.resolution })
          return
        case 'not-found':
          res.status(404).json({ error: 'Content brief not found' })
          return
      }
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot brief delivery failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to deliver brief', message: error.message })
    }
  }
}

/** Shared default instance wired to the real singletons. */
export const briefController = new BriefController()
