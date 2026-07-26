/**
 * Auto Pilot — Approval Controller.
 *
 * HTTP surface for the Approval_Card lifecycle (design "REST API"):
 *
 *   • POST /approvals/:id/approve → approve the card                 (R4.6)
 *   • POST /approvals/:id/edit    → edit + re-validate vs guardrails  (R4.3, R4.4)
 *   • POST /approvals/:id/reject  → reject (reschedule slot if any)   (R4.5, R5.3, R11.7)
 *
 * This layer owns HTTP concerns only — zod validation, workspace ownership, and
 * response shaping. All lifecycle behaviour is delegated to
 * {@link ApprovalLifecycleService}. Every request resolves the approval first,
 * loads its mission, and confirms the mission's `workspaceId` belongs to the
 * authenticated user before touching the approval — preventing cross-workspace
 * access (mirrors the Media_Pool controller).
 *
 * The publish-time expiry path (R4.7) is not an interactive endpoint: it is
 * driven by {@link ApprovalLifecycleService.sweepExpired} from the Operating
 * Loop / a scheduled sweep, so it is intentionally absent here.
 *
 * Satisfies Requirements: 4.3, 4.4, 4.5, 4.6, 5.3, 11.7
 */

import { type Request, type Response } from 'express'
import { z } from 'zod'
import { logger } from '../../../config/logger'
import { storage } from '../../../mongodb-storage'
import {
  ApprovalLifecycleService,
  approvalLifecycleService,
} from '../services/ApprovalLifecycleService'
import { approvalRepository, ApprovalRepository } from '../db/repositories/ApprovalRepository'
import { missionRepository, MissionRepository } from '../db/repositories/MissionRepository'
import type { IApproval } from '../db/models'

const COMPONENT = 'autopilot.ApprovalController'

/** Route-param schema — reject obviously malformed ids before any DB read. */
const ApprovalIdParam = z.object({ id: z.string().min(1) })

/**
 * Edit body: the edited payload plus optional re-validation facts (frequency
 * cap / credit-budget inputs) the guardrail re-check evaluates (R4.3/R4.4). The
 * payload must carry the content being validated (as `content`/`caption`/`text`)
 * or an empty edit; unknown keys are preserved so callers can edit any field.
 */
const EditBody = z.object({
  editedPayload: z.record(z.unknown()),
  revalidation: z
    .object({
      at: z.union([z.string(), z.number()]).optional(),
      existingActionTimes: z.array(z.union([z.string(), z.number()])).optional(),
      credits: z
        .object({ consumed: z.number(), estimatedCost: z.number() })
        .optional(),
      brandVoiceViolation: z.string().nullable().optional(),
      type: z.string().optional(),
    })
    .optional(),
})

/** Shape an approval for the wire (never leak the raw Mongoose document). */
function serializeApproval(approval: IApproval) {
  return {
    id: String(approval._id),
    missionId: approval.missionId != null ? String(approval.missionId) : null,
    workspaceId: approval.workspaceId != null ? String(approval.workspaceId) : null,
    itemType: approval.itemType,
    itemRef: approval.itemRef != null ? String(approval.itemRef) : null,
    status: approval.status,
    editedPayload: approval.editedPayload ?? null,
    decidedAt: approval.decidedAt instanceof Date ? approval.decidedAt.toISOString() : approval.decidedAt ?? null,
    expiresAt: approval.expiresAt instanceof Date ? approval.expiresAt.toISOString() : approval.expiresAt ?? null,
  }
}

/** Coerce a wire time value (ISO string or epoch ms) to a `Date | number`. */
function toTime(value: string | number | undefined): Date | number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/**
 * Handlers for the Approval_Card lifecycle endpoints. Dependencies are injected
 * (defaulting to the shared singletons) so the controller can be unit-tested
 * without a live database.
 */
export class ApprovalController {
  constructor(
    private readonly lifecycle: ApprovalLifecycleService = approvalLifecycleService,
    private readonly approvals: ApprovalRepository = approvalRepository,
    private readonly missions: MissionRepository = missionRepository,
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
   * Load the approval named by `:id` and confirm the caller owns the workspace
   * of its mission. Sends the appropriate error response and returns null on any
   * failure, so handlers can early-return.
   */
  private async resolveOwnedApproval(
    req: Request,
    res: Response,
    userId: string,
  ): Promise<IApproval | null> {
    const parsed = ApprovalIdParam.safeParse(req.params)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return null
    }

    const approval = await this.approvals.findById(parsed.data.id)
    if (!approval) {
      res.status(404).json({ error: 'Approval not found' })
      return null
    }

    // Ownership is enforced through the approval's mission workspace.
    const mission = await this.missions.findById(String(approval.missionId))
    if (!mission) {
      res.status(404).json({ error: 'Mission not found' })
      return null
    }

    const workspaces = (await storage.getWorkspacesByUserId(userId)) ?? []
    const owns = workspaces.some((w: { id?: unknown }) => String(w.id) === String(mission.workspaceId))
    if (!owns) {
      logger.warn('Auto Pilot approval: workspace ownership check failed', {
        component: COMPONENT,
        userId,
        workspaceId: String(mission.workspaceId),
      })
      res.status(403).json({ error: 'Forbidden: you do not have access to this workspace' })
      return null
    }

    return approval
  }

  /** POST /approvals/:id/approve — approve the card so its item may execute (R4.6). */
  async approve(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const approval = await this.resolveOwnedApproval(req, res, userId)
      if (!approval) return

      const result = await this.lifecycle.approve(String(approval._id))
      if (result.status === 'not-found') {
        res.status(404).json({ error: 'Approval not found' })
        return
      }
      if (result.status === 'already-decided') {
        res.status(409).json({
          error: 'Approval already decided',
          currentStatus: result.currentStatus,
        })
        return
      }
      res.status(200).json({ success: true, approval: serializeApproval(result.approval) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot approval approve failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to approve', message: error.message })
    }
  }

  /**
   * POST /approvals/:id/edit — apply the user's edits after re-validating them
   * against the mission guardrails (R4.3). Edits that introduce a banned topic
   * or exceed a guardrail bound are rejected with the violated guardrail and the
   * approval is left pending in its pre-edit state (R4.4) → 422.
   */
  async edit(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const approval = await this.resolveOwnedApproval(req, res, userId)
      if (!approval) return

      const body = EditBody.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: 'Validation failed', details: body.error.flatten() })
        return
      }

      const revalidation = body.data.revalidation
      const result = await this.lifecycle.edit(String(approval._id), body.data.editedPayload, {
        at: toTime(revalidation?.at),
        existingActionTimes: revalidation?.existingActionTimes
          ?.map(toTime)
          .filter((t): t is Date | number => t !== undefined),
        credits: revalidation?.credits,
        brandVoiceViolation: revalidation?.brandVoiceViolation ?? undefined,
        type: revalidation?.type,
      })

      if (result.status === 'not-found') {
        res.status(404).json({ error: 'Approval not found' })
        return
      }
      if (result.status === 'already-decided') {
        res.status(409).json({ error: 'Approval already decided', currentStatus: result.currentStatus })
        return
      }
      if (result.status === 'edit-rejected') {
        // R4.4: edits violate guardrails → 422, item withheld, pre-edit state kept.
        res.status(422).json({
          error: 'Edit rejected',
          message: result.message,
          violations: result.violations,
        })
        return
      }
      res.status(200).json({ success: true, approval: serializeApproval(result.approval) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot approval edit failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to edit', message: error.message })
    }
  }

  /**
   * POST /approvals/:id/reject — discard the proposal (R4.5/R5.3/R11.7). When the
   * item is a Content_Slot the slot is resolved so it never publishes empty; the
   * applied resolution is returned.
   */
  async reject(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const approval = await this.resolveOwnedApproval(req, res, userId)
      if (!approval) return

      const result = await this.lifecycle.reject(String(approval._id))
      if (result.status === 'not-found') {
        res.status(404).json({ error: 'Approval not found' })
        return
      }
      if (result.status === 'already-decided') {
        res.status(409).json({ error: 'Approval already decided', currentStatus: result.currentStatus })
        return
      }
      res.status(200).json({
        success: true,
        approval: serializeApproval(result.approval),
        slotResolution: result.slotResolution ?? null,
      })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot approval reject failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to reject', message: error.message })
    }
  }
}

/** Shared default instance wired to the real singletons. */
export const approvalController = new ApprovalController()
