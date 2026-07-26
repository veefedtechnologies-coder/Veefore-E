/**
 * Auto Pilot — ApprovalLifecycleService (GATE stage · approval lifecycle).
 *
 * GATE emits an Approval_Card (a pending {@link IApproval}) whenever a human
 * decision is required — every item in Copilot (R4.1) and any guardrail-failing
 * or human-approval-required item in Autopilot (R5.2). This service resolves
 * that card, driving it to a terminal state so the ACT stage (Task 14) knows
 * exactly what it may execute:
 *
 *   • **approve** (R4.6) — the user accepts the proposal as-is. The approval is
 *     marked `approved`, which makes its item **executable**: the ACT stage may
 *     publish the post / the automation lifecycle may activate the rule.
 *
 *   • **edit** (R4.3/R4.4) — the user changes the proposed content. The edited
 *     content is **re-validated against the Mission's Guardrails** before it is
 *     accepted:
 *       – clean edits are applied (`edited`) and the item becomes executable
 *         with the user's edits (R4.3);
 *       – edits that introduce a banned topic or exceed a Guardrail bound are
 *         **rejected**: the approval is left `pending` in its pre-edit state, no
 *         edited payload is stored, and the violated Guardrail is returned so the
 *         caller can tell the user (R4.4). An edit that violates Guardrails never
 *         ships (Property 3 / the "edits never ship" half of Property 5).
 *
 *   • **reject** (R4.5 / R5.3 / R11.7) — the user discards the proposal. The
 *     approval is marked `rejected` (never executable) and the outcome is audited
 *     (R5.3 in Autopilot, R11.7 for a drafted automation in Copilot). When the
 *     rejected item is a Content_Slot, the slot is resolved (rescheduled /
 *     regenerated) so **no scheduled slot publishes empty** (R4.5, Property 1).
 *
 *   • **expiry at publish time** (R4.7 / R5.3) — a card left un-actioned until
 *     its Content_Slot's publish time is marked `expired` (never executable), the
 *     slot's fallback resolution is applied so it does not publish empty, and a
 *     User_Input_Notification identifying the un-actioned card is delivered.
 *
 * ── Property 5 & 6 (the executability invariant) ─────────────────────────────
 * The single source of truth for "may this item act?" is {@link isExecutable}:
 * an approval is executable **iff** its status is `approved` or `edited`. A
 * `pending`, `rejected`, or `expired` approval is never executable. Because in
 * Copilot GATE cards *every* item (R4.1), and in either mode a human-approval-
 * required action is only ever routed through an approval, this invariant is
 * exactly:
 *   • **Property 5** — while `operatingMode = copilot`, nothing is published or
 *     activated without an approved (or clean-edited) card; and
 *   • **Property 6** — an `approvalRequiredActions` action is never executed
 *     without approval, in either mode.
 * The re-validation guard above additionally guarantees an edit that violates a
 * Guardrail never reaches an executable state.
 *
 * Every transport (approval store, mission lookup, guardrail gate, slot fallback
 * resolver, audit, notification) is injected as a port with the real singletons
 * as defaults, so the whole lifecycle is unit- and property-testable without a
 * database or any notification transport.
 *
 * Satisfies Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 11.7 (Property 5, 6)
 */

import { logger } from '../../../config/logger'
import type {
  ApprovalStatus,
  FallbackResolution,
  IApproval,
  OperatingMode,
} from '../db/models'
import {
  approvalRepository,
  type ApprovalRepository,
} from '../db/repositories/ApprovalRepository'
import {
  contentSlotRepository,
  type ContentSlotRepository,
} from '../db/repositories/ContentSlotRepository'
import {
  missionRepository,
  type MissionRepository,
} from '../db/repositories/MissionRepository'
import {
  GuardrailService,
  guardrailService,
  type GuardrailAction,
  type GuardrailMissionInput,
  type GuardrailViolation,
} from './GuardrailService'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from './AutoPilotAuditService'
import {
  NotificationDispatcher,
  notificationDispatcher,
  type SessionContext,
} from './NotificationDispatcher'
import { DEFAULT_RESCHEDULE_STEP_MS } from './BriefResolutionService'

const COMPONENT = 'autopilot.ApprovalLifecycleService'

/**
 * The single executability rule underpinning Property 5 & 6: an approval's item
 * may be executed by ACT (published / activated) **iff** the user approved it or
 * supplied a clean edit. Anything still awaiting a decision (`pending`), or
 * discarded (`rejected`) / lapsed (`expired`), is never executable.
 */
export function isExecutable(status: ApprovalStatus): boolean {
  return status === 'approved' || status === 'edited'
}

/** The minimal Mission view the lifecycle needs to re-validate + notify. */
export interface ApprovalMissionView {
  _id: unknown
  workspaceId: unknown
  operatingMode: OperatingMode
  brandVoice?: string
  guardrails: GuardrailMissionInput['guardrails']
}

/** Read port for the Mission carrying the guardrails an edit is re-validated against. */
export interface ApprovalMissionLookup {
  findById(missionId: string): Promise<ApprovalMissionView | null>
}

/**
 * Read/update port for the Approval. Defaults wrap {@link ApprovalRepository};
 * tests inject an in-memory implementation.
 */
export interface ApprovalLifecycleStore {
  /** Load one approval by id, or `null` when it no longer exists. */
  load(approvalId: string): Promise<IApproval | null>
  /** Stamp a decision (`decidedAt`), optionally persisting the edited payload. */
  decide(
    approvalId: string,
    status: ApprovalStatus,
    editedPayload?: Record<string, unknown>,
  ): Promise<IApproval | null>
  /** Mark a pending approval `expired` (the publish-time fallback path, R4.7). */
  markExpired(approvalId: string): Promise<IApproval | null>
  /** Pending approvals whose publish-time expiry has passed (expiry sweep). */
  findExpired(now: Date): Promise<IApproval[]>
}

/**
 * Ensures a Content_Slot will not publish empty after its card is rejected
 * (R4.5) or expires (R4.7). `resolve` reschedules or regenerates the slot and
 * returns the resolution applied. Injected so the lifecycle stays testable and
 * so the concrete slot behaviour lives with the slot repository.
 */
export interface SlotFallbackResolver {
  resolve(slotId: string, reason: 'rejected' | 'expired'): Promise<FallbackResolution>
}

/** Where to deliver the expiry User_Input_Notification, and how to route it (R4.7/R15). */
export interface ApprovalNotifyContext {
  /** The user to notify that a card lapsed / was resolved. */
  userId?: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token, when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** Facts used to re-validate an edited item against the Guardrails (R4.3/R4.4). */
export interface EditRevalidation {
  /** Candidate scheduled/publish time, for the frequency-cap re-check. */
  at?: Date | number
  /** The mission's already scheduled/published action times (frequency-cap). */
  existingActionTimes?: Array<Date | number>
  /** Consumed + projected credits, for the Credit_Budget re-check. */
  credits?: { consumed: number; estimatedCost: number }
  /** Upstream brand-voice assessment for the edited content, when available. */
  brandVoiceViolation?: string | null
  /** Guardrail action type; defaults to the approval's `itemType`. */
  type?: string
}

/** Per-call options carrying the notify target and injectable clock. */
export interface ApprovalActionOptions {
  /** Notification target for expiry/decision notifications; omit to skip. */
  notify?: ApprovalNotifyContext
  /** Injectable "now" for deterministic tests. Defaults to `Date.now()`. */
  now?: number
}

/** The outcome of an {@link ApprovalLifecycleService.approve} call (R4.6). */
export type ApproveResult =
  | { status: 'approved'; approval: IApproval; executable: true }
  | { status: 'already-decided'; currentStatus: ApprovalStatus }
  | { status: 'not-found' }

/** The outcome of an {@link ApprovalLifecycleService.edit} call (R4.3/R4.4). */
export type EditResult =
  /** Clean edit applied; the item is executable with the user's edits (R4.3). */
  | { status: 'edited'; approval: IApproval; executable: true }
  /** Edit violated a Guardrail; approval left pending, pre-edit state kept (R4.4). */
  | { status: 'edit-rejected'; violations: GuardrailViolation[]; message: string }
  | { status: 'already-decided'; currentStatus: ApprovalStatus }
  | { status: 'not-found' }

/** The outcome of an {@link ApprovalLifecycleService.reject} call (R4.5/R5.3/R11.7). */
export type RejectResult =
  | { status: 'rejected'; approval: IApproval; slotResolution?: FallbackResolution }
  | { status: 'already-decided'; currentStatus: ApprovalStatus }
  | { status: 'not-found' }

/** The outcome of an {@link ApprovalLifecycleService.resolveExpired} call (R4.7). */
export type ExpireResult =
  | {
      status: 'expired'
      approval: IApproval
      slotResolution?: FallbackResolution
      notified: boolean
    }
  /** The approval has not yet reached its publish-time expiry. */
  | { status: 'not-expired' }
  /** The approval was already decided/expired; nothing to do. */
  | { status: 'already-resolved'; currentStatus: ApprovalStatus }
  | { status: 'not-found' }

/** Tunable dependencies for the approval lifecycle. */
export interface ApprovalLifecycleServiceOptions {
  approvalStore?: ApprovalLifecycleStore
  missionLookup?: ApprovalMissionLookup
  guardrailService?: Pick<GuardrailService, 'check'>
  slotFallbackResolver?: SlotFallbackResolver
  auditService?: Pick<AutoPilotAuditService, 'record'>
  dispatcher?: Pick<NotificationDispatcher, 'dispatch'>
}

/** The default approval store backed by {@link ApprovalRepository}. */
function makeDefaultApprovalStore(repo: ApprovalRepository): ApprovalLifecycleStore {
  return {
    load: (approvalId) => repo.findById(approvalId),
    decide: (approvalId, status, editedPayload) => repo.decide(approvalId, status, editedPayload),
    markExpired: (approvalId) => repo.markExpired(approvalId),
    findExpired: (now) => repo.findExpired(now),
  }
}

/** The default mission lookup backed by {@link MissionRepository}. */
function makeDefaultMissionLookup(repo: MissionRepository): ApprovalMissionLookup {
  return {
    async findById(missionId) {
      const mission = await repo.findById(missionId)
      if (!mission) return null
      return {
        _id: mission._id,
        workspaceId: mission.workspaceId,
        operatingMode: mission.operatingMode,
        brandVoice: mission.brandVoice,
        guardrails: mission.guardrails as unknown as GuardrailMissionInput['guardrails'],
      }
    },
  }
}

/**
 * The default slot fallback resolver backed by {@link ContentSlotRepository}:
 * it reschedules the slot forward by {@link DEFAULT_RESCHEDULE_STEP_MS} so a
 * fresh planning iteration can refill it, guaranteeing the slot never publishes
 * empty (R4.5/R4.7). A missing slot degrades to `'rescheduled'` without error.
 */
function makeDefaultSlotFallbackResolver(repo: ContentSlotRepository): SlotFallbackResolver {
  return {
    async resolve(slotId) {
      const slot = await repo.findById(slotId)
      if (!slot) return 'rescheduled'
      const base = Math.max(slot.scheduledAt.getTime(), Date.now())
      const newScheduledAt = new Date(base + DEFAULT_RESCHEDULE_STEP_MS)
      await repo.updateById(slotId, {
        scheduledAt: newScheduledAt,
        status: 'rescheduled',
        fallbackResolution: 'rescheduled',
      } as never)
      return 'rescheduled'
    },
  }
}

/** Extract the text content of an edited payload for banned-topic re-validation. */
function extractEditedContent(payload: Record<string, unknown>): string | undefined {
  const candidate = payload.content ?? payload.caption ?? payload.text
  return typeof candidate === 'string' ? candidate : undefined
}

/**
 * Resolves Approval_Cards through their lifecycle — approve / edit (re-validated)
 * / reject (slot-safe) / expiry-at-publish-time — enforcing the executability
 * invariant behind Property 5 & 6.
 */
export class ApprovalLifecycleService {
  private readonly approvalStore: ApprovalLifecycleStore
  private readonly missionLookup: ApprovalMissionLookup
  private readonly guardrail: Pick<GuardrailService, 'check'>
  private readonly slotFallbackResolver: SlotFallbackResolver
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>
  private readonly dispatcher: Pick<NotificationDispatcher, 'dispatch'>

  constructor(options: ApprovalLifecycleServiceOptions = {}) {
    this.approvalStore = options.approvalStore ?? makeDefaultApprovalStore(approvalRepository)
    this.missionLookup = options.missionLookup ?? makeDefaultMissionLookup(missionRepository)
    this.guardrail = options.guardrailService ?? guardrailService
    this.slotFallbackResolver =
      options.slotFallbackResolver ?? makeDefaultSlotFallbackResolver(contentSlotRepository)
    this.auditService = options.auditService ?? autoPilotAuditService
    this.dispatcher = options.dispatcher ?? notificationDispatcher
  }

  /**
   * R4.6: approve a pending Approval_Card. Marks the approval `approved`, which
   * makes its item executable ({@link isExecutable}) so the ACT stage may
   * proceed within the Guardrails. A non-pending approval is reported as
   * `already-decided` so a duplicate approve is a no-op.
   */
  async approve(approvalId: string, options: ApprovalActionOptions = {}): Promise<ApproveResult> {
    const approval = await this.approvalStore.load(approvalId)
    if (!approval) return { status: 'not-found' }
    if (approval.status !== 'pending') {
      return { status: 'already-decided', currentStatus: approval.status }
    }

    const decided = await this.approvalStore.decide(approvalId, 'approved')
    const finalApproval = decided ?? approval

    await this.audit(approval, 'approval.approved', 'success', {
      reversible: true,
      preExecutionState: { status: 'pending' },
      reversalOp: { type: 'revert-approval', approvalId, to: 'pending' },
    })

    logger.info('approval approved — item eligible for execution', {
      component: COMPONENT,
      approvalId,
      itemType: approval.itemType,
    })

    return { status: 'approved', approval: finalApproval, executable: true }
  }

  /**
   * R4.3/R4.4: edit a pending Approval_Card, re-validating the edited content
   * against the Mission's Guardrails before accepting it.
   *
   *   - Clean edit → applied (`edited`); the item is executable with the user's
   *     edits (R4.3).
   *   - Edit that introduces a banned topic or exceeds a Guardrail bound → the
   *     edit is rejected, the approval is left `pending` in its pre-edit state
   *     (no edited payload stored), and the violated Guardrail(s) are returned so
   *     the caller can identify them to the user (R4.4).
   *
   * A non-pending approval is reported as `already-decided`. When the Mission
   * cannot be loaded the edit is conservatively rejected (state is preserved).
   */
  async edit(
    approvalId: string,
    editedPayload: Record<string, unknown>,
    revalidation: EditRevalidation = {},
  ): Promise<EditResult> {
    const approval = await this.approvalStore.load(approvalId)
    if (!approval) return { status: 'not-found' }
    if (approval.status !== 'pending') {
      return { status: 'already-decided', currentStatus: approval.status }
    }

    const mission = await this.missionLookup.findById(String(approval.missionId))
    if (!mission) {
      // No guardrails to validate against → refuse the edit, preserve state (R4.4).
      logger.warn('approval edit refused — mission not found; state preserved', {
        component: COMPONENT,
        approvalId,
        missionId: String(approval.missionId),
      })
      return {
        status: 'edit-rejected',
        violations: [],
        message: 'The edit could not be validated because the mission was not found.',
      }
    }

    // R4.3/R4.4: re-validate the edited content against the guardrails. The user
    // is actively approving-with-edits, so `approved` is set — the re-check is
    // for banned topics, brand voice, frequency cap, and credit budget, not the
    // approval-required designation.
    const action: GuardrailAction = {
      type: revalidation.type ?? approval.itemType,
      approved: true,
      content: extractEditedContent(editedPayload) ?? null,
      at: revalidation.at,
      existingActionTimes: revalidation.existingActionTimes,
      credits: revalidation.credits,
      brandVoiceViolation: revalidation.brandVoiceViolation,
    }
    const guardrail = this.guardrail.check(
      { brandVoice: mission.brandVoice, guardrails: mission.guardrails },
      action,
    )

    if (!guardrail.ok) {
      // R4.4: reject the edits, withhold execution, retain the pre-edit state.
      await this.audit(approval, 'approval.edit-rejected', 'blocked', {
        triggeringContext: {
          approvalId,
          itemType: approval.itemType,
          violations: guardrail.violations,
        },
      })
      logger.info('approval edit rejected — edit violates guardrails; state preserved', {
        component: COMPONENT,
        approvalId,
        violations: guardrail.violations.map((v) => v.kind),
      })
      return {
        status: 'edit-rejected',
        violations: guardrail.violations,
        message: this.describeViolations(guardrail.violations),
      }
    }

    // R4.3: clean edit → apply it; the item becomes executable with the edits.
    const decided = await this.approvalStore.decide(approvalId, 'edited', editedPayload)
    const finalApproval = decided ?? approval

    await this.audit(approval, 'approval.edited', 'success', {
      reversible: true,
      preExecutionState: { status: 'pending' },
      reversalOp: { type: 'revert-approval', approvalId, to: 'pending' },
      triggeringContext: { approvalId, itemType: approval.itemType },
    })

    logger.info('approval edited — clean edit applied; item eligible for execution', {
      component: COMPONENT,
      approvalId,
      itemType: approval.itemType,
    })

    return { status: 'edited', approval: finalApproval, executable: true }
  }

  /**
   * R4.5 / R5.3 / R11.7: reject a pending Approval_Card. Marks the approval
   * `rejected` (never executable) and records the outcome in an Audit_Record
   * (R5.3 for an Autopilot approval-required action; R11.7 for a drafted
   * automation in Copilot). When the rejected item is a Content_Slot, the slot
   * is resolved (rescheduled/regenerated) so no scheduled slot publishes empty
   * (R4.5).
   */
  async reject(approvalId: string): Promise<RejectResult> {
    const approval = await this.approvalStore.load(approvalId)
    if (!approval) return { status: 'not-found' }
    if (approval.status !== 'pending') {
      return { status: 'already-decided', currentStatus: approval.status }
    }

    const decided = await this.approvalStore.decide(approvalId, 'rejected')
    const finalApproval = decided ?? approval

    // R4.5: a rejected Content_Slot is resolved so it never publishes empty.
    let slotResolution: FallbackResolution | undefined
    if (approval.itemType === 'content-slot') {
      try {
        slotResolution = await this.slotFallbackResolver.resolve(String(approval.itemRef), 'rejected')
      } catch (error) {
        logger.error('approval reject: slot fallback resolution failed', error, {
          component: COMPONENT,
          approvalId,
          slotId: String(approval.itemRef),
        })
      }
    }

    // R5.3 / R11.7: record the rejection outcome in an Audit_Record.
    await this.audit(approval, 'approval.rejected', 'success', {
      triggeringContext: {
        approvalId,
        itemType: approval.itemType,
        itemRef: String(approval.itemRef),
        slotResolution,
      },
    })

    logger.info('approval rejected — item discarded', {
      component: COMPONENT,
      approvalId,
      itemType: approval.itemType,
      slotResolution,
    })

    return { status: 'rejected', approval: finalApproval, slotResolution }
  }

  /**
   * R4.7 / R5.3: resolve a card that reached its Content_Slot's publish time
   * without being approved, edited, or rejected. Marks the approval `expired`
   * (never executable), applies the slot's fallback resolution so it does not
   * publish empty, and delivers a User_Input_Notification identifying the
   * un-actioned card (when a notify target is supplied).
   *
   * Idempotent: an approval already decided/expired is reported as
   * `already-resolved`. An approval whose `expiresAt` has not yet passed is
   * reported as `not-expired` and left untouched.
   */
  async resolveExpired(approvalId: string, options: ApprovalActionOptions = {}): Promise<ExpireResult> {
    const now = options.now ?? Date.now()

    const approval = await this.approvalStore.load(approvalId)
    if (!approval) return { status: 'not-found' }
    if (approval.status !== 'pending') {
      return { status: 'already-resolved', currentStatus: approval.status }
    }
    // Only expire once the publish time has actually been reached (R4.7).
    if (approval.expiresAt && approval.expiresAt.getTime() > now) {
      return { status: 'not-expired' }
    }

    const expired = await this.approvalStore.markExpired(approvalId)
    const finalApproval = expired ?? approval

    // R4.7: apply the slot's fallback resolution so it does not publish empty.
    let slotResolution: FallbackResolution | undefined
    if (approval.itemType === 'content-slot') {
      try {
        slotResolution = await this.slotFallbackResolver.resolve(String(approval.itemRef), 'expired')
      } catch (error) {
        logger.error('approval expiry: slot fallback resolution failed', error, {
          component: COMPONENT,
          approvalId,
          slotId: String(approval.itemRef),
        })
      }
    }

    await this.audit(approval, 'approval.expired', 'deferred', {
      triggeringContext: {
        approvalId,
        itemType: approval.itemType,
        itemRef: String(approval.itemRef),
        slotResolution,
      },
    })

    // R4.7: deliver a User_Input_Notification identifying the un-actioned card.
    const notified = await this.notifyExpiry(approval, options.notify)

    logger.info('approval expired at publish time — fallback applied', {
      component: COMPONENT,
      approvalId,
      itemType: approval.itemType,
      slotResolution,
      notified,
    })

    return { status: 'expired', approval: finalApproval, slotResolution, notified }
  }

  /**
   * Expiry sweep (R4.7): resolve every pending approval whose publish-time expiry
   * has passed. Each is driven through {@link resolveExpired}; a per-approval
   * failure is logged and never aborts the sweep. Returns the count resolved.
   */
  async sweepExpired(options: ApprovalActionOptions = {}): Promise<{ resolved: number }> {
    const now = options.now ?? Date.now()
    const expired = await this.approvalStore.findExpired(new Date(now))
    let resolved = 0
    for (const approval of expired) {
      try {
        const result = await this.resolveExpired(String(approval._id), options)
        if (result.status === 'expired') resolved++
      } catch (error) {
        logger.error('approval expiry sweep: failed to resolve approval', error, {
          component: COMPONENT,
          approvalId: String(approval._id),
        })
      }
    }
    return { resolved }
  }

  /**
   * Deliver the expiry User_Input_Notification (R4.7). Best-effort: skipped when
   * no `userId` is supplied, and any dispatch error is caught so a resolved
   * expiry is never reported as a failure.
   */
  private async notifyExpiry(
    approval: IApproval,
    notify?: ApprovalNotifyContext,
  ): Promise<boolean> {
    if (!notify?.userId) return false
    try {
      const result = await this.dispatcher.dispatch({
        userId: notify.userId,
        workspaceId: String(approval.workspaceId),
        title: 'Auto Pilot approval expired',
        message:
          `A ${approval.itemType} awaiting your approval reached its publish time ` +
          `without a decision, so Auto Pilot applied its fallback.`,
        type: 'alert',
        sessionContext: notify.sessionContext,
        deviceToken: notify.deviceToken,
        email: notify.email,
      })
      return !result.undelivered
    } catch (error) {
      logger.warn('approval expiry notification dispatch failed', {
        component: COMPONENT,
        approvalId: String(approval._id),
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /** Record a lifecycle transition in an Audit_Record (best-effort; never throws). */
  private async audit(
    approval: IApproval,
    action: string,
    outcome: 'success' | 'blocked' | 'deferred',
    extra: {
      reversible?: boolean
      preExecutionState?: Record<string, unknown>
      reversalOp?: Record<string, unknown>
      triggeringContext?: Record<string, unknown>
    } = {},
  ): Promise<void> {
    try {
      await this.auditService.record({
        missionId: approval.missionId,
        workspaceId: approval.workspaceId,
        stage: 'GATE',
        action,
        outcome,
        reversible: extra.reversible ?? false,
        triggeringContext:
          extra.triggeringContext ??
          { approvalId: String(approval._id), itemType: approval.itemType },
        ...(extra.preExecutionState ? { preExecutionState: extra.preExecutionState } : {}),
        ...(extra.reversalOp ? { reversalOp: extra.reversalOp } : {}),
      })
    } catch (error) {
      logger.warn('approval lifecycle audit write failed', {
        component: COMPONENT,
        approvalId: String(approval._id),
        action,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Build a concise message identifying the violated Guardrail(s) for R4.4. */
  private describeViolations(violations: GuardrailViolation[]): string {
    if (violations.length === 0) {
      return 'The edit violates the mission guardrails and was not applied.'
    }
    const details = violations.map((v) => v.detail).join(' ')
    return `The edit was rejected because it violates the mission guardrails: ${details}`
  }
}

/** Shared default instance wired to the real repositories + shared services. */
export const approvalLifecycleService = new ApprovalLifecycleService()
