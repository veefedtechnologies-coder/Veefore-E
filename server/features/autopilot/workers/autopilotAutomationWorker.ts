/**
 * Auto Pilot — `autopilot-automation` worker (Engagement_Automation lifecycle).
 *
 * The execution half of Requirement 11: it takes the drafted Engagement_Automation
 * rules {@link AutomationDecisionService.draftRule} produced and drives them
 * through go-live and stand-down using the EXISTING
 * `automationRuleRepository.toggleActive` — Auto Pilot never re-implements the
 * automation engine; every trigger/reply still runs through the existing
 * `TriggerEngine` / `automationWorker` / `AntiSpamService` stack (R11.8, R18.1).
 *
 * Two job kinds:
 *
 *   1. **`activate`** (R11.1, R11.2). Enqueued the moment a slot's post is
 *      confirmed published, so a rule goes live within 60s of the publish confirm.
 *      Before touching the rule it runs an **eligibility gate**: activation only
 *      proceeds when the drafted rule is *approved AND guardrails-passed*. In
 *      Copilot the rule stays inactive until the user approves it (R11.1); in
 *      Autopilot a guardrails-passed rule with no outstanding approval-required
 *      card is eligible (R11.2). An ineligible job is a no-op (a still-pending
 *      card is simply re-checked on a later publish/loop tick); a *rejected*
 *      card discards the draft and audits the outcome (R11.7).
 *
 *   2. **`deactivate`** (R11.3). A delayed job fired at `publishTime + 90 days`
 *      that stands the rule down when its active engagement window closes.
 *
 * For either kind the toggle is:
 *   - **retried** on failure per a defined policy (R11.5 activation / R11.6
 *     deactivation) with 30s→300s backoff,
 *   - **audited** on the terminal outcome — one Audit_Record for a successful
 *     activate/deactivate (R11.4), and one failure record if the retries are
 *     exhausted (R11.5/R11.6), and
 *   - on a **successful activation** it schedules the matching 90-day
 *     `deactivate` job (R11.3), and on **exhausted activation** it raises an
 *     Escalation + User_Input_Notification identifying the affected rule (R11.5).
 *
 * Every dependency (rule store, eligibility gate, audit service, dispatcher,
 * deactivation scheduler, escalation-target resolver, clock, sleep) is injected
 * into {@link createAutomationJobProcessor}, so the gate → toggle → retry →
 * resolve flow is fully unit- and property-testable without Redis, Mongo, or the
 * real automation stack. The lazy {@link getAutopilotAutomationWorker} wires the
 * real defaults and is only initialised when Redis is present (mirrors
 * `autopilotPublishWorker`).
 *
 * Satisfies Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8
 */

import { Worker, type Job } from 'bullmq'
import { getSharedRedisConnection } from '../../../lib/redis'
import { logger } from '../../../config/logger'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from '../services/AutoPilotAuditService'
import {
  NotificationDispatcher,
  notificationDispatcher,
  type SessionContext,
} from '../services/NotificationDispatcher'
import {
  ACTIVE_WINDOW_MS,
  type AutopilotAutomationJobData,
} from '../queues/autopilotAutomationQueue'

const COMPONENT = 'autopilot.autopilotAutomationWorker'

/**
 * R11.5/R11.6: 1 initial attempt + 3 retries = 4 total attempts for either the
 * activate or the deactivate toggle.
 */
export const AUTOMATION_MAX_ATTEMPTS = 4

/** The 3 inter-attempt delays (ms), rising 30s → 120s → 300s. */
export const AUTOMATION_RETRY_DELAYS_MS: readonly number[] = [30_000, 120_000, 300_000]

/** Hard ceiling on any inter-attempt delay. */
export const AUTOMATION_MAX_RETRY_DELAY_MS = 300_000

/**
 * Rule-toggle port. Each method returns whether the rule ended in the desired
 * state (active for `activate`, inactive for `deactivate`); a missing rule or a
 * write that leaves the wrong state resolves `false` and is treated as a failed
 * attempt. Satisfied by the existing {@link AutomationRuleRepository.toggleActive}.
 */
export interface AutomationRuleStore {
  /** Toggle the rule active; resolve `true` when it is now active (R11.2). */
  activate(ruleId: string): Promise<boolean>
  /** Toggle the rule inactive; resolve `true` when it is now inactive (R11.3). */
  deactivate(ruleId: string): Promise<boolean>
}

/** Why the eligibility gate allowed or blocked an activation. */
export type ActivationEligibility =
  /** Approved (Copilot) / guardrails-passed (Autopilot) — activate now (R11.1/R11.2). */
  | { allowed: true; reason: string }
  /** Not yet actionable (pending approval / not published) — re-check later. */
  | { allowed: false; reason: string; rejected?: false }
  /** The user rejected the drafted rule — discard + audit (R11.7). */
  | { allowed: false; reason: string; rejected: true }

/**
 * Eligibility gate for activation (R11.1/R11.2). Decides whether a drafted rule
 * is approved AND guardrails-passed. Injected so the worker never re-implements
 * the GATE-stage routing; the default reads the mission's Operating_Mode + the
 * automation's Approval record.
 */
export interface ActivationGate {
  canActivate(data: AutopilotAutomationJobData): Promise<ActivationEligibility>
}

/** Schedules the matching 90-day `deactivate` job after a successful activation (R11.3). */
export interface DeactivationScheduler {
  schedule(data: AutopilotAutomationJobData): Promise<boolean>
}

/** Resolves who to escalate to when activation is exhausted (R11.5). */
export interface AutomationEscalationTargetResolver {
  resolve(data: AutopilotAutomationJobData): Promise<{
    userId: string
    sessionContext?: SessionContext
    deviceToken?: string | null
    email?: string | null
  } | null>
}

/** Injectable dependencies for {@link createAutomationJobProcessor}. */
export interface AutomationWorkerDeps {
  store: AutomationRuleStore
  auditService: Pick<AutoPilotAuditService, 'record'>
  dispatcher: Pick<NotificationDispatcher, 'dispatch'>
  /** Eligibility gate for `activate` jobs; when absent, activation is allowed. */
  gate?: ActivationGate
  /** Schedules the 90-day deactivation after a successful activation (R11.3). */
  deactivationScheduler?: DeactivationScheduler
  /** Resolves the escalation target for an exhausted activation (R11.5). */
  escalationTargetResolver?: AutomationEscalationTargetResolver
  /** Inter-attempt delays (ms); defaults to {@link DEFAULT_RETRY_DELAYS_MS}. */
  retryDelaysMs?: readonly number[]
  /** Injectable clock (defaults to `Date.now`). */
  now?: () => number
  /** Injectable sleep (defaults to a real timer); no-op wait in tests. */
  sleep?: (ms: number) => Promise<void>
}

/** The result of processing one automation-lifecycle job (surfaced for tests + logging). */
export type AutomationJobResult =
  | { action: 'activated'; ruleId: string; attempts: number; deactivationScheduled: boolean }
  | { action: 'deactivated'; ruleId: string; attempts: number }
  | {
      action: 'failed'
      kind: 'activate' | 'deactivate'
      ruleId: string
      attempts: number
      escalated: boolean
      lastError: string
    }
  | { action: 'skipped'; ruleId: string; reason: string }

const realSleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

/** Clamp an inter-attempt delay to the 300s ceiling. */
function clampDelay(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.min(ms, AUTOMATION_MAX_RETRY_DELAY_MS)
}

/**
 * Run a boolean toggle with the defined retry policy (R11.5/R11.6). Returns the
 * attempt count and whether it ultimately succeeded. A thrown toggle or a `false`
 * return counts as a failed attempt; failures back off 30s→300s between tries.
 */
async function toggleWithRetry(
  op: () => Promise<boolean>,
  retryDelays: readonly number[],
  sleep: (ms: number) => Promise<void>,
): Promise<{ ok: boolean; attempts: number; lastError: string }> {
  let lastError = 'toggle did not reach the desired state'
  for (let attempt = 1; attempt <= AUTOMATION_MAX_ATTEMPTS; attempt++) {
    try {
      const ok = await op()
      if (ok) return { ok: true, attempts: attempt, lastError }
      lastError = 'rule toggle returned without the desired state (rule missing?)'
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (attempt < AUTOMATION_MAX_ATTEMPTS) {
      await sleep(clampDelay(retryDelays[attempt - 1] ?? AUTOMATION_MAX_RETRY_DELAY_MS))
    }
  }
  return { ok: false, attempts: AUTOMATION_MAX_ATTEMPTS, lastError }
}

/**
 * Build the pure automation-lifecycle processor. Given the injected ports it
 * gates activation (R11.1/R11.2), toggles the rule with retry (R11.5/R11.6),
 * audits the terminal outcome (R11.4), schedules the 90-day deactivation after a
 * successful activation (R11.3), and escalates an exhausted activation (R11.5).
 *
 * Never throws for expected outcomes; it reports the result so the worker (and
 * tests) can assert on it and the Operating Loop keeps running.
 */
export function createAutomationJobProcessor(deps: AutomationWorkerDeps) {
  const retryDelays = deps.retryDelaysMs ?? AUTOMATION_RETRY_DELAYS_MS
  const sleep = deps.sleep ?? realSleep

  async function processActivate(data: AutopilotAutomationJobData): Promise<AutomationJobResult> {
    // R11.1/R11.2: only activate an approved AND guardrails-passed rule.
    if (deps.gate) {
      let eligibility: ActivationEligibility
      try {
        eligibility = await deps.gate.canActivate(data)
      } catch (error) {
        // A gate failure must never activate a rule; skip and re-check later.
        const message = error instanceof Error ? error.message : String(error)
        logger.warn('automation activation gate failed — skipping', {
          component: COMPONENT,
          ruleId: data.ruleId,
          slotId: data.slotId,
          error: message,
        })
        return { action: 'skipped', ruleId: data.ruleId, reason: `gate-error: ${message}` }
      }

      if (!eligibility.allowed) {
        // R11.7: a rejected draft is discarded and the outcome audited.
        if ('rejected' in eligibility && eligibility.rejected) {
          await deps.auditService.record({
            missionId: data.missionId,
            workspaceId: data.workspaceId,
            stage: 'ACT',
            action: 'automation-activate',
            outcome: 'blocked',
            triggeringContext: {
              slotId: data.slotId,
              ruleId: data.ruleId,
              reason: eligibility.reason,
            },
          })
        }
        logger.info('automation not eligible for activation — skipping', {
          component: COMPONENT,
          ruleId: data.ruleId,
          slotId: data.slotId,
          reason: eligibility.reason,
        })
        return { action: 'skipped', ruleId: data.ruleId, reason: eligibility.reason }
      }
    }

    // R11.2 + R11.5: activate with the defined retry policy.
    const { ok, attempts, lastError } = await toggleWithRetry(
      () => deps.store.activate(data.ruleId),
      retryDelays,
      sleep,
    )

    if (ok) {
      // R11.4: audit the successful activation. Reversible via a deactivate op.
      await deps.auditService.record({
        missionId: data.missionId,
        workspaceId: data.workspaceId,
        stage: 'ACT',
        action: 'automation-activate',
        outcome: 'success',
        reversible: true,
        triggeringContext: { slotId: data.slotId, ruleId: data.ruleId, attempts },
        preExecutionState: { ruleId: data.ruleId, isActive: false },
        reversalOp: { op: 'deactivate-rule', ruleId: data.ruleId },
      })

      // R11.3: schedule the matching 90-day stand-down.
      const deactivationScheduled = await scheduleDeactivation(deps, data)

      logger.info('automation activated', {
        component: COMPONENT,
        ruleId: data.ruleId,
        slotId: data.slotId,
        attempts,
        deactivationScheduled,
      })
      return { action: 'activated', ruleId: data.ruleId, attempts, deactivationScheduled }
    }

    // R11.5: activation exhausted — audit the failure + escalate to the user.
    await deps.auditService.record({
      missionId: data.missionId,
      workspaceId: data.workspaceId,
      stage: 'ACT',
      action: 'automation-activate',
      outcome: 'failure',
      triggeringContext: { slotId: data.slotId, ruleId: data.ruleId, attempts, error: lastError },
    })
    const escalated = await escalateActivationFailure(deps, data, lastError)

    logger.error('automation activation exhausted all attempts', undefined, {
      component: COMPONENT,
      ruleId: data.ruleId,
      slotId: data.slotId,
      attempts,
      escalated,
      lastError,
    })
    return { action: 'failed', kind: 'activate', ruleId: data.ruleId, attempts, escalated, lastError }
  }

  async function processDeactivate(data: AutopilotAutomationJobData): Promise<AutomationJobResult> {
    // R11.6: deactivate with the defined retry policy.
    const { ok, attempts, lastError } = await toggleWithRetry(
      () => deps.store.deactivate(data.ruleId),
      retryDelays,
      sleep,
    )

    if (ok) {
      // R11.4: audit the successful deactivation.
      await deps.auditService.record({
        missionId: data.missionId,
        workspaceId: data.workspaceId,
        stage: 'ACT',
        action: 'automation-deactivate',
        outcome: 'success',
        triggeringContext: { slotId: data.slotId, ruleId: data.ruleId, attempts },
      })
      logger.info('automation deactivated', {
        component: COMPONENT,
        ruleId: data.ruleId,
        slotId: data.slotId,
        attempts,
      })
      return { action: 'deactivated', ruleId: data.ruleId, attempts }
    }

    // R11.6: deactivation exhausted — record the failure (no escalation required).
    await deps.auditService.record({
      missionId: data.missionId,
      workspaceId: data.workspaceId,
      stage: 'ACT',
      action: 'automation-deactivate',
      outcome: 'failure',
      triggeringContext: { slotId: data.slotId, ruleId: data.ruleId, attempts, error: lastError },
    })
    logger.error('automation deactivation exhausted all attempts', undefined, {
      component: COMPONENT,
      ruleId: data.ruleId,
      slotId: data.slotId,
      attempts,
      lastError,
    })
    return { action: 'failed', kind: 'deactivate', ruleId: data.ruleId, attempts, escalated: false, lastError }
  }

  return async function processAutomationJob(
    data: AutopilotAutomationJobData,
  ): Promise<AutomationJobResult> {
    return data.kind === 'deactivate' ? processDeactivate(data) : processActivate(data)
  }
}

/** Schedule the 90-day deactivation (R11.3); never throws — logs + reports false. */
async function scheduleDeactivation(
  deps: AutomationWorkerDeps,
  data: AutopilotAutomationJobData,
): Promise<boolean> {
  if (!deps.deactivationScheduler) return false
  try {
    return await deps.deactivationScheduler.schedule(data)
  } catch (error) {
    logger.warn('automation deactivation scheduling failed', {
      component: COMPONENT,
      ruleId: data.ruleId,
      slotId: data.slotId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Raise an Escalation + User_Input_Notification for an exhausted activation
 * (R11.5). Returns whether any channel delivered. Never throws.
 */
async function escalateActivationFailure(
  deps: AutomationWorkerDeps,
  data: AutopilotAutomationJobData,
  lastError: string,
): Promise<boolean> {
  let target = data.target ?? null
  if (!target && deps.escalationTargetResolver) {
    try {
      target = await deps.escalationTargetResolver.resolve(data)
    } catch (error) {
      logger.warn('automation escalation target resolution failed', {
        component: COMPONENT,
        ruleId: data.ruleId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (!target || !target.userId) {
    logger.error('automation activation exhausted with no escalation target', undefined, {
      component: COMPONENT,
      ruleId: data.ruleId,
      slotId: data.slotId,
    })
    return false
  }
  try {
    const result = await deps.dispatcher.dispatch({
      userId: target.userId,
      workspaceId: data.workspaceId,
      title: 'Auto Pilot: an engagement automation could not be activated',
      message:
        'Auto Pilot tried to activate the engagement automation for a published post ' +
        `without success. It remains inactive and needs your attention (${lastError}).`,
      type: 'alert',
      sessionContext: target.sessionContext,
      deviceToken: target.deviceToken,
      email: target.email,
    })
    return !result.undelivered
  } catch (error) {
    logger.error('automation escalation dispatch failed', error, {
      component: COMPONENT,
      ruleId: data.ruleId,
      slotId: data.slotId,
    })
    return false
  }
}

// ── Default ports backed by the real repositories / queue ────────────────────

/**
 * Default rule store: toggles the drafted rule active/inactive through the
 * EXISTING `automationRuleRepository.toggleActive`, treating a `null` result
 * (rule missing) or the wrong resulting state as a failed toggle.
 */
const defaultRuleStore: AutomationRuleStore = {
  async activate(ruleId: string): Promise<boolean> {
    const { automationRuleRepository } = await import('../../../repositories/AutomationRepository')
    const rule = await automationRuleRepository.toggleActive(ruleId, true)
    return !!rule && (rule as { isActive?: boolean }).isActive === true
  },
  async deactivate(ruleId: string): Promise<boolean> {
    const { automationRuleRepository } = await import('../../../repositories/AutomationRepository')
    const rule = await automationRuleRepository.toggleActive(ruleId, false)
    return !!rule && (rule as { isActive?: boolean }).isActive === false
  },
}

/**
 * Default eligibility gate (R11.1/R11.2). Activation proceeds only when the
 * drafted rule is approved AND guardrails-passed:
 *   - a rejected automation Approval discards the draft (R11.7);
 *   - a pending/expired approval is not yet actionable — re-check later;
 *   - an approved/edited approval is eligible (Copilot approval, R11.1);
 *   - with no approval record, Copilot waits for approval (R11.1) while Autopilot
 *     treats the guardrails-passed auto-executed rule as eligible (R11.2).
 */
const defaultActivationGate: ActivationGate = {
  async canActivate(data: AutopilotAutomationJobData): Promise<ActivationEligibility> {
    const { missionRepository, approvalRepository } = await import('../db/repositories')

    const approval = await approvalRepository.findByItem('automation', data.ruleId)
    if (approval) {
      const status = (approval as { status?: string }).status
      if (status === 'approved' || status === 'edited') {
        return { allowed: true, reason: 'automation approved by user' }
      }
      if (status === 'rejected') {
        return { allowed: false, rejected: true, reason: 'automation draft rejected by user' }
      }
      // pending / expired
      return { allowed: false, reason: `automation approval is ${status ?? 'pending'}` }
    }

    // No approval record — decide by Operating_Mode.
    const mission = await missionRepository.findById(data.missionId)
    const mode = (mission as { operatingMode?: string } | null)?.operatingMode
    if (mode === 'copilot') {
      return { allowed: false, reason: 'copilot mode requires approval before activation' }
    }
    // Autopilot: the rule reached go-live via a guardrails-passed auto-execution.
    return { allowed: true, reason: 'autopilot mode: guardrails-passed automation' }
  },
}

/** Default deactivation scheduler: enqueue the 90-day `deactivate` job (R11.3). */
const defaultDeactivationScheduler: DeactivationScheduler = {
  async schedule(data: AutopilotAutomationJobData): Promise<boolean> {
    const { AutopilotAutomationQueueManager } = await import('../queues/autopilotAutomationQueue')
    const publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date()
    return AutopilotAutomationQueueManager.scheduleDeactivation({
      ruleId: data.ruleId,
      missionId: data.missionId,
      workspaceId: data.workspaceId,
      slotId: data.slotId,
      publishedAt,
      activeWindowMs: ACTIVE_WINDOW_MS,
    })
  },
}

/** Default escalation-target resolver: notify the mission's workspace owner (R11.5). */
const defaultEscalationTargetResolver: AutomationEscalationTargetResolver = {
  async resolve(data: AutopilotAutomationJobData) {
    try {
      const { missionRepository } = await import('../db/repositories')
      const mission = await missionRepository.findById(data.missionId)
      const userId =
        (mission as any)?.userId ?? (mission as any)?.ownerId ?? (mission as any)?.createdBy
      if (!userId) return null
      return { userId: String(userId), sessionContext: 'web' as SessionContext }
    } catch {
      return null
    }
  },
}

// ── Lazy BullMQ worker (mirrors autopilotPublishWorker) ──────────────────────
let autopilotAutomationWorker: Worker<AutopilotAutomationJobData> | null = null

/**
 * Lazily initialise the `autopilot-automation` worker on first use. Returns
 * `null` when Redis is unavailable so scheduling degrades gracefully.
 */
export function getAutopilotAutomationWorker(): Worker<AutopilotAutomationJobData> | null {
  if (autopilotAutomationWorker) return autopilotAutomationWorker

  if (!process.env.REDIS_URL) {
    return null
  }

  const connection = getSharedRedisConnection()
  if (!connection) {
    logger.warn('Redis unavailable, autopilot-automation worker cannot be initialized', {
      component: COMPONENT,
    })
    return null
  }

  const processJob = createAutomationJobProcessor({
    store: defaultRuleStore,
    auditService: autoPilotAuditService,
    dispatcher: notificationDispatcher,
    gate: defaultActivationGate,
    deactivationScheduler: defaultDeactivationScheduler,
    escalationTargetResolver: defaultEscalationTargetResolver,
  })

  autopilotAutomationWorker = new Worker<AutopilotAutomationJobData>(
    'autopilot-automation',
    async (job: Job<AutopilotAutomationJobData>) => processJob(job.data),
    { connection, concurrency: 3 },
  )

  autopilotAutomationWorker.on('failed', (job, err) => {
    logger.error('autopilot-automation job failed', err, {
      component: COMPONENT,
      jobId: job?.id,
      kind: job?.data?.kind,
      ruleId: job?.data?.ruleId,
    })
  })

  return autopilotAutomationWorker
}
