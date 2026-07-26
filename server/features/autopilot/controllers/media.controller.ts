/**
 * Auto Pilot — Media Pool Controller.
 *
 * HTTP surface for the workspace-scoped Media_Pool (design "REST API"):
 *
 *   • POST   /missions/:id/media  → upload media to the pool (≤100MB, image/video) (R6.1, R6.5)
 *   • GET    /missions/:id/media  → list the mission workspace's reusable pool   (R6)
 *   • DELETE /media/:itemId       → remove a pool item at the user's request     (R6.6)
 *
 * This layer owns HTTP concerns only — validation, workspace/account ownership
 * checks, and response shaping. All pool behaviour is delegated to
 * `MediaPoolService` (Task 7.1), and durable storage of the uploaded bytes to
 * the shared `StorageService`. The pool is workspace-scoped, so every request
 * resolves the mission (or item) first and confirms the mission's `workspaceId`
 * belongs to the authenticated user before touching the pool — preventing
 * cross-workspace access.
 *
 * The uploaded file is validated against the R6.5 bounds (≤100MB image/video)
 * BEFORE it is persisted to storage, so a rejected upload never leaves bytes
 * behind and the caller gets a message identifying the reason (R6.5).
 *
 * Satisfies Requirements: 6.1, 6.5, 6.6
 */

import { type Request, type Response } from 'express'
import { z } from 'zod'
import { logger } from '../../../config/logger'
import { storage } from '../../../mongodb-storage'
import { getStorageService } from '../../storage/services/storage.service'
import { mediaPoolService, MediaPoolService } from '../services/MediaPoolService'
import { missionRepository, MissionRepository } from '../db/repositories/MissionRepository'
import { mediaPoolRepository, MediaPoolRepository } from '../db/repositories/MediaPoolRepository'
import type { IAutoPilotMission, IMediaPoolItem } from '../db/models'

const COMPONENT = 'autopilot.MediaController'

/** Route-param schemas — reject obviously malformed ids before any DB read. */
const MissionIdParam = z.object({ id: z.string().min(1) })
const MediaItemIdParam = z.object({ itemId: z.string().min(1) })

/** Shape a pool item for the wire (never leak the raw Mongoose document). */
function serializeItem(item: IMediaPoolItem) {
  return {
    id: String(item._id),
    workspaceId: item.workspaceId != null ? String(item.workspaceId) : null,
    missionId: item.missionId != null ? String(item.missionId) : null,
    origin: item.origin,
    mediaUrl: item.mediaUrl,
    mediaType: item.mediaType,
    format: item.format ?? null,
    sizeBytes: item.sizeBytes,
    available: item.available,
    usedInSlots: (item.usedInSlots ?? []).map(String),
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
  }
}

/**
 * Handlers for the Media_Pool endpoints. Dependencies are injected (defaulting
 * to the shared singletons) so the controller can be unit-tested without a live
 * database or storage backend.
 */
export class MediaController {
  constructor(
    private readonly mediaPool: MediaPoolService = mediaPoolService,
    private readonly missions: MissionRepository = missionRepository,
    private readonly pool: MediaPoolRepository = mediaPoolRepository,
    private readonly storageService = getStorageService(),
  ) {}

  /**
   * Resolve the authenticated user's id, or send 401 and return null.
   * `req.user` is attached by `requireAuth`.
   */
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
      logger.warn('Auto Pilot media: workspace ownership check failed', {
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
   * Load a mission by id and confirm the caller owns its workspace. Sends the
   * appropriate error response and returns null on any failure.
   */
  private async resolveOwnedMission(
    req: Request,
    res: Response,
    userId: string,
  ): Promise<IAutoPilotMission | null> {
    const parsed = MissionIdParam.safeParse(req.params)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return null
    }

    const mission = await this.missions.findById(parsed.data.id)
    if (!mission) {
      res.status(404).json({ error: 'Mission not found' })
      return null
    }

    if (!(await this.assertWorkspaceOwnership(userId, mission.workspaceId, res))) {
      return null
    }
    return mission
  }

  /**
   * POST /missions/:id/media — upload a media item to the mission workspace's
   * pool. The file arrives as `req.file` (multer, field `file`). We validate the
   * R6.5 bounds first (so nothing is persisted for a rejected upload), store the
   * bytes, then add the item to the pool marked available (R6.1).
   */
  async uploadMedia(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const file = (req as Request & { file?: Express.Multer.File }).file
      if (!file) {
        res.status(400).json({ error: 'No file uploaded', message: 'Attach a media file in the "file" field.' })
        return
      }

      // R6.5: validate size + format BEFORE persisting anything. A rejected
      // upload returns the reason and never leaves bytes in storage.
      const validation = this.mediaPool.validateUpload({
        mimeType: file.mimetype,
        sizeBytes: file.size,
      })
      if (!validation.ok) {
        res.status(400).json({ error: 'Invalid media', reason: validation.reason, message: validation.message })
        return
      }

      // Persist the bytes to durable storage to obtain a stable URL.
      const uploadResult = await this.storageService.uploadFile({
        buffer: file.buffer,
        originalName: file.originalname,
        mimetype: file.mimetype,
        folder: `autopilot/media/${String(mission.workspaceId)}`,
      })

      // R6.1: add to the pool marked available for assignment to future slots.
      const result = await this.mediaPool.addUpload({
        workspaceId: mission.workspaceId,
        missionId: String(mission._id),
        mediaUrl: uploadResult.url,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        format: file.mimetype.split('/')[1],
        origin: 'user-upload',
      })

      if (!result.added) {
        res.status(400).json({ error: 'Invalid media', reason: result.reason, message: result.message })
        return
      }

      res.status(201).json({ success: true, item: serializeItem(result.item) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot media upload failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Media upload failed', message: error.message })
    }
  }

  /**
   * GET /missions/:id/media — list the reusable (available) pool items for the
   * mission's workspace (R6). Removed items (available=false) are excluded.
   */
  async listMedia(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const items = await this.mediaPool.listAvailable(mission.workspaceId)
      res.status(200).json({ success: true, items: items.map(serializeItem) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot media list failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to list media', message: error.message })
    }
  }

  /**
   * DELETE /media/:itemId — remove a pool item at the user's request (R6.6).
   * The item is resolved first so its workspace ownership can be enforced;
   * removal flips `available` to false rather than hard-deleting, preserving
   * the record and its assignment history.
   */
  async deleteMedia(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const parsed = MediaItemIdParam.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
        return
      }

      const existing = await this.pool.findById(parsed.data.itemId)
      if (!existing) {
        res.status(404).json({ error: 'Media item not found' })
        return
      }

      if (!(await this.assertWorkspaceOwnership(userId, existing.workspaceId, res))) {
        return
      }

      const removed = await this.mediaPool.remove(parsed.data.itemId)
      res.status(200).json({
        success: true,
        item: removed ? serializeItem(removed) : { id: parsed.data.itemId, available: false },
      })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot media delete failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to remove media', message: error.message })
    }
  }
}

/** Shared default instance wired to the real singletons. */
export const mediaController = new MediaController()
