/**
 * Auto Pilot — GateService (GATE stage of the Operating Loop).
 *
 * GATE is the approval-routing stage. After PLAN/ACT-prep have produced the
 * concrete items for an iteration (a Content_Slot, its caption, a drafted
 * Engagement_Automation, a plan, or a budget), GATE decides — **per item** —
 * whether Auto Pilot may act on its own or must first ask the user, and emits an
 * Approval_Card when a human decision is required (design "Stage responsibilities"
 * · R4, R5).
 *
 * The routing rule is driven entirely by the Mission's Operating_Mode and the
 * single guardrail gate:
 *
 *   • **Copilot** (R4.1) — the hands-on mode. *Every* slot, caption, and
 *     automation is presented as an Approval_Card before any execution; nothing
 *     is auto-executed. Auto Pilot never publishes a post or activates an
 *     automation until the corresponding card is approved (R4.2).
 *
 *   • **Autopilot** (R5.1/R5.2) — the autonomous mode. An item is auto-executed
 *     **only when {@link GuardrailService.check} passes**. Because `check`
 *     evaluates brand voice, banned topics, the posting-frequency cap, the
 *     Credit_Budget, *and* the human-approval-required designation immediately
 *     before execution (R5.1), a passing check already means "guardrails pass
 *     AND not approval-required". When the check fails for any reason — a
 *     guardrail violation or an approval-required action awaiting the user
 *     (R5.2) — GATE emits an Approval_Card instead of executing, preserving the
 *     item's planned state and scheduled time while it awaits a decision.
 *
 * ── Emitting an Approval_Card ────────────────────────────────────────────────
 * Emitting a card is two coordinated side effects, both behind injected ports so
 * the routing logic is fully unit-testable without a database or a notification
 * transport:
 *
 *   1. Persist an {@link IApproval} (status `pending`) via the
 *      {@link ApprovalRepository}, referencing the item and — for slots — its
 *      publish-time expiry (R4.7). This is the record backing the card in the
 *      VeeGPT chat + Mission_Control (design "Data Models").
 *
 *   2. Deliver a User_Input_Notification through the {@link NotificationDispatcher}
 *      so the user is told a decision is needed (R4, R15). Delivery is
 *      best-effort: a dispatch failure never blocks routing, and a failure to
 *      persist the approval leaves the item routed as `approval-required` with a
 *      `null` approval so the caller can retry/escalate.
 *
 * GATE itself performs no execution — it returns the routing decision and the
 * set of auto-executable items for the ACT stage (Task 14) to carry out, and the
 * emitted approvals for the approval lifecycle (Task 13.2) to resolve.
 *
 * Satisfies Requirements: 4.1, 4.2, 5.1, 5.2
 */

import { logger } from '../../../../config/logger'
import type {
  ApprovalItemType,
  IApproval,
  OperatingMode,
} from '../../db/models'
import { ApprovalRepository, approvalRepository } from '../../db/repositories'
import {
  GuardrailService,
  guardrailService,
  type GuardrailAction,
  type GuardrailCheck,
  type GuardrailMissionInput,
} from '../GuardrailService'
import {
  NotificationDispatcher,
  notificationDispatcher,
  type SessionContext,
} from '../NotificationDispatcher'

const COMPONENT = 'autopilot.GateService'

/** The routing decision GATE makes for a single item. */
export type GateDecision =
  /** Autopilot + guardrails passed: the ACT stage may execute the item (R5.1). */
  | 'auto-execute'
  /** An Approval_Card was emitted; execution waits for the user (R4.1/R5.2). */
  | 'approval-required'

/**
 * The minimal shape of a Mission GATE needs. Accepting a structural type rather
 * than the Mongoose document keeps the routing logic decoupled and testable with
 * plain objects.
 */
export interface GateMissionInput {
  /** Mission id — scopes the approvals created. */
  _id: unknown
  /** Workspace the mission is bound to; scopes the approvals + notifications. */
  workspaceId: unknown
  /** Copilot (approve-everything) vs Autopilot (execute-within-guardrails). */
  operatingMode: OperatingMode
  /** The guardrails enforced by {@link GuardrailService.check} (R5.1). */
  guardrails: GuardrailMissionInput['guardrails']
  /** Brand-voice description, forwarded to the guardrail check for annotation. */
  brandVoice?: string
}

/**
 * One item GATE routes: a Content_Slot, caption, automation, plan, or budget.
 * The `action` carries the already-gathered facts {@link GuardrailService.check}
 * needs (type, content, candidate time + existing times, credits, approval flag,
 * brand-voice assessment) — GATE does no I/O to build them.
 */
export interface GateableItem {
  /** What the approval refers to (`content-slot` | `caption` | `automation` | …). */
  itemType: ApprovalItemType
  /** The id of the referenced item (slot / rule / plan / budget). */
  itemRef: string
  /** The gathered facts the guardrail gate evaluates for this item (R5.1). */
  action: GuardrailAction
  /**
   * When the item is a Content_Slot, its scheduled publish time — the approval's
   * expiry, so an un-actioned card falls back at publish time (R4.7).
   */
  expiresAt?: Date
  /** The ChatMessage carrying the card, when already created (R16.2). */
  chatMessageId?: number
  /** Optional card title for the User_Input_Notification. */
  title?: string
  /** Optional card message for the User_Input_Notification. */
  message?: string
}

/** The routing outcome for one item. */
export interface GateRoutedItem {
  /** The item that was routed. */
  item: GateableItem
  /** Whether the item may be auto-executed or awaits approval. */
  decision: GateDecision
  /** The guardrail evaluation used to make the decision. */
  guardrail: GuardrailCheck
  /**
   * The persisted Approval backing the emitted card, when `decision` is
   * `approval-required`. `null` when auto-executed, or when the approval could
   * not be persisted (the caller may retry/escalate).
   */
  approval: IApproval | null
  /** Human-readable rationale for the decision (narration / audit). */
  reason: string
}

/** The result of routing a batch of items through GATE. */
export interface RouteResult {
  /** Per-item routing decisions, in the order the items were supplied. */
  routed: GateRoutedItem[]
  /** The items the ACT stage may execute (Autopilot + guardrails passed). */
  autoExecute: GateableItem[]
  /** The approvals emitted this run (pending user decisions). */
  approvals: IApproval[]
}

/**
 * Where to deliver the User_Input_Notification for an emitted card, and how to
 * route it (mobile FCM / in-app / email per Requirement 15). Notifications are
 * only dispatched when a `userId` is supplied.
 */
export interface GateNotifyContext {
  /** The user to notify that an approval is needed. */
  userId?: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token, when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** Per-call options for {@link GateService.route}. */
export interface RouteOptions {
  /** Notification target for emitted cards; omit to skip notifications. */
  notify?: GateNotifyContext
}

/**
 * Write port for persisting an Approval. `ApprovalRepository` satisfies it; a
 * fake lets the routing logic be verified without a database.
 */
export interface GateApprovalStore {
  create(doc: Partial<IApproval>): Promise<IApproval>
}

/** The dispatcher shape GATE needs to deliver a card notification. */
export type GateNotificationDispatcher = Pick<NotificationDispatcher, 'dispatch'>

/** Tunable dependencies for the GATE stage. */
export interface GateServiceOptions {
  /** Guardrail gate (defaults to the shared `guardrailService`). */
  guardrailService?: Pick<GuardrailService, 'check'>
  /** Approval persistence (defaults to the shared `approvalRepository`). */
  approvalStore?: GateApprovalStore
  /** Notification transport (defaults to the shared `notificationDispatcher`). */
  dispatcher?: GateNotificationDispatcher
}

/**
 * GATE stage — routes planned items to auto-execution or an Approval_Card per the
 * Mission's Operating_Mode and the guardrail gate (R4.1, R4.2, R5.1, R5.2).
 */
export class GateService {
  private readonly guardrail: Pick<GuardrailService, 'check'>
  private readonly approvalStore: GateApprovalStore
  private readonly dispatcher: GateNotificationDispatcher

  constructor(options: GateServiceOptions = {}) {
    this.guardrail = options.guardrailService ?? guardrailService
    this.approvalStore =
      options.approvalStore ?? (approvalRepository as unknown as GateApprovalStore)
    this.dispatcher = options.dispatcher ?? notificationDispatcher
  }

  /**
   * Route a batch of planned items through GATE (R4.1, R4.2, R5.1, R5.2).
   *
   * For each item:
   *   - **Copilot** — always emit an Approval_Card (`approval-required`); nothing
   *     is auto-executed (R4.1). The guardrail check is still run and attached so
   *     the card can surface any violations, but it never changes the decision.
   *   - **Autopilot** — run {@link GuardrailService.check}. When it passes, the
   *     item is added to `autoExecute` for the ACT stage (R5.1). When it fails —
   *     a guardrail violation or an approval-required action (R5.2) — an
   *     Approval_Card is emitted and the item awaits the user.
   *
   * Never throws: a failure to persist an approval or dispatch a notification is
   * logged and degraded (the item is still routed `approval-required`), so the
   * Operating Loop keeps running.
   */
  async route(
    mission: GateMissionInput,
    items: GateableItem[],
    options: RouteOptions = {},
  ): Promise<RouteResult> {
    const routed: GateRoutedItem[] = []
    const autoExecute: GateableItem[] = []
    const approvals: IApproval[] = []
    const isCopilot = mission.operatingMode === 'copilot'
    const guardrailMission: GuardrailMissionInput = {
      brandVoice: mission.brandVoice,
      guardrails: mission.guardrails,
    }

    for (const item of items) {
      const guardrail = this.guardrail.check(guardrailMission, item.action)

      // Copilot (R4.1/R4.2): every item is presented for approval.
      if (isCopilot) {
        const reason = 'Copilot mode: presented for approval before any execution.'
        const approval = await this.emitApprovalCard(mission, item, options.notify)
        if (approval) approvals.push(approval)
        routed.push({ item, decision: 'approval-required', guardrail, approval, reason })
        continue
      }

      // Autopilot (R5.1): auto-execute only when the guardrail gate passes.
      if (guardrail.ok) {
        autoExecute.push(item)
        routed.push({
          item,
          decision: 'auto-execute',
          guardrail,
          approval: null,
          reason: 'Autopilot mode: guardrails passed; eligible for auto-execution.',
        })
        continue
      }

      // Autopilot (R5.2 + "else card"): a failing check — including an
      // approval-required action — emits an Approval_Card and awaits the user.
      const reason = this.describeViolations(guardrail)
      const approval = await this.emitApprovalCard(mission, item, options.notify)
      if (approval) approvals.push(approval)
      routed.push({ item, decision: 'approval-required', guardrail, approval, reason })
    }

    logger.info('GATE: routed planned items', {
      component: COMPONENT,
      missionId: String(mission._id),
      operatingMode: mission.operatingMode,
      total: items.length,
      autoExecute: autoExecute.length,
      approvals: approvals.length,
    })

    return { routed, autoExecute, approvals }
  }

  /**
   * Emit an Approval_Card for an item: persist a pending {@link IApproval} and
   * deliver a User_Input_Notification (R4, R15). Returns the persisted approval,
   * or `null` when it could not be persisted (the caller can retry/escalate).
   * Never throws.
   */
  private async emitApprovalCard(
    mission: GateMissionInput,
    item: GateableItem,
    notify?: GateNotifyContext,
  ): Promise<IApproval | null> {
    let approval: IApproval | null = null
    try {
      approval = await this.approvalStore.create({
        missionId: mission._id as IApproval['missionId'],
        workspaceId: mission.workspaceId,
        itemType: item.itemType,
        itemRef: item.itemRef as unknown as IApproval['itemRef'],
        status: 'pending',
        ...(item.chatMessageId !== undefined ? { chatMessageId: item.chatMessageId } : {}),
        ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
      } as Partial<IApproval>)
    } catch (error) {
      logger.error('GATE: failed to persist approval; item left awaiting approval', error, {
        component: COMPONENT,
        missionId: String(mission._id),
        itemType: item.itemType,
        itemRef: item.itemRef,
      })
      return null
    }

    await this.notify(mission, item, notify)
    return approval
  }

  /**
   * Deliver the card's User_Input_Notification (R4, R15). Best-effort: skipped
   * when no `userId` is supplied, and any dispatch error is caught so routing is
   * never blocked by a notification failure.
   */
  private async notify(
    mission: GateMissionInput,
    item: GateableItem,
    notify?: GateNotifyContext,
  ): Promise<void> {
    if (!notify?.userId) return
    try {
      await this.dispatcher.dispatch({
        userId: notify.userId,
        workspaceId: String(mission.workspaceId),
        title: item.title ?? 'Auto Pilot needs your approval',
        message: item.message ?? `A ${item.itemType} is awaiting your approval.`,
        type: 'alert',
        sessionContext: notify.sessionContext,
        deviceToken: notify.deviceToken,
        email: notify.email,
      })
    } catch (error) {
      logger.warn('GATE: approval-card notification dispatch failed', {
        component: COMPONENT,
        missionId: String(mission._id),
        itemType: item.itemType,
        itemRef: item.itemRef,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Build a concise rationale from a failing guardrail check for narration/audit. */
  private describeViolations(guardrail: GuardrailCheck): string {
    if (guardrail.violations.some((v) => v.kind === 'approval-required')) {
      return 'Autopilot mode: action is designated human-approval-required; awaiting approval.'
    }
    const kinds = guardrail.violations.map((v) => v.kind).join(', ')
    return `Autopilot mode: guardrail check failed (${kinds}); presented for approval.`
  }
}

/** Shared default instance wired to the real guardrail gate, repository, and dispatcher. */
export const gateService = new GateService()
