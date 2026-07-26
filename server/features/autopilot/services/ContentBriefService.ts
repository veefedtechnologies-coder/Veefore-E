/**
 * Auto Pilot — ContentBriefService.generateBrief (Content-Brief flow · PLAN).
 *
 * The just-in-time Content_Brief is Auto Pilot's signature capability: instead of
 * forcing the user to upload media upfront, when a future Content_Slot needs
 * user-created media that is not in the Media_Pool, Auto Pilot generates a
 * **Content_Brief** — a concept, a hook, a shot list, step-by-step creation
 * instructions, and a suggested caption — and sends it ahead of time so the user
 * can shoot the right content without ever missing a slot (design
 * "ContentBriefService" · R7.1).
 *
 * `generateBrief(mission, slot)` produces + persists that brief for a single
 * user-brief slot. Like every other Auto Pilot stage it is an **orchestrator**,
 * not a re-implementation: it drafts the brief with one LLM call through the
 * shared `aiServiceManager.generateJSON`, tagged for credit/usage attribution via
 * `withAIFeature('autopilot.brief', { userId, workspaceId }, …)` (design table ·
 * R14.2), and follows the StrategyService LLM + timeout + audit pattern so the
 * generation / failure / persistence logic is fully unit-testable without a
 * network, a database, or a real provider.
 *
 * ── Local language (R9.3 / R9.4) ────────────────────────────────────────────
 * The brief is authored in the Mission account's configured local language; when
 * no language is configured it defaults to English (R9.4). The chosen language is
 * both sent to the model (as the generation preference and in the prompt) and
 * stored on the persisted `ContentBrief.language` so downstream delivery honours
 * it.
 *
 * ── Escalate on generation failure (R7.9) ───────────────────────────────────
 * Content_Brief generation must never crash the Operating Loop. If the LLM throws,
 * times out, returns a payload missing a required brief field, or the persist
 * fails, `generateBrief`
 *   1. records the failure in an Audit_Record (stage `PLAN`, outcome `failure`),
 *   2. creates an Escalation by delivering a User_Input_Notification through the
 *      {@link NotificationDispatcher}, and
 *   3. returns `{ status: 'escalated' }` instead of throwing,
 * so the caller can surface the escalation and retry on a later iteration (R7.9).
 *
 * All transports (LLM, brief persistence, audit, notifications, lead-time) are
 * injected as ports with the real singletons as defaults, keeping the whole flow
 * testable in isolation.
 *
 * Satisfies Requirements: 7.1, 7.9, 9.3
 */

import { logger } from '../../../config/logger'
import { aiServiceManager, type UserAIPreferences } from '../../../services/AIServiceManager'
import { withAIFeature } from '../../../services/aiUsageTracker'
import {
  ContentBriefModel,
  type ContentFormat,
  type IContentBrief,
} from '../db/models'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from './AutoPilotAuditService'
import {
  NotificationDispatcher,
  notificationDispatcher,
  type SessionContext,
} from './NotificationDispatcher'
import {
  LeadTimeEstimator,
  leadTimeEstimator,
  type ContentComplexity,
} from './LeadTimeEstimator'

const COMPONENT = 'autopilot.ContentBriefService'

/** The AI-feature label used to attribute Content-Brief credit spend (R14.2). */
export const BRIEF_AI_FEATURE = 'autopilot.brief'

/** Bound on brief generation so a slow provider never hangs the loop. */
export const BRIEF_TIMEOUT_MS = 120_000

/** R9.4: default language when the Mission account has none configured. */
export const DEFAULT_BRIEF_LANGUAGE = 'English'

/** R7.6: the fallback deadline offset — publish time minus 30 minutes. */
export const FALLBACK_DEADLINE_OFFSET_MS = 30 * 60 * 1000

/**
 * Content-creation complexity per format, feeding {@link LeadTimeEstimator} so a
 * brief carries the Lead_Time its media realistically needs (R7.2). Kept as data
 * (not branching logic) and local to this service to avoid coupling to PLAN.
 */
export const DEFAULT_FORMAT_COMPLEXITY: Record<ContentFormat, ContentComplexity> = {
  photo: 'low',
  story: 'low',
  carousel: 'med',
  reel: 'high',
}

/**
 * The minimal shape of a Mission the brief needs. Accepting a structural type
 * rather than the full Mongoose document keeps the stage decoupled from
 * persistence and unit-testable with plain objects.
 */
export interface BriefMissionInput {
  /** Mission id — scopes the persisted brief + its Audit_Records. */
  _id: unknown
  /** Workspace the mission is bound to; used for credit attribution (R14.2). */
  workspaceId: unknown
  /** Niche the brief is built around. */
  niche: string
  /** Brand voice the brief must respect. */
  brandVoice: string
  /** Account local language; the brief is authored in it (R9.3), else English (R9.4). */
  localLanguage?: string
  /** The goal the content ultimately serves, grounding the concept/hook. */
  goal: { metric: 'followers' | 'engagement' | 'reach'; targetValue: number }
}

/** The minimal shape of the Content_Slot a brief is generated for. */
export interface BriefSlotInput {
  /** Persisted `ContentSlot._id`. */
  _id: unknown
  /** Content format the user must create. */
  format: ContentFormat
  /** Strategy theme assigned to the slot. */
  theme: string
  /** Scheduled publish time; anchors the send + fallback deadlines (R7.3/R7.6). */
  scheduledAt: Date
  /** Optional complexity override; defaults from {@link DEFAULT_FORMAT_COMPLEXITY}. */
  complexity?: ContentComplexity
}

/**
 * Who to notify if generation fails (R7.9). The dispatcher needs a user to
 * notify; the optional session hints let the escalation route to mobile FCM /
 * email as Requirement 15 defines.
 */
export interface BriefEscalationTarget {
  /** The user to notify that the brief could not be generated. */
  userId: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token, when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** Per-call options for {@link ContentBriefService.generateBrief}. */
export interface GenerateBriefOptions {
  /** User to attribute the AI spend to via `withAIFeature` (R14.2). */
  userId?: string
  /** Override the generation deadline. Defaults to {@link BRIEF_TIMEOUT_MS}. */
  timeoutMs?: number
  /** Injectable "current time" (ms) for deterministic tests. Defaults to `Date.now()`. */
  now?: number
  /** Where to send the Escalation + User_Input_Notification on failure (R7.9). */
  escalationTarget?: BriefEscalationTarget
}

/** The validated + normalised brief content produced by the LLM. */
export interface BriefContent {
  concept: string
  hook: string
  shotList: string[]
  instructions: string
  suggestedCaption: string
}

/** The result of one `generateBrief` run. */
export type GenerateBriefResult =
  /** A valid brief was generated + persisted. */
  | { status: 'ok'; brief: IContentBrief }
  /** Generation failed → failure audited + Escalation dispatched (R7.9). */
  | { status: 'escalated'; error: string }

/**
 * LLM transport port for the brief. Defaults to `aiServiceManager.generateJSON`,
 * which honours the `signal` used to enforce the generation deadline.
 */
export interface BriefJSONGenerator {
  generateJSON(
    prompt: string,
    preferences?: UserAIPreferences,
    options?: { signal?: AbortSignal },
  ): Promise<any>
}

/**
 * Write port for persisting a Content_Brief. Defaults to `ContentBriefModel.create`.
 * Isolating the write behind a port keeps generation testable without a database.
 */
export interface BriefStore {
  create(doc: Partial<IContentBrief>): Promise<IContentBrief>
}

/** Tunable dependencies for the Content-Brief stage. */
export interface ContentBriefServiceOptions {
  /** LLM transport (defaults to the shared `aiServiceManager`). */
  generator?: BriefJSONGenerator
  /** Brief persistence (defaults to `ContentBriefModel.create`). */
  briefStore?: BriefStore
  /** Audit transport for failure records (defaults to the shared service). */
  auditService?: Pick<AutoPilotAuditService, 'record'>
  /** Escalation transport for the failure notification (defaults to the shared dispatcher). */
  dispatcher?: Pick<NotificationDispatcher, 'dispatch'>
  /** Lead-time estimator (defaults to the shared `leadTimeEstimator`). */
  leadTimeEstimator?: Pick<LeadTimeEstimator, 'estimate'>
  /** The generation deadline (ms); overridable for tests. Defaults to {@link BRIEF_TIMEOUT_MS}. */
  timeoutMs?: number
}

const defaultGenerator: BriefJSONGenerator = {
  generateJSON: (prompt, preferences, options) =>
    aiServiceManager.generateJSON(prompt, preferences ?? {}, options ?? {}),
}

const defaultBriefStore: BriefStore = {
  async create(doc: Partial<IContentBrief>): Promise<IContentBrief> {
    return (await ContentBriefModel.create(doc)) as unknown as IContentBrief
  },
}

/** Error thrown internally when the LLM does not respond within the bound. */
class BriefTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`content brief generation exceeded ${timeoutMs}ms bound`)
    this.name = 'BriefTimeoutError'
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
 * Content-Brief stage — generates + persists a Content_Brief for a user-brief
 * slot via one LLM call in the mission's local language, escalating (never
 * crashing) on any generation failure (R7.1, R7.9, R9.3).
 */
export class ContentBriefService {
  private readonly generator: BriefJSONGenerator
  private readonly briefStore: BriefStore
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>
  private readonly dispatcher: Pick<NotificationDispatcher, 'dispatch'>
  private readonly leadTime: Pick<LeadTimeEstimator, 'estimate'>
  private readonly timeoutMs: number

  constructor(options: ContentBriefServiceOptions = {}) {
    this.generator = options.generator ?? defaultGenerator
    this.briefStore = options.briefStore ?? defaultBriefStore
    this.auditService = options.auditService ?? autoPilotAuditService
    this.dispatcher = options.dispatcher ?? notificationDispatcher
    this.leadTime = options.leadTimeEstimator ?? leadTimeEstimator
    this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? BRIEF_TIMEOUT_MS))
  }

  /**
   * Generate + persist a Content_Brief for a user-brief slot (R7.1, R9.3).
   *
   * Runs one `generateJSON` call under `withAIFeature('autopilot.brief', …)`
   * bounded by the generation deadline, authored in the Mission's local language
   * (R9.3, English by default per R9.4). On success persists a `ContentBrief`
   * (status `pending`) carrying the five brief fields, its language, the computed
   * Lead_Time, and the send + fallback deadlines, and returns
   * `{ status: 'ok', brief }`.
   *
   * On any failure — the LLM throwing, timing out, returning an invalid payload,
   * or the persist failing — records the failure in an Audit_Record, dispatches
   * an Escalation + User_Input_Notification, and returns `{ status: 'escalated' }`
   * without throwing (R7.9).
   */
  async generateBrief(
    mission: BriefMissionInput,
    slot: BriefSlotInput,
    options: GenerateBriefOptions = {},
  ): Promise<GenerateBriefResult> {
    const workspaceId = String(mission.workspaceId)
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? this.timeoutMs))
    const now = options.now ?? Date.now()
    const language = isNonEmptyString(mission.localLanguage)
      ? mission.localLanguage.trim()
      : DEFAULT_BRIEF_LANGUAGE

    try {
      const prompt = this.buildPrompt(mission, slot, language)

      // R14.2: attribute the spend to the mission's workspace/user. withAIFeature
      // only sets the async context, so the promise it returns is the LLM call.
      const raw = await withAIFeature(
        BRIEF_AI_FEATURE,
        { userId: options.userId, workspaceId },
        () =>
          this.withTimeout(
            (signal) => this.generator.generateJSON(prompt, this.preferences(language), { signal }),
            timeoutMs,
          ),
      )

      const content = this.parseBrief(raw)
      if (!content) {
        throw new Error('content brief response missing concept, hook, shot list, instructions, or caption')
      }

      const brief = await this.persist(mission, slot, content, language, now)

      logger.info('PLAN: generated content brief', {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
        format: slot.format,
        language,
        shots: content.shotList.length,
      })

      return { status: 'ok', brief }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('PLAN: content brief generation failed — escalating', {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
        workspaceId,
        error: message,
      })
      // R7.9: record the failure, create an Escalation + User_Input_Notification.
      await this.escalate(mission, slot, workspaceId, message, options.escalationTarget)
      return { status: 'escalated', error: message }
    }
  }

  /**
   * Run the LLM call with a hard deadline. Races the operation against a timer;
   * when the timer wins, the operation's `AbortSignal` is triggered so the
   * provider call can cancel, and a {@link BriefTimeoutError} rejects the race.
   * The timer is always cleared.
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
        reject(new BriefTimeoutError(timeoutMs))
      }, timeoutMs)
    })

    try {
      return await Promise.race([op(controller.signal), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Validate + normalise the raw LLM payload into a {@link BriefContent}. Returns
   * `null` when any required field is missing (concept, hook, ≥1 shot, step-by-step
   * instructions, suggested caption) so the caller treats it as a generation
   * failure and escalates (R7.9).
   */
  private parseBrief(raw: unknown): BriefContent | null {
    if (!raw || typeof raw !== 'object') return null
    const obj = raw as Record<string, unknown>

    const concept = isNonEmptyString(obj.concept) ? obj.concept.trim() : null
    const hook = isNonEmptyString(obj.hook) ? obj.hook.trim() : null
    const instructions = isNonEmptyString(obj.instructions) ? obj.instructions.trim() : null
    const suggestedCaption = isNonEmptyString(obj.suggestedCaption)
      ? obj.suggestedCaption.trim()
      : null
    const shotList = toStringList(obj.shotList)

    if (!concept || !hook || !instructions || !suggestedCaption || shotList.length === 0) {
      return null
    }

    return { concept, hook, shotList, instructions, suggestedCaption }
  }

  /**
   * Persist the generated brief as a `ContentBrief` (status `pending`). Computes
   * the Lead_Time from the slot's format complexity (R7.2) and derives the send
   * time (`publish − leadTime`, R7.3) and fallback deadline (`publish − 30m`,
   * R7.6) so the brief is ready for the delivery worker.
   */
  private async persist(
    mission: BriefMissionInput,
    slot: BriefSlotInput,
    content: BriefContent,
    language: string,
    now: number,
  ): Promise<IContentBrief> {
    const complexity = slot.complexity ?? DEFAULT_FORMAT_COMPLEXITY[slot.format]
    const leadTimeMs = this.leadTime.estimate(slot.format, complexity)
    const publishMs = slot.scheduledAt.getTime()

    // Deadlines can be in the past for an imminent slot; that is acceptable — the
    // delivery worker treats an already-due send/fallback as immediately actionable.
    const sendAt = new Date(publishMs - leadTimeMs)
    const fallbackDeadline = new Date(publishMs - FALLBACK_DEADLINE_OFFSET_MS)

    return this.briefStore.create({
      missionId: mission._id as IContentBrief['missionId'],
      slotId: slot._id as IContentBrief['slotId'],
      workspaceId: mission.workspaceId,
      concept: content.concept,
      hook: content.hook,
      shotList: content.shotList,
      instructions: content.instructions,
      suggestedCaption: content.suggestedCaption,
      language,
      leadTimeMs,
      sendAt,
      fallbackDeadline,
      remindersSent: 0,
      status: 'pending',
    } as Partial<IContentBrief>)
  }

  /**
   * Map the target language onto the generation preferences so the model authors
   * the brief in the Mission's local language (R9.3).
   */
  private preferences(language: string): UserAIPreferences {
    const preferences: UserAIPreferences = {}
    if (language && language !== DEFAULT_BRIEF_LANGUAGE) {
      preferences.multilingual = language
    }
    return preferences
  }

  /**
   * Build the brief prompt: turn the slot's theme + format into a concrete,
   * shootable creative package (concept, hook, shot list, step-by-step
   * instructions, suggested caption) grounded in the niche/brand voice/goal and
   * authored in the target language (R7.1, R9.3). Requests a strict JSON shape.
   */
  private buildPrompt(mission: BriefMissionInput, slot: BriefSlotInput, language: string): string {
    return [
      'You are the creative director for an autonomous Instagram growth agent.',
      'Write a just-in-time content brief telling the creator exactly what to shoot',
      'for one upcoming post, so they can produce the right media without guesswork.',
      '',
      `FORMAT: ${slot.format}`,
      `THEME: ${slot.theme}`,
      `NICHE: ${mission.niche}`,
      `BRAND VOICE: ${mission.brandVoice}`,
      `GOAL: grow ${mission.goal.metric} toward ${mission.goal.targetValue}.`,
      `OUTPUT LANGUAGE (write ALL fields in this language): ${language}`,
      '',
      'Respond with ONLY a JSON object of this exact shape:',
      '{',
      '  "concept": string,            // the creative concept for the post',
      '  "hook": string,               // the opening hook that stops the scroll',
      '  "shotList": string[],         // one or more specific shots to capture',
      '  "instructions": string,       // step-by-step creation instructions',
      '  "suggestedCaption": string    // a suggested caption in the brand voice',
      '}',
    ].join('\n')
  }

  /**
   * Escalate a brief-generation failure (R7.9): record a PLAN-stage failure
   * Audit_Record and dispatch an Escalation + User_Input_Notification. Best-effort
   * — any transport error is swallowed so escalating a failure never itself
   * crashes the loop.
   */
  private async escalate(
    mission: BriefMissionInput,
    slot: BriefSlotInput,
    workspaceId: string,
    detail: string,
    target?: BriefEscalationTarget,
  ): Promise<void> {
    // 1) Record the failure in an Audit_Record (R7.9). Pass the escalation target
    //    so a failed audit write still notifies the user (R17.2).
    try {
      await this.auditService.record(
        {
          missionId: mission._id,
          workspaceId,
          stage: 'PLAN',
          action: 'plan.brief-failed',
          outcome: 'failure',
          reversible: false,
          triggeringContext: {
            detail,
            slotId: String(slot._id),
            format: slot.format,
            theme: slot.theme,
          },
        },
        target
          ? {
              userId: target.userId,
              sessionContext: target.sessionContext,
              deviceToken: target.deviceToken,
              email: target.email,
            }
          : undefined,
      )
    } catch (error) {
      logger.warn('PLAN: failed to record brief-failure audit', {
        component: COMPONENT,
        missionId: String(mission._id),
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // 2) Create the Escalation: deliver a User_Input_Notification (R7.9).
    if (!target) {
      logger.error('PLAN: brief generation failed with no escalation target', undefined, {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
      })
      return
    }

    try {
      await this.dispatcher.dispatch({
        userId: target.userId,
        workspaceId,
        title: 'Auto Pilot needs your input',
        message:
          `Auto Pilot could not generate the content brief for your upcoming ${slot.format} ` +
          `("${slot.theme}"). Your input is needed to keep the slot on track.`,
        type: 'alert',
        sessionContext: target.sessionContext,
        deviceToken: target.deviceToken,
        email: target.email,
      })
    } catch (error) {
      logger.error('PLAN: brief-failure escalation dispatch failed', error, {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
      })
    }
  }
}

/** Shared default instance wired to the real AI + persistence + audit services. */
export const contentBriefService = new ContentBriefService()
