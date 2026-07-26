/**
 * Auto Pilot — AutoPilotAuditService.
 *
 * The single place every Auto Pilot stage goes to record an autonomous action.
 * Requirement 17 makes the audit trail load-bearing: *every* action Auto Pilot
 * takes must leave exactly one Audit_Record capturing its triggering context,
 * the action, the outcome, and whether it can be reversed (R17.1, R5.5, and
 * Property 10 — audit completeness). Reversal metadata (the pre-execution state
 * and the reversal op) is captured on the same record so a reversible action can
 * later be undone (R13.5, R17.3).
 *
 * ── Write with retry-then-escalate (R17.2) ──────────────────────────────────
 * A dropped audit record would silently break the audit-completeness guarantee,
 * so `record` never simply gives up:
 *
 *   1. It persists the {@link AutoPilotAuditRecordModel} document, retrying the
 *      write up to `maxAttempts` times with the configured backoff. A thrown
 *      error or a write that yields no persisted id counts as a failed attempt
 *      (R17.2 — "retry creation according to a defined retry policy").
 *
 *   2. If every attempt fails, it does NOT throw (a failed audit write must not
 *      crash the Operating Loop). Instead it creates an Escalation by dispatching
 *      a User_Input_Notification through the {@link NotificationDispatcher} that
 *      identifies the affected action (R17.2), and returns a result flagged
 *      `recorded: false, escalated: true` so the caller can preserve its state.
 *
 * Because the write transport and the escalation dispatcher are injected as
 * ports (with the real Mongoose model / shared dispatcher as defaults), the
 * retry-then-escalate logic — and Property 10 — is fully unit-testable without a
 * database, Redis, or any notification transport.
 *
 * Engagement-automation execution (comment/DM replies) is still audited by the
 * existing `AuditTrailService`; this service covers Auto Pilot mission-level
 * actions (publish, generate, schedule, reschedule, substitute, guardrail
 * block, …) and is not a duplicate of that.
 *
 * Satisfies Requirements: 5.5, 13.5, 17.1, 17.2 (Property 10)
 */

import { logger } from '../../../config/logger'
import {
  AutoPilotAuditRecordModel,
  type AuditOutcome,
  type IAutoPilotAuditRecord,
  type LoopStage,
} from '../db/models'
import {
  NotificationDispatcher,
  notificationDispatcher,
  type SessionContext,
} from './NotificationDispatcher'

/**
 * The action to audit. Mirrors the persisted {@link IAutoPilotAuditRecord}
 * fields the caller supplies: everything Property 10 requires — the triggering
 * context, the action, its outcome, and reversibility — plus the R13.5 reversal
 * metadata (`preExecutionState`, `reversalOp`) for reversible actions.
 */
export interface AuditRecordInput {
  /** The mission the action belongs to. */
  missionId: unknown
  /** The workspace the mission (and record) is scoped to. */
  workspaceId: unknown
  /** Operating-loop stage the action ran in. */
  stage: LoopStage
  /** The action taken (e.g. `publish`, `generate`, `reschedule`, `substitute`). */
  action: string
  /** R17.1: the context that triggered the action. */
  triggeringContext?: Record<string, unknown>
  /** R17.1: the action's outcome. */
  outcome: AuditOutcome
  /** R17.1: whether the action can be reversed. Defaults to `false`. */
  reversible?: boolean
  /** R13.5: state captured before execution, used to reverse the action. */
  preExecutionState?: Record<string, unknown>
  /** R13.5: the operation that reverses the action. */
  reversalOp?: Record<string, unknown>
}

/**
 * Escalation target used only if the audit write ultimately fails (R17.2). The
 * dispatcher needs a user to notify; the optional session hints let the
 * notification route to mobile FCM / email as Requirement 15 defines.
 */
export interface AuditEscalationTarget {
  /** The user to notify that the action could not be audited. */
  userId: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token, when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** The outcome of an audit attempt. */
export interface AuditResult {
  /** `true` when the Audit_Record was persisted. */
  recorded: boolean
  /** The persisted record, when `recorded` is `true`. */
  record?: IAutoPilotAuditRecord
  /**
   * `true` when the write ultimately failed and an Escalation +
   * User_Input_Notification was dispatched instead (R17.2).
   */
  escalated: boolean
}

/**
 * Write port for persisting an Audit_Record. Defaults to the Mongoose model's
 * `create`. Isolating the write behind a port keeps the retry-then-escalate
 * logic pure and testable without a live database.
 */
export interface AuditWriter {
  /** Persist one audit record; resolves to the created document. */
  create(doc: AuditDocumentInput): Promise<IAutoPilotAuditRecord>
}

/** The persisted document shape, with defaults applied by the service. */
export interface AuditDocumentInput {
  missionId: unknown
  workspaceId: unknown
  stage: LoopStage
  action: string
  triggeringContext: Record<string, unknown>
  outcome: AuditOutcome
  reversible: boolean
  preExecutionState?: Record<string, unknown>
  reversalOp?: Record<string, unknown>
}

/** The dispatcher shape the service needs to raise an Escalation (R17.2). */
export type EscalationDispatcher = Pick<NotificationDispatcher, 'dispatch'>

/**
 * Read port for loading an Audit_Record by id, used by {@link
 * AutoPilotAuditService.reverse}. Defaults to the Mongoose model's `findById`.
 */
export interface AuditReader {
  /** Load one audit record by its id; resolves `null` when not found. */
  findById(auditId: string): Promise<IAutoPilotAuditRecord | null>
}

/**
 * Update port for stamping `reversedAt` once an action has been undone (R17.3).
 * Kept separate from the writer so the reversal path stays unit-testable.
 */
export interface AuditReversalUpdater {
  /**
   * Mark the record reversed at `reversedAt`. Resolves `true` when the record
   * was updated (found and stamped), `false` otherwise.
   */
  markReversed(auditId: string, reversedAt: Date): Promise<boolean>
}

/**
 * Executes the stored reversal op for a reversible action (R13.6, R17.3). The
 * concrete undo behaviour (unpublish a post, delete generated media, restore a
 * slot, deactivate a rule, …) lives in the owning stage/service, so the audit
 * service only depends on this port. An implementation MUST either apply the
 * reversal fully or leave state untouched, and throw when it cannot complete so
 * the service can preserve the pre-undo state (R17.4).
 */
export interface ReversalExecutor {
  /**
   * Apply the reversal for `record` using its stored `reversalOp` (and, when
   * useful, `preExecutionState`). Throw when the reversal cannot be completed.
   */
  execute(record: IAutoPilotAuditRecord): Promise<void>
}

/**
 * Who to notify about a reversal, and how to route the notification (R17.3).
 * The same session hints used for Escalations let a "reversed" confirmation
 * reach mobile FCM / in-app / email as Requirement 15 defines.
 */
export interface ReverseContext {
  /** The user to notify that the action was reversed. */
  userId?: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token, when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** Why a reverse request did not reverse the action. */
export type ReverseFailureReason =
  /** No Audit_Record exists for the given id. */
  | 'not-found'
  /** The record marks the action as not reversible (R17.5). */
  | 'not-reversible'
  /** The action was already reversed. */
  | 'already-reversed'
  /** The record is reversible but carries no reversal op to apply. */
  | 'missing-reversal-op'
  /** Applying the reversal op failed; pre-undo state preserved (R17.4). */
  | 'reversal-failed'

/** The outcome of a reverse (undo) request. */
export interface ReverseResult {
  /** `true` when the action was reversed and the record stamped `reversedAt`. */
  reversed: boolean
  /**
   * `true` when the undo was declined because the action is not reversible
   * (R17.5). Distinct from a reversal that was attempted but failed (R17.4).
   */
  declined: boolean
  /** A human-readable message describing the outcome, identifying the action. */
  message: string
  /** The audit record id the request targeted (identifies the action, R17.4/5). */
  auditId: string
  /** The action name, when the record was found (identifies the action). */
  action?: string
  /** Present when `reversed` is `false`: why the action was not reversed. */
  reason?: ReverseFailureReason
}

/** Tunable behaviour for the audit service. */
export interface AutoPilotAuditServiceOptions {
  /** Write transport (defaults to `AutoPilotAuditRecordModel.create`). */
  writer?: AuditWriter
  /** Escalation transport (defaults to the shared `notificationDispatcher`). */
  dispatcher?: EscalationDispatcher
  /**
   * Total write attempts before escalating (R17.2). Defaults to 3
   * (1 initial + 2 retries).
   */
  maxAttempts?: number
  /**
   * Delay before each retry, in ms. The value at index `i` is awaited before
   * retry attempt `i + 2`. Defaults to no delay so audit writes stay fast and
   * tests do not wait; a caller can pass a real backoff schedule.
   */
  retryDelaysMs?: number[]
  /** Injectable sleep (defaults to a real timer); overridable in tests. */
  sleep?: (ms: number) => Promise<void>
  /** Read transport for reversal (defaults to `AutoPilotAuditRecordModel.findById`). */
  reader?: AuditReader
  /** Reversal-stamp transport (defaults to `AutoPilotAuditRecordModel.findByIdAndUpdate`). */
  reversalUpdater?: AuditReversalUpdater
  /**
   * Applies the stored reversal op (R13.6). Defaults to an unconfigured executor
   * that throws — real undo behaviour is injected by the owning stage/service —
   * so an unconfigured reversal safely fails and preserves state (R17.4).
   */
  reversalExecutor?: ReversalExecutor
}

const DEFAULT_MAX_ATTEMPTS = 3
const COMPONENT = 'autopilot.AutoPilotAuditService'

const defaultWriter: AuditWriter = {
  async create(doc: AuditDocumentInput): Promise<IAutoPilotAuditRecord> {
    return (await AutoPilotAuditRecordModel.create(doc)) as unknown as IAutoPilotAuditRecord
  },
}

const defaultReader: AuditReader = {
  async findById(auditId: string): Promise<IAutoPilotAuditRecord | null> {
    return (await AutoPilotAuditRecordModel.findById(auditId)) as IAutoPilotAuditRecord | null
  },
}

const defaultReversalUpdater: AuditReversalUpdater = {
  async markReversed(auditId: string, reversedAt: Date): Promise<boolean> {
    const updated = await AutoPilotAuditRecordModel.findByIdAndUpdate(
      auditId,
      { $set: { reversedAt } },
      { new: true },
    )
    return updated != null
  },
}

/**
 * Default reversal executor: no concrete undo transport is wired at the audit
 * layer, so it throws. This makes an unconfigured reversal fail cleanly and
 * preserve state (R17.4) until the owning stage/service injects a real executor.
 */
const defaultReversalExecutor: ReversalExecutor = {
  async execute(): Promise<void> {
    throw new Error('No reversal executor configured for Auto Pilot')
  },
}

const realSleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

/**
 * Records Auto Pilot autonomous actions as Audit_Records, retrying the write and
 * escalating to a User_Input_Notification if it cannot be persisted (R17).
 */
export class AutoPilotAuditService {
  private readonly writer: AuditWriter
  private readonly dispatcher: EscalationDispatcher
  private readonly maxAttempts: number
  private readonly retryDelaysMs: number[]
  private readonly sleep: (ms: number) => Promise<void>
  private readonly reader: AuditReader
  private readonly reversalUpdater: AuditReversalUpdater
  private readonly reversalExecutor: ReversalExecutor

  constructor(options: AutoPilotAuditServiceOptions = {}) {
    this.writer = options.writer ?? defaultWriter
    this.dispatcher = options.dispatcher ?? notificationDispatcher
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS))
    this.retryDelaysMs = options.retryDelaysMs ?? []
    this.sleep = options.sleep ?? realSleep
    this.reader = options.reader ?? defaultReader
    this.reversalUpdater = options.reversalUpdater ?? defaultReversalUpdater
    this.reversalExecutor = options.reversalExecutor ?? defaultReversalExecutor
  }

  /**
   * Record one autonomous action as an Audit_Record (R17.1, R5.5, Property 10).
   *
   * Persists exactly one record capturing the triggering context, action,
   * outcome, reversibility, and — for reversible actions — the pre-execution
   * state and reversal op (R13.5). The write is retried up to `maxAttempts`
   * times (R17.2); if it never succeeds, an Escalation + User_Input_Notification
   * identifying the affected action is dispatched when an `escalationTarget` is
   * provided, and the method returns `{ recorded: false, escalated }` instead of
   * throwing so the Operating Loop keeps running.
   */
  async record(
    input: AuditRecordInput,
    escalationTarget?: AuditEscalationTarget,
  ): Promise<AuditResult> {
    const doc = this.toDocument(input)

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const record = await this.writer.create(doc)
        if (record && (record as { _id?: unknown })._id != null) {
          return { recorded: true, record, escalated: false }
        }
        // A write that yields no persisted id counts as a failed attempt (R17.2).
        logger.warn('Auto Pilot audit write returned no record', {
          component: COMPONENT,
          missionId: String(input.missionId),
          action: input.action,
          attempt,
          maxAttempts: this.maxAttempts,
        })
      } catch (error) {
        logger.warn('Auto Pilot audit write attempt failed', {
          component: COMPONENT,
          missionId: String(input.missionId),
          action: input.action,
          attempt,
          maxAttempts: this.maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      if (attempt < this.maxAttempts) {
        const delay = this.retryDelaysMs[attempt - 1] ?? 0
        if (delay > 0) await this.sleep(delay)
      }
    }

    // R17.2: writing continues to fail → Escalation + User_Input_Notification.
    const escalated = await this.escalate(input, escalationTarget)
    return { recorded: false, escalated }
  }

  /**
   * Reverse (undo) a previously audited autonomous action (R13.6, R17.3–17.5).
   *
   * Behaviour, driven entirely by the action's Audit_Record:
   *
   *   - **Not found** → returns `{ reversed: false, declined: false,
   *     reason: 'not-found' }`; there is nothing to undo.
   *   - **Not reversible** (R17.5) → declines the undo without touching state,
   *     returning `{ reversed: false, declined: true, reason: 'not-reversible' }`
   *     and a message identifying the action.
   *   - **Already reversed** → treated as declined so an undo is never applied
   *     twice (`reason: 'already-reversed'`).
   *   - **Reversible** (R13.6, R17.3) → applies the stored `reversalOp` through
   *     the {@link ReversalExecutor}; on success stamps `reversedAt` and notifies
   *     the user that the action has been reversed.
   *   - **Reversal fails** (R17.4) → the executor threw, so no `reversedAt` is
   *     written and no partial change is recorded; returns `{ reversed: false,
   *     declined: false, reason: 'reversal-failed' }` with a message that the
   *     undo could not be completed, identifying the action.
   *
   * Never throws: every path resolves to a {@link ReverseResult} so the caller
   * (undo endpoint / chat action) always gets a message to return to the user.
   */
  async reverse(auditId: string, context: ReverseContext = {}): Promise<ReverseResult> {
    let record: IAutoPilotAuditRecord | null
    try {
      record = await this.reader.findById(auditId)
    } catch (error) {
      logger.error('Auto Pilot reverse: failed to load audit record', error, {
        component: COMPONENT,
        auditId,
      })
      return {
        reversed: false,
        declined: false,
        message: `The action (${auditId}) could not be undone: its audit record could not be loaded.`,
        auditId,
        reason: 'not-found',
      }
    }

    if (!record) {
      return {
        reversed: false,
        declined: false,
        message: `No autonomous action was found for id ${auditId}, so there is nothing to undo.`,
        auditId,
        reason: 'not-found',
      }
    }

    const action = record.action

    // R17.5: a not-reversible action is declined without any state change.
    if (!record.reversible) {
      return {
        reversed: false,
        declined: true,
        message: `The "${action}" action cannot be undone.`,
        auditId,
        action,
        reason: 'not-reversible',
      }
    }

    // Guard against double-undo: an already-reversed action is declined.
    if (record.reversedAt != null) {
      return {
        reversed: false,
        declined: true,
        message: `The "${action}" action has already been reversed.`,
        auditId,
        action,
        reason: 'already-reversed',
      }
    }

    // A reversible action must carry a reversal op to apply (R13.5/R13.6).
    if (record.reversalOp == null) {
      return {
        reversed: false,
        declined: false,
        message: `The "${action}" action could not be undone: no reversal information is available.`,
        auditId,
        action,
        reason: 'reversal-failed',
      }
    }

    // R13.6/R17.3: apply the stored reversal op. On failure, preserve state.
    try {
      await this.reversalExecutor.execute(record)
    } catch (error) {
      // R17.4: retain the pre-undo state — do NOT stamp reversedAt.
      logger.warn('Auto Pilot reverse: reversal op failed; state preserved', {
        component: COMPONENT,
        auditId,
        action,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        reversed: false,
        declined: false,
        message: `The "${action}" action could not be undone; no changes were applied.`,
        auditId,
        action,
        reason: 'reversal-failed',
      }
    }

    // The reversal succeeded — stamp reversedAt (best-effort; the underlying
    // action is already reversed, so a stamp failure does not un-reverse it).
    try {
      await this.reversalUpdater.markReversed(auditId, new Date())
    } catch (error) {
      logger.error('Auto Pilot reverse: reversal applied but stamping reversedAt failed', error, {
        component: COMPONENT,
        auditId,
        action,
      })
    }

    // R17.3: notify the user that the action has been reversed (best-effort).
    await this.notifyReversed(record, context)

    return {
      reversed: true,
      declined: false,
      message: `The "${action}" action has been reversed.`,
      auditId,
      action,
    }
  }

  /**
   * Notify the user that an action was reversed (R17.3). Best-effort: with no
   * user to notify, or if the dispatcher fails, it logs and returns without
   * throwing so a successful reversal is never reported as a failure.
   */
  private async notifyReversed(
    record: IAutoPilotAuditRecord,
    context: ReverseContext,
  ): Promise<void> {
    if (!context.userId) return
    try {
      await this.dispatcher.dispatch({
        userId: context.userId,
        workspaceId: String(record.workspaceId),
        title: 'Auto Pilot action reversed',
        message: `The "${record.action}" action has been reversed.`,
        type: 'info',
        sessionContext: context.sessionContext,
        deviceToken: context.deviceToken,
        email: context.email,
      })
    } catch (error) {
      logger.warn('Auto Pilot reverse: reversed-notification dispatch failed', {
        component: COMPONENT,
        auditId: String((record as { _id?: unknown })._id ?? ''),
        action: record.action,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Apply defaults so every persisted record has the Property 10 fields. */
  private toDocument(input: AuditRecordInput): AuditDocumentInput {
    const doc: AuditDocumentInput = {
      missionId: input.missionId,
      workspaceId: input.workspaceId,
      stage: input.stage,
      action: input.action,
      triggeringContext: input.triggeringContext ?? {},
      outcome: input.outcome,
      reversible: input.reversible ?? false,
    }
    if (input.preExecutionState !== undefined) doc.preExecutionState = input.preExecutionState
    if (input.reversalOp !== undefined) doc.reversalOp = input.reversalOp
    return doc
  }

  /**
   * Raise an Escalation for an un-recordable action (R17.2). Returns `true` when
   * a User_Input_Notification was dispatched to at least one channel. Never
   * throws: with no escalation target, or if the dispatcher fails, it logs and
   * reports `false` so the caller still preserves state.
   */
  private async escalate(
    input: AuditRecordInput,
    target?: AuditEscalationTarget,
  ): Promise<boolean> {
    if (!target) {
      logger.error('Auto Pilot audit write failed with no escalation target', undefined, {
        component: COMPONENT,
        missionId: String(input.missionId),
        action: input.action,
      })
      return false
    }

    try {
      const result = await this.dispatcher.dispatch({
        userId: target.userId,
        workspaceId: String(input.workspaceId),
        title: 'Auto Pilot could not record an action',
        message:
          `Auto Pilot could not save an audit record for the "${input.action}" ` +
          `action (${input.stage} stage). Your input is needed to continue safely.`,
        type: 'alert',
        sessionContext: target.sessionContext,
        deviceToken: target.deviceToken,
        email: target.email,
      })
      return !result.undelivered
    } catch (error) {
      logger.error('Auto Pilot audit escalation dispatch failed', error, {
        component: COMPONENT,
        missionId: String(input.missionId),
        action: input.action,
      })
      return false
    }
  }
}

/** Shared default instance using the real model + shared dispatcher. */
export const autoPilotAuditService = new AutoPilotAuditService()
