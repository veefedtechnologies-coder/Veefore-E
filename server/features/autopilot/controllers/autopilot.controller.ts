/**
 * Auto Pilot — Mission Controller.
 *
 * HTTP surface for the Mission lifecycle + Operating-Loop control plane
 * (design "REST API"):
 *
 *   • POST   /missions                → create a Mission (draft)              (R1)
 *   • GET    /missions?workspaceId=…   → list a workspace's missions          (R16.1)
 *   • GET    /missions/:id             → mission detail + progress + strategy (R16.4)
 *   • PATCH  /missions/:id             → update mode / guardrails             (R1.8, R13.4)
 *   • DELETE /missions/:id             → remove a Mission (+ stop its loop)   (R1)
 *   • POST   /missions/:id/activate    → draft/paused → active (starts loop)  (R3)
 *   • POST   /missions/:id/pause       → active → paused (stops new actions)  (R3.5, R3.6)
 *   • POST   /missions/:id/resume      → paused → active (restarts loop)      (R3.5)
 *   • GET    /missions/:id/slots       → upcoming Content_Plan slots          (R2.5)
 *   • GET    /missions/:id/activity    → Operating-Loop activity log (audit)  (R16.4, R17)
 *   • POST   /missions/:id/budget      → raise Credit_Budget / approve spend  (R14.5)
 *   • POST   /actions/:auditId/undo    → reverse a reversible action          (R13.6, R17.2)
 *
 * This layer owns HTTP concerns only — zod validation, workspace/account
 * ownership checks, and response shaping. All behaviour is delegated to the
 * injected repositories, the loop-queue manager (start/stop the repeatable
 * Operating-Loop job), and the {@link AutoPilotAuditService} (activity log +
 * undo). Every request that names a mission resolves it first and confirms the
 * mission's `workspaceId` belongs to the authenticated user before acting —
 * preventing cross-workspace access (mirrors the Media_Pool / Approval
 * controllers).
 *
 * Activation-time validation of goal completeness / future target date / a
 * connected IG account (Task 18.2) is enforced in {@link
 * AutoPilotController.activateMission} via {@link ConnectedAccountChecker}; the
 * non-Instagram execution guard (Task 18.3) is layered on in its own task. This
 * controller owns the CRUD + lifecycle + slots + activity + budget + undo
 * surface.
 *
 * Satisfies Requirements: 1.1, 1.5, 1.6, 1.7, 1.8, 3.5, 14.5, 16.1
 */

import { type Request, type Response } from 'express'
import { z } from 'zod'
import { logger } from '../../../config/logger'
import { storage } from '../../../mongodb-storage'
import { socialAccountService } from '../../../services/SocialAccountService'
import { missionRepository, MissionRepository } from '../db/repositories/MissionRepository'
import { contentSlotRepository, ContentSlotRepository } from '../db/repositories/ContentSlotRepository'
import { approvalRepository, ApprovalRepository } from '../db/repositories/ApprovalRepository'
import { autoPilotAuditService, AutoPilotAuditService } from '../services/AutoPilotAuditService'
import { AutopilotLoopQueueManager } from '../queues/autopilotLoopQueue'
import {
  AutoPilotAuditRecordModel,
  type IAutoPilotAuditRecord,
} from '../db/models/AutoPilotAuditRecordModel'
import {
  isInstagramPlatform,
  isSupportedExecutionPlatform,
  type IApproval,
  type IAutoPilotMission,
  type IContentSlot,
} from '../db/models'

const COMPONENT = 'autopilot.MissionController'

/** Default number of activity-log entries returned when no `limit` is given. */
const DEFAULT_ACTIVITY_LIMIT = 50
/** Hard ceiling so a caller cannot request an unbounded activity page. */
const MAX_ACTIVITY_LIMIT = 200

// ── Validation schemas ───────────────────────────────────────────────────────

const MissionIdParam = z.object({ id: z.string().min(1) })
const AuditIdParam = z.object({ auditId: z.string().min(1) })

/** Posting-frequency guardrail (mirrors the mission model bounds). */
const FrequencySchema = z.object({
  count: z.number().int().min(1),
  per: z.enum(['day', 'week']),
  windowMs: z.number().int().positive().optional(),
})

/** Guardrails block accepted on create. `creditBudget` is bounded 1..1,000,000 (R14.6). */
const GuardrailsSchema = z.object({
  bannedTopics: z.array(z.string()).optional(),
  postingFrequency: FrequencySchema.optional(),
  creditBudget: z.number().min(1).max(1_000_000),
  approvalRequiredActions: z.array(z.string()).optional(),
})

/** Goal block. `targetValue` is bounded 1..100,000,000 (R1.2). */
const GoalSchema = z.object({
  metric: z.enum(['followers', 'engagement', 'reach']),
  targetValue: z.number().min(1).max(100_000_000),
  targetDate: z.union([z.string(), z.number()]).optional(),
  startValue: z.number().min(0).optional(),
})

const CreateMissionBody = z.object({
  workspaceId: z.string().min(1),
  accountId: z.string().min(1),
  platform: z.string().min(1).optional(),
  goal: GoalSchema,
  niche: z.string().min(1).max(100),
  brandVoice: z.string().min(1).max(2000),
  localLanguage: z.string().min(1).optional(),
  operatingMode: z.enum(['copilot', 'autopilot']),
  contentSourcePreference: z.enum(['user-first', 'ai-first']).optional(),
  guardrails: GuardrailsSchema,
})

/**
 * PATCH body — only the fields R1.8 / R13.4 allow updating on an existing
 * mission apply to subsequent actions: operating mode and guardrails. At least
 * one field must be present.
 */
const UpdateMissionBody = z
  .object({
    operatingMode: z.enum(['copilot', 'autopilot']).optional(),
    contentSourcePreference: z.enum(['user-first', 'ai-first']).optional(),
    guardrails: z
      .object({
        bannedTopics: z.array(z.string()).optional(),
        postingFrequency: FrequencySchema.optional(),
        creditBudget: z.number().min(1).max(1_000_000).optional(),
        approvalRequiredActions: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one updatable field is required',
  })

/** Budget-raise body (R14.5): the new Credit_Budget, bounded 1..1,000,000. */
const BudgetBody = z.object({
  creditBudget: z.number().min(1).max(1_000_000),
})

const ListMissionsQuery = z.object({
  workspaceId: z.string().min(1),
})

const ActivityQuery = z.object({
  limit: z.union([z.string(), z.number()]).optional(),
})

// ── Injectable ports ─────────────────────────────────────────────────────────

/**
 * The loop-queue surface the controller needs to start/stop a mission's
 * repeatable Operating-Loop job (Task 17.2). Extracted as a port so lifecycle
 * transitions are unit-testable without Redis/BullMQ.
 */
export interface LoopScheduler {
  scheduleMission(input: {
    missionId: string
    workspaceId: string
    cadenceMs?: number
  }): Promise<boolean>
  removeMission(missionId: string): Promise<boolean>
}

/** Default loop scheduler — delegates to the real BullMQ queue manager. */
const defaultLoopScheduler: LoopScheduler = {
  scheduleMission: (input) => AutopilotLoopQueueManager.scheduleMission(input),
  removeMission: (missionId) => AutopilotLoopQueueManager.removeMission(missionId),
}

/**
 * Read port for the Operating-Loop activity log. Defaults to the audit model
 * (newest-first, per its `{ missionId, createdAt: -1 }` index). Isolated so the
 * activity + undo ownership reads are testable without a database.
 */
export interface AuditLogReader {
  /** Newest-first audit records for a mission, capped at `limit`. */
  listByMission(missionId: string, limit: number): Promise<IAutoPilotAuditRecord[]>
  /** Load one audit record by id (for undo ownership resolution). */
  findById(auditId: string): Promise<IAutoPilotAuditRecord | null>
}

const defaultAuditLogReader: AuditLogReader = {
  async listByMission(missionId: string, limit: number): Promise<IAutoPilotAuditRecord[]> {
    return (await AutoPilotAuditRecordModel.find({ missionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec()) as unknown as IAutoPilotAuditRecord[]
  },
  async findById(auditId: string): Promise<IAutoPilotAuditRecord | null> {
    return (await AutoPilotAuditRecordModel.findById(auditId).exec()) as IAutoPilotAuditRecord | null
  },
}

/**
 * Port that answers whether a workspace has a connected social account for the
 * mission's platform. Used by activation-time validation (Task 18.2, R1.6) to
 * refuse activating a mission whose workspace has no connected Instagram
 * account. Extracted as a port so activation is unit-testable without a live
 * social-account store. Defaults to the existing {@link socialAccountService}
 * (`getAccountByPlatform`) — the same service the publish worker uses to resolve
 * an account before publishing.
 */
export interface ConnectedAccountChecker {
  /** True when `workspaceId` has a connected account for `platform`. */
  hasConnectedAccount(workspaceId: string, platform: string): Promise<boolean>
}

const defaultConnectedAccountChecker: ConnectedAccountChecker = {
  async hasConnectedAccount(workspaceId: string, platform: string): Promise<boolean> {
    const account = await socialAccountService.getAccountByPlatform(
      workspaceId,
      platform as never,
    )
    return Boolean(account)
  },
}

// ── Serializers (never leak the raw Mongoose document) ───────────────────────

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  return (value as string | null) ?? null
}

function serializeMission(mission: IAutoPilotMission) {
  return {
    id: String(mission._id),
    workspaceId: mission.workspaceId != null ? String(mission.workspaceId) : null,
    accountId: mission.accountId,
    platform: mission.platform,
    goal: mission.goal,
    niche: mission.niche,
    brandVoice: mission.brandVoice,
    localLanguage: mission.localLanguage ?? null,
    operatingMode: mission.operatingMode,
    contentSourcePreference: mission.contentSourcePreference,
    guardrails: mission.guardrails,
    strategy: mission.strategy ?? null,
    strategyMemory: mission.strategyMemory ?? [],
    progress: mission.progress ?? [],
    status: mission.status,
    lastIterationAt: toIso(mission.lastIterationAt),
    createdAt: toIso(mission.createdAt),
    updatedAt: toIso(mission.updatedAt),
  }
}

function serializeSlot(slot: IContentSlot, mediaUrls: string[] = []) {
  return {
    id: String(slot._id),
    missionId: slot.missionId != null ? String(slot.missionId) : null,
    workspaceId: slot.workspaceId != null ? String(slot.workspaceId) : null,
    scheduledAt: toIso(slot.scheduledAt),
    format: slot.format,
    theme: slot.theme,
    source: slot.source,
    caption: slot.caption ?? null,
    hashtags: slot.hashtags ?? [],
    mediaUrls,
    contentId: slot.contentId != null ? String(slot.contentId) : null,
    status: slot.status,
    fallbackResolution: slot.fallbackResolution ?? null,
  }
}

/** A mission's Auto Pilot engagement automation, shaped for the UI. */
function serializeAutomation(rule: {
  _id: unknown
  type?: string
  keywords?: string[]
  matchMode?: string
  isActive?: boolean
  action?: { responses?: unknown[]; dmResponses?: unknown[] }
  createdAt?: Date
}) {
  const action = rule.action ?? {}
  const responses = Array.isArray(action.responses) ? action.responses : []
  const dmResponses = Array.isArray(action.dmResponses) ? action.dmResponses : []
  // Map the stored rule type back to the user-facing automation kind.
  const kind =
    rule.type === 'comment_dm'
      ? 'comment-to-dm'
      : rule.type === 'dm_only'
        ? 'dm-only'
        : 'comment-only'
  return {
    id: String(rule._id),
    kind,
    keyword: Array.isArray(rule.keywords) && rule.keywords.length > 0 ? String(rule.keywords[0]) : null,
    commentReply: typeof responses[0] === 'string' ? (responses[0] as string) : null,
    dmMessage: typeof dmResponses[0] === 'string' ? (dmResponses[0] as string) : null,
    isActive: rule.isActive !== false,
    createdAt: toIso(rule.createdAt),
  }
}

function serializeApproval(approval: IApproval) {
  return {
    id: String((approval as { _id?: unknown })._id),
    missionId: approval.missionId != null ? String(approval.missionId) : null,
    workspaceId: approval.workspaceId != null ? String(approval.workspaceId) : null,
    itemType: approval.itemType,
    itemRef: approval.itemRef != null ? String(approval.itemRef) : null,
    chatMessageId: approval.chatMessageId ?? null,
    status: approval.status,
    editedPayload: approval.editedPayload ?? null,
    expiresAt: toIso(approval.expiresAt),
    createdAt: toIso(approval.createdAt),
    updatedAt: toIso(approval.updatedAt),
  }
}

function serializeAuditRecord(record: IAutoPilotAuditRecord) {
  return {
    id: String((record as { _id?: unknown })._id),
    missionId: record.missionId != null ? String(record.missionId) : null,
    stage: record.stage,
    action: record.action,
    triggeringContext: record.triggeringContext ?? {},
    outcome: record.outcome,
    reversible: record.reversible,
    reversedAt: toIso(record.reversedAt),
    createdAt: toIso(record.createdAt),
  }
}

/** Coerce a wire date value (ISO string, epoch ms, or `Date`) to a `Date`, or undefined. */
function toDate(value: string | number | Date | undefined): Date | undefined {
  if (value === undefined) return undefined
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/**
 * Handlers for the Mission lifecycle endpoints. Dependencies are injected
 * (defaulting to the shared singletons) so the controller can be unit-tested
 * without a live database, Redis, or notification transport.
 */
export class AutoPilotController {
  constructor(
    private readonly missions: MissionRepository = missionRepository,
    private readonly slots: ContentSlotRepository = contentSlotRepository,
    private readonly audit: AutoPilotAuditService = autoPilotAuditService,
    private readonly loop: LoopScheduler = defaultLoopScheduler,
    private readonly auditLog: AuditLogReader = defaultAuditLogReader,
    private readonly accounts: ConnectedAccountChecker = defaultConnectedAccountChecker,
    private readonly approvals: ApprovalRepository = approvalRepository,
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
      logger.warn('Auto Pilot mission: workspace ownership check failed', {
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
   * Load a mission by `:id` and confirm the caller owns its workspace. Sends the
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
   * Fire-and-forget one Operating-Loop iteration right now (best-effort). Called
   * on activate/resume so Auto Pilot senses/plans/drafts immediately instead of
   * waiting for the first repeatable tick — and so it still works when the
   * background BullMQ worker or Redis isn't consuming jobs. Never throws; the
   * orchestrator captures its own failures and we only log setup problems.
   */
  private runImmediateIteration(missionId: string, workspaceId: string): void {
    void (async () => {
      try {
        const [{ createLoopJobProcessor }, { createAutoPilotOrchestrator }, { buildDefaultLoopStages }] =
          await Promise.all([
            import('../workers/autopilotLoopWorker'),
            import('../services/AutoPilotOrchestrator'),
            import('../workers/loopStages'),
          ])
        const processJob = createLoopJobProcessor({
          orchestrator: createAutoPilotOrchestrator({ stages: buildDefaultLoopStages() }),
        })
        await processJob({ missionId, workspaceId })
        logger.info('Auto Pilot immediate iteration complete', {
          component: COMPONENT,
          missionId,
        })
      } catch (err) {
        logger.warn('Auto Pilot immediate iteration failed', {
          component: COMPONENT,
          missionId,
          error: (err as Error).message,
        })
      }
    })()
  }

  /**
   * POST /missions — create a Mission in `draft` status (R1.1). The goal target
   * value / credit budget bounds are validated by zod (R1.2/R14.6); the caller
   * must own the target workspace. Activation-time completeness checks (target
   * metric present, future target date, connected IG account) are enforced at
   * activate (Task 18.2), so a draft may be created incrementally.
   */
  async createMission(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const body = CreateMissionBody.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: 'Validation failed', details: body.error.flatten() })
        return
      }

      if (!(await this.assertWorkspaceOwnership(userId, body.data.workspaceId, res))) {
        return
      }

      const data = body.data
      const targetDate = toDate(data.goal.targetDate)

      const created = await this.missions.create({
        workspaceId: data.workspaceId,
        accountId: data.accountId,
        platform: data.platform ?? 'instagram',
        goal: {
          metric: data.goal.metric,
          targetValue: data.goal.targetValue,
          ...(targetDate ? { targetDate } : {}),
          startValue: data.goal.startValue ?? 0,
        },
        niche: data.niche,
        brandVoice: data.brandVoice,
        ...(data.localLanguage ? { localLanguage: data.localLanguage } : {}),
        operatingMode: data.operatingMode,
        contentSourcePreference: data.contentSourcePreference ?? 'user-first',
        guardrails: {
          bannedTopics: data.guardrails.bannedTopics ?? [],
          postingFrequency: data.guardrails.postingFrequency ?? {
            count: 1,
            per: 'week',
            windowMs: 7 * 24 * 60 * 60 * 1000,
          },
          creditBudget: data.guardrails.creditBudget,
          approvalRequiredActions: data.guardrails.approvalRequiredActions ?? [],
        },
        status: 'draft',
      } as Partial<IAutoPilotMission>)

      res.status(201).json({ success: true, mission: serializeMission(created) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission create failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to create mission', message: error.message })
    }
  }

  /** GET /missions?workspaceId=… — list a workspace's missions (R16.1). */
  async listMissions(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const query = ListMissionsQuery.safeParse(req.query ?? {})
      if (!query.success) {
        res.status(400).json({ error: 'Validation failed', details: query.error.flatten() })
        return
      }

      if (!(await this.assertWorkspaceOwnership(userId, query.data.workspaceId, res))) {
        return
      }

      const missions = await this.missions.findAllByWorkspace(query.data.workspaceId)
      res.status(200).json({ success: true, missions: missions.map(serializeMission) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission list failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to list missions', message: error.message })
    }
  }

  /** GET /missions/:id — mission detail + progress + strategy (R16.4). */
  async getMission(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return
      res.status(200).json({ success: true, mission: serializeMission(mission) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission get failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to load mission', message: error.message })
    }
  }

  /**
   * PATCH /missions/:id — update the operating mode / content-source preference
   * / guardrails. Per R1.8 / R13.4 the change applies to subsequent actions; the
   * loop is not re-scheduled here. Guardrails are merged so a partial update
   * (e.g. only `creditBudget`) preserves the untouched fields.
   */
  async updateMission(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const body = UpdateMissionBody.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: 'Validation failed', details: body.error.flatten() })
        return
      }

      const update: Record<string, unknown> = {}
      if (body.data.operatingMode !== undefined) update.operatingMode = body.data.operatingMode
      if (body.data.contentSourcePreference !== undefined) {
        update.contentSourcePreference = body.data.contentSourcePreference
      }
      if (body.data.guardrails) {
        // Merge onto the existing guardrails so a partial update is non-destructive.
        update.guardrails = { ...mission.guardrails, ...body.data.guardrails }
      }

      const updated = await this.missions.updateById(String(mission._id), update as never)
      res.status(200).json({
        success: true,
        mission: serializeMission(updated ?? mission),
      })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission update failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to update mission', message: error.message })
    }
  }

  /**
   * DELETE /missions/:id — remove a Mission. Its repeatable Operating-Loop job is
   * removed first (best-effort) so no autonomous iteration outlives the mission.
   */
  async deleteMission(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      await this.loop.removeMission(String(mission._id))
      await this.missions.deleteById(String(mission._id))
      res.status(200).json({ success: true, id: String(mission._id) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission delete failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to delete mission', message: error.message })
    }
  }

  /**
   * Enforce the activation-time preconditions (Task 18.2):
   *   • R1.3 — the Goal must carry a target metric that is a numeric value within
   *            1..100,000,000 inclusive;
   *   • R1.4 — an optional target date, if present, must be later than now;
   *   • R18.6/R18.7 (Task 18.3) — the mission's platform must be Instagram;
   *            a non-Instagram mission is declined (autonomous execution is
   *            Instagram-only in v1) while its definition is retained;
   *   • R1.6 — the mission's workspace must have a connected Instagram account.
   * On the first failing precondition this sends a 400 with a message naming the
   * offending field and returns false; when all pass it returns true without
   * touching the response. Checks run cheapest-first (in-memory goal/date before
   * the social-account lookup).
   */
  private async assertActivationPreconditions(
    mission: IAutoPilotMission,
    res: Response,
  ): Promise<boolean> {
    // R1.3 — target metric present and numeric within the allowed range.
    const targetValue = mission.goal?.targetValue
    if (
      mission.goal?.metric == null ||
      typeof targetValue !== 'number' ||
      !Number.isFinite(targetValue) ||
      targetValue < 1 ||
      targetValue > 100_000_000
    ) {
      res.status(400).json({
        error: 'Cannot activate mission',
        message:
          'The mission goal is missing a valid target metric. Set a target value between 1 and 100,000,000 before activating.',
        field: 'goal.targetValue',
      })
      return false
    }

    // R1.4 — an optional target date, when set, must be a future date.
    if (mission.goal?.targetDate != null) {
      const targetDate =
        mission.goal.targetDate instanceof Date
          ? mission.goal.targetDate
          : new Date(mission.goal.targetDate as unknown as string)
      if (Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
        res.status(400).json({
          error: 'Cannot activate mission',
          message: 'The mission target date must be a future date.',
          field: 'goal.targetDate',
        })
        return false
      }
    }

    // Auto Pilot executes autonomously on Instagram and Facebook Pages. The
    // Mission model may represent other platforms for future extension, but
    // activating an unsupported one is declined: nothing is mutated (the mission
    // definition is retained) and the response surfaces the supported platforms.
    // Checked before the connected-account lookup so an unsupported mission gets
    // the platform message rather than a "no connected account" message.
    if (!isSupportedExecutionPlatform(mission.platform)) {
      res.status(400).json({
        error: 'Cannot activate mission',
        message:
          `Autonomous execution is available for Instagram and Facebook Pages. This mission ` +
          `targets "${mission.platform}", which Auto Pilot cannot run autonomously yet. The ` +
          `mission is kept and can be activated once its platform is supported.`,
        field: 'platform',
      })
      return false
    }

    // R1.6 — the workspace must have a connected account for the mission platform.
    const platformLabel = isInstagramPlatform(mission.platform) ? 'Instagram' : 'Facebook'
    const hasAccount = await this.accounts.hasConnectedAccount(
      String(mission.workspaceId),
      mission.platform || 'instagram',
    )
    if (!hasAccount) {
      res.status(400).json({
        error: 'Cannot activate mission',
        message:
          `This workspace has no connected ${platformLabel} account. Connect a ${platformLabel} ` +
          `account before activating the mission.`,
        field: 'account',
      })
      return false
    }

    return true
  }

  /**
   * POST /missions/:id/activate — transition a `draft`/`paused` mission to
   * `active` and register its repeatable Operating-Loop job (R3). Before the
   * transition it enforces the activation-time preconditions (Task 18.2): a valid
   * target metric (R1.3), a future target date if one is set (R1.4), and a
   * connected Instagram account for the workspace (R1.6). A mission already
   * `active`/`completed`/`failed` is rejected with 409.
   */
  async activateMission(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      if (mission.status !== 'draft' && mission.status !== 'paused') {
        res.status(409).json({
          error: 'Cannot activate mission',
          message: `Mission is ${mission.status}; only draft or paused missions can be activated.`,
          currentStatus: mission.status,
        })
        return
      }

      // Task 18.2: activation-time preconditions (R1.3, R1.4, R1.6). Reject with
      // a 4xx + a clear reason when the goal target metric is missing/invalid,
      // the target date is not in the future, or the mission's workspace has no
      // connected Instagram account. Nothing is mutated and the loop is not
      // scheduled when any precondition fails.
      if (!(await this.assertActivationPreconditions(mission, res))) {
        return
      }

      const updated = await this.missions.updateStatus(String(mission._id), 'active')
      const scheduled = await this.loop.scheduleMission({
        missionId: String(mission._id),
        workspaceId: String(mission.workspaceId),
      })

      // Kick one iteration immediately so Auto Pilot plans + drafts right away
      // instead of waiting for the first repeatable tick (≤60 min) — and so it
      // works even when the background worker/Redis isn't actively consuming.
      this.runImmediateIteration(String(mission._id), String(mission.workspaceId))

      res.status(200).json({
        success: true,
        mission: serializeMission(updated ?? mission),
        loopScheduled: scheduled,
      })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission activate failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to activate mission', message: error.message })
    }
  }

  /**
   * POST /missions/:id/pause — transition an `active` mission to `paused` and
   * remove its repeatable Operating-Loop job so no new autonomous iteration
   * starts within 60s (R3.5/R3.6).
   */
  async pauseMission(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      if (mission.status !== 'active') {
        res.status(409).json({
          error: 'Cannot pause mission',
          message: `Mission is ${mission.status}; only active missions can be paused.`,
          currentStatus: mission.status,
        })
        return
      }

      const removed = await this.loop.removeMission(String(mission._id))
      const updated = await this.missions.updateStatus(String(mission._id), 'paused')

      res.status(200).json({
        success: true,
        mission: serializeMission(updated ?? mission),
        loopRemoved: removed,
      })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission pause failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to pause mission', message: error.message })
    }
  }

  /**
   * POST /missions/:id/resume — transition a `paused` mission back to `active`
   * and re-register its repeatable Operating-Loop job (R3.5).
   */
  async resumeMission(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      if (mission.status !== 'paused') {
        res.status(409).json({
          error: 'Cannot resume mission',
          message: `Mission is ${mission.status}; only paused missions can be resumed.`,
          currentStatus: mission.status,
        })
        return
      }

      const updated = await this.missions.updateStatus(String(mission._id), 'active')
      const scheduled = await this.loop.scheduleMission({
        missionId: String(mission._id),
        workspaceId: String(mission.workspaceId),
      })

      // Resume runs an iteration immediately too (see activateMission).
      this.runImmediateIteration(String(mission._id), String(mission.workspaceId))

      res.status(200).json({
        success: true,
        mission: serializeMission(updated ?? mission),
        loopScheduled: scheduled,
      })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission resume failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to resume mission', message: error.message })
    }
  }

  /** GET /missions/:id/slots — upcoming Content_Plan slots, earliest first (R2.5). */
  async listSlots(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const slots = await this.slots.findUpcomingByMission(String(mission._id))

      // Resolve each slot's assigned media URL so the UI can show what Auto
      // Pilot scheduled (thumbnail + caption + hashtags), not just a status.
      const { mediaPoolRepository } = await import('../db/repositories')
      const idToUrl = new Map<string, string>()
      const poolIds = Array.from(
        new Set(
          slots
            .map((s) => s.source?.mediaPoolItemId)
            .filter((id): id is NonNullable<typeof id> => id != null)
            .map(String),
        ),
      )
      await Promise.all(
        poolIds.map(async (id) => {
          try {
            const item = await mediaPoolRepository.findById(id)
            if (item?.mediaUrl) idToUrl.set(id, item.mediaUrl)
          } catch {
            /* best-effort — a slot without a resolvable URL just shows no thumb */
          }
        }),
      )
      const serialized = slots.map((s) => {
        const id = s.source?.mediaPoolItemId != null ? String(s.source.mediaPoolItemId) : null
        const url = id ? idToUrl.get(id) : undefined
        return serializeSlot(s, url ? [url] : [])
      })
      res.status(200).json({ success: true, slots: serialized })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission slots failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to list slots', message: error.message })
    }
  }

  /**
   * GET /missions/:id/automations — the mission's Auto Pilot engagement
   * automations (comment / DM / comment-to-DM), so the user can see what was
   * created autonomously: the trigger keyword, the public reply, and the DM.
   */
  async listAutomations(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const { automationRuleRepository } = await import('../../../repositories/AutomationRepository')
      const rules = await automationRuleRepository.findByMissionId(String(mission._id))
      res.status(200).json({ success: true, automations: rules.map(serializeAutomation) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission automations failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to list automations', message: error.message })
    }
  }

  /**
   * GET /missions/:id/approvals — the mission's pending Approval_Cards: the
   * count and contents of every approval still awaiting a human decision. This
   * powers the Mission_Control pending-approvals widget (R16.4). The count is
   * derived from the returned list so the client renders a single source of
   * truth.
   */
  async listApprovals(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const pending = await this.approvals.findPendingByMission(String(mission._id))
      const approvals = pending.map(serializeApproval)
      res.status(200).json({ success: true, count: approvals.length, approvals })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission approvals failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to list approvals', message: error.message })
    }
  }

  /**
   * GET /missions/:id/activity — the Operating-Loop activity log: this mission's
   * Audit_Records newest-first, capped at `limit` (default 50, max 200) (R16.4,
   * R17).
   */
  async listActivity(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const query = ActivityQuery.safeParse(req.query ?? {})
      if (!query.success) {
        res.status(400).json({ error: 'Validation failed', details: query.error.flatten() })
        return
      }

      const rawLimit = Number(query.data.limit ?? DEFAULT_ACTIVITY_LIMIT)
      const limit = Number.isFinite(rawLimit)
        ? Math.min(MAX_ACTIVITY_LIMIT, Math.max(1, Math.floor(rawLimit)))
        : DEFAULT_ACTIVITY_LIMIT

      const records = await this.auditLog.listByMission(String(mission._id), limit)
      res.status(200).json({ success: true, activity: records.map(serializeAuditRecord) })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission activity failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to load activity log', message: error.message })
    }
  }

  /**
   * POST /missions/:id/budget — raise the Credit_Budget / approve continued spend
   * (R14.5). The new budget must be a genuine raise (greater than the current
   * ceiling) so this endpoint cannot silently tighten the budget below already
   * consumed spend; lowering is out of scope. Applies to subsequent actions.
   */
  async raiseBudget(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const mission = await this.resolveOwnedMission(req, res, userId)
      if (!mission) return

      const body = BudgetBody.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: 'Validation failed', details: body.error.flatten() })
        return
      }

      const current = mission.guardrails?.creditBudget ?? 0
      if (body.data.creditBudget <= current) {
        res.status(400).json({
          error: 'Invalid budget',
          message: `New budget (${body.data.creditBudget}) must be greater than the current budget (${current}).`,
        })
        return
      }

      const updated = await this.missions.updateById(String(mission._id), {
        guardrails: { ...mission.guardrails, creditBudget: body.data.creditBudget },
      } as never)

      res.status(200).json({
        success: true,
        mission: serializeMission(updated ?? mission),
      })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot mission budget raise failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to raise budget', message: error.message })
    }
  }

  /**
   * POST /actions/:auditId/undo — reverse a previously audited reversible action
   * (R13.6, R17.2). Ownership is enforced through the audit record's mission
   * workspace. The outcome is mapped to a status: reversed → 200; a not-reversible
   * / already-reversed action → 409 (declined); a missing record → 404; a
   * reversal that was attempted but failed → 422 (state preserved).
   */
  async undoAction(req: Request, res: Response): Promise<void> {
    const userId = this.resolveUserId(req, res)
    if (!userId) return

    try {
      const parsed = AuditIdParam.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
        return
      }

      const record = await this.auditLog.findById(parsed.data.auditId)
      if (!record) {
        res.status(404).json({ error: 'Action not found' })
        return
      }

      // Ownership is enforced through the record's mission workspace.
      const mission = await this.missions.findById(String(record.missionId))
      if (!mission) {
        res.status(404).json({ error: 'Mission not found' })
        return
      }
      if (!(await this.assertWorkspaceOwnership(userId, mission.workspaceId, res))) {
        return
      }

      const result = await this.audit.reverse(parsed.data.auditId, { userId })

      if (result.reversed) {
        res.status(200).json({ success: true, result })
        return
      }
      if (result.declined) {
        // Not-reversible / already-reversed — nothing was changed.
        res.status(409).json({ success: false, result })
        return
      }
      if (result.reason === 'not-found') {
        res.status(404).json({ success: false, result })
        return
      }
      // Reversal attempted but could not be completed; state preserved (R17.4).
      res.status(422).json({ success: false, result })
    } catch (err) {
      const error = err as Error
      logger.error('Auto Pilot action undo failed', error, { component: COMPONENT, userId })
      res.status(500).json({ error: 'Failed to undo action', message: error.message })
    }
  }
}

/** Shared default instance wired to the real singletons. */
export const autoPilotController = new AutoPilotController()
