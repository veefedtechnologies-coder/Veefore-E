/**
 * Auto Pilot — StrategyService (THINK stage of the Operating Loop).
 *
 * THINK is the second stage of every Operating-Loop iteration. It consumes the
 * {@link SenseResult} produced by SENSE and decomposes the Mission's Goal into a
 * concrete, forward-looking **Strategy** — one or more content themes, a posting
 * cadence (posts per day/week), and one or more growth actions (design "Stage
 * responsibilities" · R2.1).
 *
 * Like every other Auto Pilot stage, StrategyService is an **orchestrator**, not
 * a re-implementation: it derives the Strategy with a single LLM call through the
 * existing `aiServiceManager.generateJSON`, tagged for credit/usage attribution
 * via `withAIFeature('autopilot.strategy', { userId, workspaceId }, …)` (design
 * table · R14.2). The LLM transport and the audit transport are injected as ports
 * (with the real singletons as defaults) so the timeout / failure / reduced-input
 * logic is fully unit-testable without a network, a database, or a real provider.
 *
 * ── 300-second bound (R2.1) ─────────────────────────────────────────────────
 * A Mission must produce its Strategy "within 300 seconds". `deriveStrategy`
 * races the LLM call against a configurable deadline (default 300s); if the model
 * has not returned in time the call is aborted (its `AbortSignal` is triggered)
 * and the run is treated as a failure that retries on the next tick — the loop is
 * never left hanging on a slow provider.
 *
 * ── Retry-next-tick on failure (R2.4) ───────────────────────────────────────
 * Strategy generation must never terminate the Mission. If the LLM throws, times
 * out, or returns a payload missing the required Strategy fields, `deriveStrategy`
 *   1. records the failure in an Audit_Record (stage `THINK`, outcome `failure`),
 *      and
 *   2. returns `{ status: 'retry-next-tick' }` instead of throwing,
 * so the orchestrator simply retries generation on the next Operating-Loop
 * iteration (R2.4). It never throws to the caller.
 *
 * ── Revision from measured results (R2.6) ───────────────────────────────────
 * When an iteration begins for an active Mission, the Strategy is revised using
 * the measured results from the most recent MEASURE stage. `deriveStrategy` feeds
 * the Mission's prior `strategy`, its `strategyMemory` (LEARN insights), and its
 * recent `progress` history into the prompt so the model refines rather than
 * regenerates from scratch.
 *
 * ── Reduced-inputs propagation (R2.3) ───────────────────────────────────────
 * The Strategy carries a `reducedInputs` flag mirroring `SenseResult.reducedInputs`
 * so a Strategy derived while analytics or research was unavailable is marked as
 * "generated with reduced inputs" for downstream stages and narration.
 *
 * Satisfies Requirements: 2.1, 2.4, 2.6
 */

import { logger } from '../../../../config/logger'
import { aiServiceManager, type UserAIPreferences } from '../../../../services/AIServiceManager'
import { withAIFeature } from '../../../../services/aiUsageTracker'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from '../AutoPilotAuditService'
import type { SenseResult } from './SenseService'

const COMPONENT = 'autopilot.StrategyService'

/** The AI-feature label used to attribute THINK-stage credit spend (R14.2). */
export const STRATEGY_AI_FEATURE = 'autopilot.strategy'

/** R2.1: a Strategy must be produced within 300 seconds. */
export const STRATEGY_TIMEOUT_MS = 300_000

/** The cadence portion of a Strategy: a post count per time period (R2.1). */
export interface StrategyCadence {
  postsPer: 'day' | 'week'
  count: number
}

/** The THINK output (design `Strategy`). */
export interface Strategy {
  /** One or more content themes (R2.1). */
  themes: string[]
  /** Posting cadence expressed as a number of posts per period (R2.1). */
  cadence: StrategyCadence
  /** One or more growth actions (R2.1). */
  growthActions: string[]
  /** `true` when SENSE degraded on an input (R2.3). */
  reducedInputs: boolean
}

/**
 * The minimal shape of a Mission THINK needs. Accepting a structural type rather
 * than the full Mongoose document keeps the stage decoupled from persistence and
 * unit-testable with plain objects.
 */
export interface StrategyMissionInput {
  /** Mission id — scopes the Audit_Records THINK writes. */
  _id: unknown
  /** Workspace the mission is bound to; used for credit attribution (R14.2). */
  workspaceId: unknown
  /** The goal being decomposed into a Strategy (R2.1). */
  goal: {
    metric: 'followers' | 'engagement' | 'reach'
    targetValue: number
    targetDate?: Date
    startValue?: number
  }
  /** Niche the Strategy is built around. */
  niche: string
  /** Brand voice the Strategy must respect. */
  brandVoice: string
  /** Account local language; strategy narration/themes honour it when present (R9). */
  localLanguage?: string
  /** The previous Strategy, revised each iteration from the latest MEASURE (R2.6). */
  strategy?: Partial<Strategy> | Record<string, unknown>
  /** LEARN insights feeding the next THINK (R2.6). */
  strategyMemory?: Record<string, unknown>[]
  /** Recent MEASURE progress history feeding the next THINK (R2.6). */
  progress?: { at: Date; value: number }[]
}

/** Per-call options for {@link StrategyService.deriveStrategy}. */
export interface DeriveStrategyOptions {
  /** User to attribute the AI spend to via `withAIFeature` (R14.2). */
  userId?: string
  /** Override the 300s deadline (R2.1). Defaults to {@link STRATEGY_TIMEOUT_MS}. */
  timeoutMs?: number
}

/** The result of one THINK run. */
export interface DeriveStrategyResult {
  /** `ok` when a valid Strategy was derived; `retry-next-tick` on failure (R2.4). */
  status: 'ok' | 'retry-next-tick'
  /** The derived Strategy, present when `status === 'ok'`. */
  strategy?: Strategy
  /** Failure detail recorded in the Audit_Record, present on `retry-next-tick`. */
  error?: string
}

/**
 * LLM transport port for THINK. Defaults to `aiServiceManager.generateJSON`,
 * which honours the `signal` used to enforce the 300s bound.
 */
export interface StrategyJSONGenerator {
  generateJSON(
    prompt: string,
    preferences?: UserAIPreferences,
    options?: { signal?: AbortSignal },
  ): Promise<any>
}

/** Tunable dependencies for the THINK stage. */
export interface StrategyServiceOptions {
  /** LLM transport (defaults to the shared `aiServiceManager`). */
  generator?: StrategyJSONGenerator
  /** Audit transport for failure records (defaults to the shared service). */
  auditService?: Pick<AutoPilotAuditService, 'record'>
  /** The 300s bound (R2.1); overridable for tests. Defaults to {@link STRATEGY_TIMEOUT_MS}. */
  timeoutMs?: number
}

const defaultGenerator: StrategyJSONGenerator = {
  generateJSON: (prompt, preferences, options) =>
    aiServiceManager.generateJSON(prompt, preferences ?? {}, options ?? {}),
}

/** Error thrown internally when the LLM does not respond within the bound (R2.1). */
class StrategyTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`strategy generation exceeded ${timeoutMs}ms bound`)
    this.name = 'StrategyTimeoutError'
  }
}

/** A non-empty, trimmed string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Coerce an unknown into a list of non-empty trimmed strings. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(isNonEmptyString).map((s) => s.trim())
}

/**
 * THINK stage — derives a Strategy from the Goal + SenseResult via one LLM call,
 * bounded to 300s, degrading to retry-next-tick on any failure (R2.1, R2.4, R2.6).
 */
export class StrategyService {
  private readonly generator: StrategyJSONGenerator
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>
  private readonly timeoutMs: number

  constructor(options: StrategyServiceOptions = {}) {
    this.generator = options.generator ?? defaultGenerator
    this.auditService = options.auditService ?? autoPilotAuditService
    this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? STRATEGY_TIMEOUT_MS))
  }

  /**
   * Derive (or revise) the Strategy for a Mission (R2.1, R2.6).
   *
   * Runs one `generateJSON` call under `withAIFeature('autopilot.strategy', …)`,
   * bounded to 300s (R2.1). On success returns `{ status: 'ok', strategy }` with
   * the `reducedInputs` flag mirrored from SENSE (R2.3). On any failure — the LLM
   * throwing, timing out, or returning an invalid payload — records the failure in
   * an Audit_Record and returns `{ status: 'retry-next-tick' }` without throwing,
   * so the Mission simply retries on the next iteration (R2.4).
   */
  async deriveStrategy(
    mission: StrategyMissionInput,
    senseResult: SenseResult,
    options: DeriveStrategyOptions = {},
  ): Promise<DeriveStrategyResult> {
    const workspaceId = String(mission.workspaceId)
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? this.timeoutMs))
    const reducedInputs = (senseResult.reducedInputs?.length ?? 0) > 0

    try {
      const prompt = this.buildPrompt(mission, senseResult)

      // R14.2: attribute the spend to the mission's workspace/user. withAIFeature
      // only sets the async context, so the promise it returns is the LLM call.
      const raw = await withAIFeature(
        STRATEGY_AI_FEATURE,
        { userId: options.userId, workspaceId },
        () =>
          this.withTimeout(
            (signal) => this.generator.generateJSON(prompt, this.preferences(mission), { signal }),
            timeoutMs,
          ),
      )

      const strategy = this.parseStrategy(raw, reducedInputs)
      if (!strategy) {
        throw new Error('strategy response missing themes, cadence, or growth actions')
      }

      logger.info('THINK: derived strategy', {
        component: COMPONENT,
        missionId: String(mission._id),
        themes: strategy.themes.length,
        cadence: `${strategy.cadence.count}/${strategy.cadence.postsPer}`,
        growthActions: strategy.growthActions.length,
        reducedInputs: strategy.reducedInputs,
      })

      return { status: 'ok', strategy }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('THINK: strategy generation failed — retrying next iteration', {
        component: COMPONENT,
        missionId: String(mission._id),
        workspaceId,
        error: message,
      })
      // R2.4: record the failure and retry on the next tick — never terminate.
      await this.recordFailure(mission, workspaceId, message, reducedInputs)
      return { status: 'retry-next-tick', error: message }
    }
  }

  /**
   * Run the LLM call with a hard deadline (R2.1). Races the provided operation
   * against a timer; when the timer wins, the operation's `AbortSignal` is
   * triggered so the provider call can cancel, and a {@link StrategyTimeoutError}
   * rejects the race. The timer is always cleared.
   */
  private async withTimeout<T>(
    op: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new StrategyTimeoutError(timeoutMs))
      }, timeoutMs)
    })

    try {
      return await Promise.race([op(controller.signal), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Validate + normalise the raw LLM payload into a {@link Strategy}. Returns
   * `null` when the payload is missing any required field (≥1 theme, a cadence
   * with a positive count and a `day`/`week` period, ≥1 growth action) so the
   * caller treats it as a failure and retries next tick (R2.4).
   */
  private parseStrategy(raw: unknown, reducedInputs: boolean): Strategy | null {
    if (!raw || typeof raw !== 'object') return null
    const obj = raw as Record<string, unknown>

    const themes = toStringList(obj.themes)
    const growthActions = toStringList(obj.growthActions)
    if (themes.length === 0 || growthActions.length === 0) return null

    const cadence = this.parseCadence(obj.cadence)
    if (!cadence) return null

    return { themes, cadence, growthActions, reducedInputs }
  }

  /** Validate the cadence object: a positive integer count per `day`|`week`. */
  private parseCadence(value: unknown): StrategyCadence | null {
    if (!value || typeof value !== 'object') return null
    const c = value as Record<string, unknown>
    const postsPer = c.postsPer === 'day' || c.postsPer === 'week' ? c.postsPer : null
    const count = typeof c.count === 'number' && Number.isFinite(c.count) ? Math.floor(c.count) : NaN
    if (!postsPer || !(count >= 1)) return null
    return { postsPer, count }
  }

  /**
   * Map the Mission's AI preferences for the generation call. The account's
   * local language becomes the target language so themes/actions honour R9 when
   * a language is configured.
   */
  private preferences(mission: StrategyMissionInput): UserAIPreferences {
    const preferences: UserAIPreferences = {}
    if (isNonEmptyString(mission.localLanguage)) {
      preferences.multilingual = mission.localLanguage
    }
    return preferences
  }

  /**
   * Build the THINK prompt: decompose the Goal into themes + cadence + growth
   * actions, grounded in the SENSE analytics/research, and revised from the prior
   * strategy + LEARN memory + recent progress (R2.6). Requests a strict JSON shape.
   */
  private buildPrompt(mission: StrategyMissionInput, senseResult: SenseResult): string {
    const { goal } = mission
    const targetDate = goal.targetDate ? new Date(goal.targetDate).toISOString() : 'no fixed date'
    const analytics = senseResult.analytics
      ? JSON.stringify(senseResult.analytics)
      : 'unavailable (generate from remaining inputs)'
    const research = senseResult.research
      ? JSON.stringify({
          answer: senseResult.research.answer,
          keyPoints: senseResult.research.keyPoints,
          trends: senseResult.research.trends,
        })
      : 'unavailable (generate from remaining inputs)'
    const priorStrategy = mission.strategy ? JSON.stringify(mission.strategy) : 'none (first iteration)'
    const memory =
      mission.strategyMemory && mission.strategyMemory.length > 0
        ? JSON.stringify(mission.strategyMemory)
        : 'none'
    const progress =
      mission.progress && mission.progress.length > 0
        ? JSON.stringify(mission.progress.slice(-10))
        : 'none'
    const language = isNonEmptyString(mission.localLanguage) ? mission.localLanguage : 'English'

    return [
      'You are the strategy engine for an autonomous Instagram growth agent.',
      'Decompose the creator\'s goal into a concrete, rolling content and growth strategy.',
      '',
      `GOAL: reach ${goal.targetValue} ${goal.metric} (currently ${goal.startValue ?? 0}) by ${targetDate}.`,
      `NICHE: ${mission.niche}`,
      `BRAND VOICE: ${mission.brandVoice}`,
      `OUTPUT LANGUAGE for themes and growth actions: ${language}`,
      '',
      `CURRENT ANALYTICS: ${analytics}`,
      `NICHE TREND RESEARCH: ${research}`,
      '',
      'When revising, refine (do not discard) the prior strategy using what the measured results show:',
      `PRIOR STRATEGY: ${priorStrategy}`,
      `LEARNED INSIGHTS: ${memory}`,
      `RECENT PROGRESS: ${progress}`,
      '',
      'Respond with ONLY a JSON object of this exact shape:',
      '{',
      '  "themes": string[],            // one or more content themes',
      '  "cadence": { "postsPer": "day" | "week", "count": number },  // posts per period, count >= 1',
      '  "growthActions": string[]      // one or more concrete growth actions',
      '}',
    ].join('\n')
  }

  /**
   * Record a Strategy-generation failure in an Audit_Record (R2.4). Best-effort:
   * the audit service already retries + escalates on a write failure, and THINK
   * swallows any residual error so recording a failure never itself crashes the
   * loop.
   */
  private async recordFailure(
    mission: StrategyMissionInput,
    workspaceId: string,
    detail: string,
    reducedInputs: boolean,
  ): Promise<void> {
    try {
      await this.auditService.record({
        missionId: mission._id,
        workspaceId,
        stage: 'THINK',
        action: 'think.strategy-failed',
        outcome: 'failure',
        reversible: false,
        triggeringContext: { detail, reducedInputs, niche: mission.niche },
      })
    } catch (error) {
      logger.warn('THINK: failed to record strategy-failure audit', {
        component: COMPONENT,
        missionId: String(mission._id),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Shared default instance wired to the real AI + audit services. */
export const strategyService = new StrategyService()
