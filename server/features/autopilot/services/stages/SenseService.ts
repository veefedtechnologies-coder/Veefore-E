/**
 * Auto Pilot — SenseService (SENSE stage of the Operating Loop).
 *
 * SENSE is the first stage of every Operating-Loop iteration. It gathers the two
 * external inputs the THINK/PLAN stages reason over (design "Stage
 * responsibilities" · R3.1, R3.3):
 *
 *   • the connected account's current analytics, via the existing
 *     `AnalyticsService.getPerformanceSummary(workspaceId, days)` — the progress
 *     metric + performance mix (R2.2, R3.3); and
 *   • trend signals for the Mission's niche, via the existing self-owned research
 *     engine `research(niche, { mode: 'trends' })` (R2.2, R3.3).
 *
 * SenseService is deliberately an **orchestrator**, not a re-implementation: it
 * composes the analytics service and the research engine that already exist and
 * never talks to Instagram or a search provider directly. Both dependencies are
 * injected as ports (with the real singletons as defaults) so the degradation
 * and failure-streak logic is fully unit-testable without a database, network,
 * or search provider.
 *
 * ── Graceful degradation (R2.3) ─────────────────────────────────────────────
 * A single missing input must never stop the loop. If analytics or research is
 * unavailable (throws, is not configured, or yields no usable signal), SENSE:
 *   1. omits that input from the result,
 *   2. records the unavailable input in an Audit_Record (R2.3, and R3.7 for
 *      analytics specifically), and
 *   3. lists it in `reducedInputs` so THINK marks the Strategy as generated with
 *      reduced inputs.
 * SENSE only surfaces both inputs when both succeed; otherwise it returns
 * whatever it could collect. It never throws to the caller.
 *
 * ── Analytics-failure streak + Escalation (R3.7 / R3.8) ─────────────────────
 * SENSE tracks how many *consecutive* iterations analytics retrieval has failed.
 * The previous streak is supplied by the caller (the orchestrator persists it
 * across iterations); SENSE returns the updated streak: incremented on an
 * analytics failure, reset to 0 on success. When the streak reaches the
 * escalation threshold (3 consecutive failures, R3.8), SENSE creates an
 * Escalation and delivers a User_Input_Notification identifying the affected
 * Mission — provided the caller supplied a target to notify.
 *
 * Satisfies Requirements: 2.2, 2.3, 3.3, 3.7, 3.8
 */

import { logger } from '../../../../config/logger'
import { analyticsService } from '../../../../services/AnalyticsService'
import {
  research as webResearch,
  isResearchConfigured as defaultIsResearchConfigured,
  type ResearchResult,
} from '../../../../services/research/webResearch.service'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
  type AuditEscalationTarget,
} from '../AutoPilotAuditService'
import {
  NotificationDispatcher,
  notificationDispatcher,
} from '../NotificationDispatcher'

const COMPONENT = 'autopilot.SenseService'

/** Consecutive analytics failures that trigger an Escalation (R3.8). */
export const ANALYTICS_ESCALATION_STREAK = 3

/** Default analytics look-back window (days) SENSE reads each iteration. */
export const DEFAULT_SENSE_ANALYTICS_DAYS = 30

/** The performance summary shape returned by the existing analytics service. */
export type PerformanceSummary = Awaited<
  ReturnType<typeof analyticsService.getPerformanceSummary>
>

/** The inputs SENSE can degrade on (R2.3). */
export type ReducedInput = 'analytics' | 'research'

/**
 * Read port for the account's current analytics. Defaults to the existing
 * `AnalyticsService.getPerformanceSummary`. Kept structural so the SENSE logic
 * stays decoupled from the concrete service and trivially testable.
 */
export interface AnalyticsSummaryReader {
  getPerformanceSummary(workspaceId: string, days: number): Promise<PerformanceSummary>
}

/**
 * Read port for niche trend research. Defaults to the existing self-owned
 * `research()` engine invoked with `mode: 'trends'`.
 */
export interface TrendResearchRunner {
  (query: string, opts: { mode: 'trends'; workspaceId?: string }): Promise<ResearchResult>
}

/**
 * The minimal shape of a Mission SENSE needs. Accepting a structural type rather
 * than the full Mongoose document keeps the stage decoupled from persistence and
 * unit-testable with plain objects.
 */
export interface SenseMissionInput {
  /** Mission id — scopes the Audit_Records SENSE writes. */
  _id: unknown
  /** Workspace the mission (and its analytics) is bound to (R1.4). */
  workspaceId: unknown
  /** Niche used as the trend-research query (R3.3). */
  niche: string
}

/** Per-call options: the carried-over streak and where to escalate (R3.8). */
export interface SenseOptions {
  /**
   * The analytics-failure streak from the previous iteration (the orchestrator
   * persists it across ticks). Defaults to 0.
   */
  previousAnalyticsFailureStreak?: number
  /** Analytics look-back window in days. Defaults to {@link DEFAULT_SENSE_ANALYTICS_DAYS}. */
  analyticsDays?: number
  /**
   * Who to notify if the analytics-failure streak reaches the escalation
   * threshold (R3.8). When omitted, SENSE still records the failure and returns
   * the streak, but cannot deliver a User_Input_Notification.
   */
  escalationTarget?: AuditEscalationTarget
}

/** The result of one SENSE run (design `SenseResult`). */
export interface SenseResult {
  /** Current analytics, when the analytics read succeeded. */
  analytics?: PerformanceSummary
  /** Niche trend signals, when research succeeded and yielded a usable signal. */
  research?: ResearchResult
  /** Inputs that were unavailable this iteration and degraded (R2.3). */
  reducedInputs: ReducedInput[]
  /** Consecutive analytics-retrieval failures, including this iteration (R3.8). */
  analyticsFailureStreak: number
  /** `true` when this run raised an Escalation for the analytics streak (R3.8). */
  escalated: boolean
}

/** Tunable dependencies for the SENSE stage. */
export interface SenseServiceOptions {
  /** Analytics read transport (defaults to the shared `analyticsService`). */
  analyticsReader?: AnalyticsSummaryReader
  /** Trend research transport (defaults to the shared `research()` engine). */
  researchRunner?: TrendResearchRunner
  /** Reports whether the research engine is configured (defaults to the real check). */
  isResearchConfigured?: () => boolean
  /** Audit transport for degradation/failure records (defaults to the shared service). */
  auditService?: Pick<AutoPilotAuditService, 'record'>
  /** Escalation transport for the analytics streak (defaults to the shared dispatcher). */
  dispatcher?: Pick<NotificationDispatcher, 'dispatch'>
  /** Consecutive analytics failures that trigger an Escalation (defaults to 3, R3.8). */
  escalationStreak?: number
}

const defaultAnalyticsReader: AnalyticsSummaryReader = {
  getPerformanceSummary: (workspaceId, days) =>
    analyticsService.getPerformanceSummary(workspaceId, days),
}

const defaultResearchRunner: TrendResearchRunner = (query, opts) => webResearch(query, opts)

/**
 * A research result carries a usable signal when it has an answer, at least one
 * key point, at least one source, or a trend classification. An empty result
 * (e.g. the provider returned no hits) is treated as "research unavailable" so
 * THINK does not reason over nothing.
 */
function hasResearchSignal(result: ResearchResult | null | undefined): result is ResearchResult {
  if (!result) return false
  return (
    (typeof result.answer === 'string' && result.answer.trim().length > 0) ||
    (Array.isArray(result.keyPoints) && result.keyPoints.length > 0) ||
    (Array.isArray(result.sources) && result.sources.length > 0) ||
    (Array.isArray(result.trends) && result.trends.length > 0)
  )
}

/**
 * SENSE stage — collects analytics + niche trend research, degrades gracefully
 * on a missing input, and tracks the analytics-failure streak that drives R3.8.
 */
export class SenseService {
  private readonly analyticsReader: AnalyticsSummaryReader
  private readonly researchRunner: TrendResearchRunner
  private readonly isResearchConfigured: () => boolean
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>
  private readonly dispatcher: Pick<NotificationDispatcher, 'dispatch'>
  private readonly escalationStreak: number

  constructor(options: SenseServiceOptions = {}) {
    this.analyticsReader = options.analyticsReader ?? defaultAnalyticsReader
    this.researchRunner = options.researchRunner ?? defaultResearchRunner
    this.isResearchConfigured = options.isResearchConfigured ?? defaultIsResearchConfigured
    this.auditService = options.auditService ?? autoPilotAuditService
    this.dispatcher = options.dispatcher ?? notificationDispatcher
    this.escalationStreak = Math.max(
      1,
      Math.floor(options.escalationStreak ?? ANALYTICS_ESCALATION_STREAK),
    )
  }

  /**
   * Run the SENSE stage for a Mission (R3.3).
   *
   * Reads the account's analytics and niche trend research in parallel, degrades
   * gracefully on either being unavailable (R2.3), tracks the consecutive
   * analytics-failure streak (R3.7), and escalates when it reaches the threshold
   * (R3.8). Never throws — a failed input is recorded and omitted so the next
   * stage can proceed with reduced inputs and the loop keeps running (R3.7).
   */
  async sense(mission: SenseMissionInput, options: SenseOptions = {}): Promise<SenseResult> {
    const previousStreak = Math.max(0, Math.floor(options.previousAnalyticsFailureStreak ?? 0))
    const analyticsDays = options.analyticsDays ?? DEFAULT_SENSE_ANALYTICS_DAYS
    const workspaceId = String(mission.workspaceId)

    const [analytics, research] = await Promise.all([
      this.collectAnalytics(mission, workspaceId, analyticsDays),
      this.collectResearch(mission, workspaceId),
    ])

    const reducedInputs: ReducedInput[] = []
    if (!analytics) reducedInputs.push('analytics')
    if (!research) reducedInputs.push('research')

    // R3.7: analytics failure increments the streak; a success resets it.
    const analyticsFailureStreak = analytics ? 0 : previousStreak + 1

    // R3.8: escalate once the streak reaches the threshold of consecutive fails.
    let escalated = false
    if (!analytics && analyticsFailureStreak >= this.escalationStreak) {
      escalated = await this.escalateAnalyticsStreak(
        mission,
        workspaceId,
        analyticsFailureStreak,
        options.escalationTarget,
      )
    }

    return {
      ...(analytics ? { analytics } : {}),
      ...(research ? { research } : {}),
      reducedInputs,
      analyticsFailureStreak,
      escalated,
    }
  }

  /**
   * Read the account's analytics (R2.2/R3.3). On failure, records the
   * unavailable input in an Audit_Record (R2.3, R3.7) and returns `null` so the
   * caller degrades rather than terminating the Mission (R3.7).
   */
  private async collectAnalytics(
    mission: SenseMissionInput,
    workspaceId: string,
    days: number,
  ): Promise<PerformanceSummary | null> {
    try {
      const summary = await this.analyticsReader.getPerformanceSummary(workspaceId, days)
      if (summary == null) throw new Error('analytics returned no summary')
      return summary
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('SENSE: analytics unavailable — degrading with reduced inputs', {
        component: COMPONENT,
        missionId: String(mission._id),
        workspaceId,
        error: message,
      })
      // R2.3 + R3.7: record the unavailable analytics input.
      await this.recordUnavailable(mission, workspaceId, 'analytics', message)
      return null
    }
  }

  /**
   * Run niche trend research (R2.2/R3.3). Treats an unconfigured engine, a
   * thrown error, or a result with no usable signal as "research unavailable",
   * records it (R2.3), and returns `null` so the caller degrades.
   */
  private async collectResearch(
    mission: SenseMissionInput,
    workspaceId: string,
  ): Promise<ResearchResult | null> {
    if (!this.isResearchConfigured()) {
      logger.warn('SENSE: research engine not configured — degrading with reduced inputs', {
        component: COMPONENT,
        missionId: String(mission._id),
      })
      await this.recordUnavailable(mission, workspaceId, 'research', 'research engine not configured')
      return null
    }

    try {
      const result = await this.researchRunner(mission.niche, {
        mode: 'trends',
        workspaceId,
      })
      if (!hasResearchSignal(result)) {
        logger.warn('SENSE: research returned no usable signal — degrading', {
          component: COMPONENT,
          missionId: String(mission._id),
        })
        await this.recordUnavailable(mission, workspaceId, 'research', 'research returned no signal')
        return null
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('SENSE: research unavailable — degrading with reduced inputs', {
        component: COMPONENT,
        missionId: String(mission._id),
        error: message,
      })
      await this.recordUnavailable(mission, workspaceId, 'research', message)
      return null
    }
  }

  /**
   * Record an unavailable SENSE input in an Audit_Record (R2.3; R3.7 for
   * analytics). Best-effort: the audit service already retries + escalates on a
   * write failure, and SENSE swallows any residual error so recording an outage
   * never itself crashes the loop.
   */
  private async recordUnavailable(
    mission: SenseMissionInput,
    workspaceId: string,
    input: ReducedInput,
    detail: string,
  ): Promise<void> {
    try {
      await this.auditService.record({
        missionId: mission._id,
        workspaceId,
        stage: 'SENSE',
        action: input === 'analytics' ? 'sense.analytics-unavailable' : 'sense.research-unavailable',
        outcome: 'failure',
        reversible: false,
        triggeringContext: { input, detail, niche: mission.niche },
      })
    } catch (error) {
      logger.warn('SENSE: failed to record unavailable input audit', {
        component: COMPONENT,
        missionId: String(mission._id),
        input,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Escalate a sustained analytics outage (R3.8): deliver a
   * User_Input_Notification identifying the affected Mission. Returns `true`
   * when a notification was delivered to at least one channel. Best-effort and
   * never throws.
   */
  private async escalateAnalyticsStreak(
    mission: SenseMissionInput,
    workspaceId: string,
    streak: number,
    target?: AuditEscalationTarget,
  ): Promise<boolean> {
    if (!target) {
      logger.error(
        'SENSE: analytics failure streak reached escalation threshold with no target to notify',
        undefined,
        { component: COMPONENT, missionId: String(mission._id), streak },
      )
      return false
    }

    try {
      const result = await this.dispatcher.dispatch({
        userId: target.userId,
        workspaceId,
        title: 'Auto Pilot needs your attention',
        message:
          `Auto Pilot could not read analytics for this mission on ${streak} consecutive ` +
          `checks. Please verify the connected Instagram account is still linked.`,
        type: 'alert',
        sessionContext: target.sessionContext,
        deviceToken: target.deviceToken,
        email: target.email,
      })
      return !result.undelivered
    } catch (error) {
      logger.error('SENSE: analytics-streak escalation dispatch failed', error, {
        component: COMPONENT,
        missionId: String(mission._id),
        streak,
      })
      return false
    }
  }
}

/** Shared default instance wired to the real analytics + research services. */
export const senseService = new SenseService()
