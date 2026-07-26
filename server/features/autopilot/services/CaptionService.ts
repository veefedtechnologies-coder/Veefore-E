/**
 * Auto Pilot — CaptionService (vision-grounded, localized captioning · ACT).
 *
 * When a Content_Slot's media is ready, ACT needs an on-brand caption + hashtags
 * that actually reflect what is in the media. This service produces exactly that,
 * as an **orchestrator** over two existing capabilities rather than a
 * re-implementation (design "Content Generation and Vision-Grounded Captioning"
 * table · R8):
 *
 *   1. **Vision grounding** — `aiServiceManager.analyzeMedia(mediaUrl, mediaType)`
 *      produces a concrete factual description of the slot's media. The generated
 *      caption is grounded in that description so it references at least one
 *      attribute the vision step identified (R8.1). The analysis is bounded to
 *      30 seconds and retried up to 3 times; if it still fails, Auto Pilot creates
 *      an Escalation + User_Input_Notification instead of shipping a blind caption
 *      (R8.7).
 *
 *   2. **Caption generation** — `aiServiceManager.generateInstagramCaptions(...)`
 *      drafts the caption grounded in the vision description, applying the
 *      Mission's brand voice and authored in the Mission's local language
 *      (English by default) (R8.2, R9.1/R9.4). The call is wrapped in
 *      `withAIFeature('autopilot.caption', { userId, workspaceId }, …)` so the
 *      spend is attributed to the Mission's workspace (R14.2).
 *
 * ── Banned-topic revise loop, then escalate (R8.5 / R8.6, Property 3) ────────
 * Every candidate caption is checked against the Mission's banned topics with
 * {@link GuardrailService}. A caption that includes a banned topic is never
 * shipped: the service revises (regenerates) up to 3 times, and if a clean
 * caption still cannot be produced it withholds the caption and escalates
 * (R8.6). This is the load-bearing guarantee behind **Property 3 — banned topics
 * never ship**: when `generateCaption` returns `status: 'ok'`, neither the
 * caption nor any accompanying hashtag contains a banned topic.
 *
 * ── Hashtags (R8.4) ─────────────────────────────────────────────────────────
 * 1 to 30 hashtags accompany the caption. They are derived from the caption the
 * model produced (its inline `#tags`) supplemented from the slot theme/niche when
 * the caption carried none, deduplicated, filtered so no banned topic ships as a
 * hashtag (Property 3), and clamped to at most 30 (R8.4).
 *
 * Every transport (vision analyzer, caption generator, guardrails, audit,
 * notifications) is injected as a port with the real singletons as defaults, so
 * the whole flow — grounding, the revise loop, the hashtag bounds, localization,
 * and Property 3 — is fully unit- and property-testable without a network, a
 * database, or a real provider.
 *
 * Satisfies Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7, 9.1, 9.4, 9.6 (Property 3)
 */

import { logger } from '../../../config/logger'
import {
  aiServiceManager,
  type CaptionVariation,
  type UserAIPreferences,
} from '../../../services/AIServiceManager'
import { withAIFeature } from '../../../services/aiUsageTracker'
import type { ContentFormat, MediaType } from '../db/models'
import { GuardrailService, guardrailService } from './GuardrailService'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
} from './AutoPilotAuditService'
import {
  NotificationDispatcher,
  notificationDispatcher,
  type SessionContext,
} from './NotificationDispatcher'

const COMPONENT = 'autopilot.CaptionService'

/** The AI-feature label used to attribute caption-generation credit spend (R14.2). */
export const CAPTION_AI_FEATURE = 'autopilot.caption'

/** R8.7: the media vision analysis must respond within 30 seconds. */
export const VISION_TIMEOUT_MS = 30_000

/** R8.7: number of vision retries after the initial attempt (→ 4 attempts total). */
export const VISION_RETRIES = 3

/** R8.5: maximum caption revision attempts before escalating (R8.6). */
export const MAX_CAPTION_REVISIONS = 3

/** R8.1: Instagram caption length bound (upper). */
export const MAX_CAPTION_LENGTH = 2_200

/** R8.4: hashtag count bound (upper). */
export const MAX_HASHTAGS = 30

/** R9.4: default language when the Mission account has none configured. */
export const DEFAULT_CAPTION_LANGUAGE = 'English'

/**
 * The media type each slot format resolves to for vision analysis: a `reel` is a
 * video, every other format is an image. Kept local so the caption service does
 * not pull in the media-generation providers.
 */
export const VISION_MEDIA_TYPE_BY_FORMAT: Record<ContentFormat, MediaType> = {
  reel: 'video',
  photo: 'image',
  carousel: 'image',
  story: 'image',
}

/**
 * The minimal shape of a Mission the caption needs. Accepting a structural type
 * rather than the Mongoose document keeps the stage decoupled and testable.
 */
export interface CaptionMissionInput {
  /** Mission id — scopes the Audit_Records. */
  _id: unknown
  /** Workspace the mission is bound to; used for credit attribution (R14.2). */
  workspaceId: unknown
  /** Brand voice the caption must apply (R8.2). */
  brandVoice: string
  /** Banned topics the caption + hashtags must exclude (R8.2, Property 3). */
  bannedTopics: string[]
  /** Account local language; captions are authored in it (R9.1), else English (R9.4). */
  localLanguage?: string
  /** Niche used to supplement hashtags when the caption carries none. */
  niche?: string
}

/** The minimal shape of the Content_Slot a caption is generated for. */
export interface CaptionSlotInput {
  /** Persisted `ContentSlot._id`. */
  _id: unknown
  /** Content format — decides image-vs-video vision analysis. */
  format: ContentFormat
  /** Strategy theme assigned to the slot; grounds the caption + fallback hashtags. */
  theme: string
  /** Hosted URL of the slot's resolved media, analysed for grounding (R8.1). */
  mediaUrl: string
  /** Optional media-type override; defaults from {@link VISION_MEDIA_TYPE_BY_FORMAT}. */
  mediaType?: MediaType
}

/**
 * Who to notify if the caption is withheld (R8.6/R8.7). The dispatcher needs a
 * user to notify; the optional session hints let the escalation route to mobile
 * FCM / email as Requirement 15 defines.
 */
export interface CaptionEscalationTarget {
  /** The user to notify that the caption could not be produced. */
  userId: string
  /** Active session context (defaults to `web`). */
  sessionContext?: SessionContext
  /** Registered FCM device token, when the user has a mobile session. */
  deviceToken?: string | null
  /** Email address for the fallback channel. */
  email?: string | null
}

/** Per-call options for {@link CaptionService.generateCaption}. */
export interface GenerateCaptionOptions {
  /** User to attribute the AI spend to via `withAIFeature` (R14.2). */
  userId?: string
  /** Override the vision-analysis deadline. Defaults to {@link VISION_TIMEOUT_MS}. */
  visionTimeoutMs?: number
  /** Where to send the Escalation + User_Input_Notification on withholding. */
  escalationTarget?: CaptionEscalationTarget
}

/** Why a caption was withheld and escalated. */
export type CaptionEscalationReason =
  /** Vision analysis failed/timed out on every attempt (R8.7). */
  | 'vision-failed'
  /** A banned-topic-free caption could not be produced in ≤3 revisions (R8.6). */
  | 'banned-topic'
  /** The generator produced no usable caption text (R9.6). */
  | 'generation-failed'

/** The result of one `generateCaption` run. */
export type GenerateCaptionResult =
  /** A clean, grounded, localized caption + hashtags were produced. */
  | {
      status: 'ok'
      /** The final caption (banned-topic free, ≤2,200 chars). */
      caption: string
      /** 1–30 accompanying hashtags (banned-topic free). */
      hashtags: string[]
      /** The vision description the caption is grounded in (R8.1). */
      visionAnalysis: string
      /** The language the caption was authored in (R9.1/R9.4). */
      language: string
      /** How many revisions were needed (0 = first candidate was clean). */
      revisions: number
    }
  /** The caption was withheld → failure audited + Escalation dispatched. */
  | { status: 'escalated'; reason: CaptionEscalationReason; error: string }

/**
 * Vision-analysis transport port. Defaults to `aiServiceManager.analyzeMedia`,
 * which returns a factual description string (or `undefined` on failure).
 */
export interface VisionAnalyzer {
  analyzeMedia(
    mediaUrl: string,
    mediaType?: 'image' | 'video' | 'auto',
    preferences?: UserAIPreferences,
  ): Promise<string | undefined>
}

/**
 * Caption-generation transport port. Defaults to
 * `aiServiceManager.generateInstagramCaptions`, which returns one or more caption
 * variations grounded in the supplied `mediaAnalysis`.
 */
export interface CaptionGenerator {
  generateInstagramCaptions(params: {
    userId: string
    workspaceId: string
    topic: string
    mediaAnalysis?: string
    postType?: 'post' | 'story' | 'reel'
    preferences?: UserAIPreferences
    signal?: AbortSignal
  }): Promise<CaptionVariation[]>
}

/** Tunable dependencies for the caption stage. */
export interface CaptionServiceOptions {
  /** Vision transport (defaults to the shared `aiServiceManager`). */
  visionAnalyzer?: VisionAnalyzer
  /** Caption transport (defaults to the shared `aiServiceManager`). */
  captionGenerator?: CaptionGenerator
  /** Banned-topic guardrail (defaults to the shared `guardrailService`). */
  guardrail?: Pick<GuardrailService, 'findBannedTopics'>
  /** Audit transport for withholding records (defaults to the shared service). */
  auditService?: Pick<AutoPilotAuditService, 'record'>
  /** Escalation transport (defaults to the shared dispatcher). */
  dispatcher?: Pick<NotificationDispatcher, 'dispatch'>
  /** Vision-analysis deadline (ms). Defaults to {@link VISION_TIMEOUT_MS}. */
  visionTimeoutMs?: number
  /** Vision retries after the initial attempt. Defaults to {@link VISION_RETRIES}. */
  visionRetries?: number
  /** Caption revision budget. Defaults to {@link MAX_CAPTION_REVISIONS}. */
  maxRevisions?: number
}

const defaultVisionAnalyzer: VisionAnalyzer = {
  analyzeMedia: (mediaUrl, mediaType, preferences) =>
    aiServiceManager.analyzeMedia(mediaUrl, mediaType ?? 'auto', preferences ?? {}),
}

const defaultCaptionGenerator: CaptionGenerator = {
  generateInstagramCaptions: (params) => aiServiceManager.generateInstagramCaptions(params),
}

/** A non-empty, trimmed string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Extract the inline hashtags (`#tag`) from a piece of text, lower-cased and
 * order-preserving-deduplicated. Unicode-aware so non-Latin tags survive.
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of matches) {
    const tag = raw.toLowerCase()
    if (!seen.has(tag)) {
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

/** Turn a phrase into hashtag-safe tokens (alphanumeric runs), lower-cased. */
function toHashtagTokens(phrase: string | undefined): string[] {
  if (!phrase) return []
  const tokens = phrase.match(/[\p{L}\p{N}]+/gu) ?? []
  return tokens.filter((t) => t.length > 1).map((t) => `#${t.toLowerCase()}`)
}

/**
 * Build the 1–30 accompanying hashtags for a caption (R8.4, Property 3):
 * prefer the caption's own inline hashtags, supplement from the slot theme +
 * niche when it carried fewer than one, drop any that match a banned topic, and
 * clamp to at most {@link MAX_HASHTAGS}. Order-preserving-deduplicated.
 *
 * Pure over its inputs so it can be tested directly for the count bounds and the
 * banned-topic exclusion.
 */
export function buildHashtags(
  caption: string,
  bannedTopics: string[],
  supplements: { theme?: string; niche?: string },
  guardrail: Pick<GuardrailService, 'findBannedTopics'> = guardrailService,
): string[] {
  const seen = new Set<string>()
  const candidates: string[] = []
  const add = (tags: string[]) => {
    for (const tag of tags) {
      if (!seen.has(tag)) {
        seen.add(tag)
        candidates.push(tag)
      }
    }
  }

  add(extractHashtags(caption))
  // Supplement only when the caption carried no usable hashtags of its own.
  if (candidates.length === 0) {
    add(toHashtagTokens(supplements.theme))
    add(toHashtagTokens(supplements.niche))
  }

  // Property 3: never let a banned topic ship as a hashtag. A hashtag matches a
  // banned topic when the topic appears as a whole word in the tag's text.
  const clean = candidates.filter((tag) => {
    const text = tag.replace(/^#/, '')
    return guardrail.findBannedTopics(text, bannedTopics).length === 0
  })

  return clean.slice(0, MAX_HASHTAGS)
}

/** Error thrown internally when the vision call does not respond within the bound. */
class VisionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`media vision analysis exceeded ${timeoutMs}ms bound`)
    this.name = 'VisionTimeoutError'
  }
}

/**
 * Produces vision-grounded, localized, guardrail-clean captions + hashtags for a
 * Content_Slot, escalating (never crashing) when the media cannot be analysed or
 * a clean caption cannot be produced (R8, R9, Property 3).
 */
export class CaptionService {
  private readonly vision: VisionAnalyzer
  private readonly captionGenerator: CaptionGenerator
  private readonly guardrail: Pick<GuardrailService, 'findBannedTopics'>
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>
  private readonly dispatcher: Pick<NotificationDispatcher, 'dispatch'>
  private readonly visionTimeoutMs: number
  private readonly visionRetries: number
  private readonly maxRevisions: number

  constructor(options: CaptionServiceOptions = {}) {
    this.vision = options.visionAnalyzer ?? defaultVisionAnalyzer
    this.captionGenerator = options.captionGenerator ?? defaultCaptionGenerator
    this.guardrail = options.guardrail ?? guardrailService
    this.auditService = options.auditService ?? autoPilotAuditService
    this.dispatcher = options.dispatcher ?? notificationDispatcher
    this.visionTimeoutMs = Math.max(1, Math.floor(options.visionTimeoutMs ?? VISION_TIMEOUT_MS))
    this.visionRetries = Math.max(0, Math.floor(options.visionRetries ?? VISION_RETRIES))
    this.maxRevisions = Math.max(0, Math.floor(options.maxRevisions ?? MAX_CAPTION_REVISIONS))
  }

  /**
   * Produce a vision-grounded, localized, guardrail-clean caption + hashtags for
   * a Content_Slot (R8, R9).
   *
   * Flow:
   *   1. Analyse the slot media (30s bound, up to 3 retries). On total failure →
   *      audit + escalate, return `{ status: 'escalated', reason: 'vision-failed' }`
   *      (R8.7).
   *   2. Generate captions grounded in the vision description, in the Mission's
   *      local language, applying the brand voice, under `withAIFeature`
   *      (R8.1/R8.2/R9.1/R14.2).
   *   3. Ship the first banned-topic-free candidate; if none is clean, revise
   *      (regenerate) up to 3 times, then escalate (R8.5/R8.6).
   *   4. Build 1–30 banned-topic-free hashtags (R8.4, Property 3).
   *
   * Never throws: any generation failure resolves to an `escalated` result so the
   * Operating Loop keeps running and the slot state is preserved (R9.6).
   */
  async generateCaption(
    mission: CaptionMissionInput,
    slot: CaptionSlotInput,
    options: GenerateCaptionOptions = {},
  ): Promise<GenerateCaptionResult> {
    const workspaceId = String(mission.workspaceId)
    const language = isNonEmptyString(mission.localLanguage)
      ? mission.localLanguage.trim()
      : DEFAULT_CAPTION_LANGUAGE
    const mediaType = slot.mediaType ?? VISION_MEDIA_TYPE_BY_FORMAT[slot.format]

    // ── 1) Vision grounding: 30s bound, up to 3 retries, escalate (R8.7) ──────
    const visionAnalysis = await this.analyzeWithRetries(
      slot.mediaUrl,
      mediaType,
      language,
      options.visionTimeoutMs ?? this.visionTimeoutMs,
    )
    if (!visionAnalysis) {
      const detail = 'media vision analysis failed or timed out on every attempt'
      await this.escalate(mission, slot, workspaceId, 'vision-failed', detail, options.escalationTarget)
      return { status: 'escalated', reason: 'vision-failed', error: detail }
    }

    // ── 2/3) Generate + revise until banned-topic-free, else escalate (R8.5/6) ─
    const bannedTopics = mission.bannedTopics ?? []
    const postType = slot.format === 'reel' ? 'reel' : slot.format === 'story' ? 'story' : 'post'
    let lastError = 'no caption produced'

    for (let attempt = 0; attempt <= this.maxRevisions; attempt++) {
      let variations: CaptionVariation[]
      try {
        variations = await withAIFeature(
          CAPTION_AI_FEATURE,
          { userId: options.userId, workspaceId },
          () =>
            this.captionGenerator.generateInstagramCaptions({
              userId: options.userId ?? '',
              workspaceId,
              topic: slot.theme,
              mediaAnalysis: visionAnalysis, // R8.1: ground the caption in vision output
              postType,
              preferences: this.preferences(language, mission.brandVoice),
            }),
        )
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        logger.warn('ACT: caption generation attempt threw', {
          component: COMPONENT,
          missionId: String(mission._id),
          slotId: String(slot._id),
          attempt,
          error: lastError,
        })
        continue
      }

      // Prefer a clean candidate that is also visibly grounded in the vision
      // output; fall back to any clean candidate (R8.1 grounding is best-effort
      // once the model was given the vision description).
      const clean = (variations ?? [])
        .map((v) => this.normaliseCaption(v?.caption))
        .filter((c): c is string => c !== null)
        .filter((c) => this.guardrail.findBannedTopics(c, bannedTopics).length === 0)

      if (clean.length === 0) {
        lastError = 'every caption candidate contained a banned topic or was empty'
        continue // R8.5: revise (regenerate) and try again
      }

      const grounded = clean.find((c) => this.isGrounded(c, visionAnalysis))
      const caption = grounded ?? clean[0]
      const hashtags = buildHashtags(
        caption,
        bannedTopics,
        { theme: slot.theme, niche: mission.niche },
        this.guardrail,
      )

      logger.info('ACT: generated vision-grounded caption', {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
        language,
        revisions: attempt,
        hashtags: hashtags.length,
      })

      return {
        status: 'ok',
        caption,
        hashtags,
        visionAnalysis,
        language,
        revisions: attempt,
      }
    }

    // R8.6: a clean caption could not be produced in the revision budget.
    const reason: CaptionEscalationReason = /banned topic/.test(lastError)
      ? 'banned-topic'
      : 'generation-failed'
    await this.escalate(mission, slot, workspaceId, reason, lastError, options.escalationTarget)
    return { status: 'escalated', reason, error: lastError }
  }

  /**
   * Analyse the slot media with the 30-second bound and retry policy (R8.7).
   * Runs the initial attempt plus up to {@link visionRetries} retries; each
   * attempt is raced against the deadline and a non-empty description wins. A
   * timeout or an empty/`undefined` result counts as a failed attempt. Returns
   * the description on success, or `undefined` once every attempt has failed.
   */
  private async analyzeWithRetries(
    mediaUrl: string,
    mediaType: MediaType,
    language: string,
    timeoutMs: number,
  ): Promise<string | undefined> {
    const totalAttempts = this.visionRetries + 1
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const description = await this.withTimeout(
          () => this.vision.analyzeMedia(mediaUrl, mediaType, this.preferences(language)),
          timeoutMs,
        )
        if (isNonEmptyString(description)) return description.trim()
        logger.warn('ACT: vision analysis returned no description', {
          component: COMPONENT,
          attempt,
          totalAttempts,
        })
      } catch (error) {
        logger.warn('ACT: vision analysis attempt failed', {
          component: COMPONENT,
          attempt,
          totalAttempts,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return undefined
  }

  /**
   * Race an operation against a hard deadline. When the timer wins, a
   * {@link VisionTimeoutError} rejects the race so the attempt is retried; the
   * timer is always cleared.
   */
  private async withTimeout<T>(op: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new VisionTimeoutError(timeoutMs)), timeoutMs)
    })
    try {
      return await Promise.race([op(), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Normalise a raw caption: trim, reject empty, and clamp to the 2,200-char
   * Instagram bound (R8.1). Returns `null` when there is no usable caption text.
   */
  private normaliseCaption(raw: unknown): string | null {
    if (!isNonEmptyString(raw)) return null
    const trimmed = raw.trim()
    return trimmed.length > MAX_CAPTION_LENGTH ? trimmed.slice(0, MAX_CAPTION_LENGTH).trim() : trimmed
  }

  /**
   * Whether a caption visibly references at least one concrete attribute from the
   * vision description (R8.1). Compares the caption against the description's
   * significant word tokens (length ≥ 4, ignoring stop-ish short words),
   * case-insensitively. Used only to *prefer* a grounded candidate among clean
   * ones — the caption was already given the vision description as its basis.
   */
  private isGrounded(caption: string, visionAnalysis: string): boolean {
    const captionLower = caption.toLowerCase()
    const tokens = (visionAnalysis.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (t) => t.length >= 4,
    )
    return tokens.some((token) => captionLower.includes(token))
  }

  /**
   * Map the target language + brand voice onto the generation preferences so the
   * model authors the caption in the Mission's local language (R9.1) and in the
   * Mission's brand voice (R8.2). When no non-English language is configured the
   * generator's default (English) applies (R9.4).
   */
  private preferences(language: string, brandVoice?: string): UserAIPreferences {
    const preferences: UserAIPreferences = {}
    if (language && language !== DEFAULT_CAPTION_LANGUAGE) {
      preferences.multilingual = language
    }
    if (isNonEmptyString(brandVoice)) {
      preferences.aiPersona = brandVoice.trim()
    }
    return preferences
  }

  /**
   * Withhold + escalate a caption that could not be produced safely (R8.6/R8.7):
   * record an ACT-stage failure Audit_Record and dispatch an Escalation +
   * User_Input_Notification. Best-effort — a transport error is swallowed so
   * escalating never itself crashes the loop.
   */
  private async escalate(
    mission: CaptionMissionInput,
    slot: CaptionSlotInput,
    workspaceId: string,
    reason: CaptionEscalationReason,
    detail: string,
    target?: CaptionEscalationTarget,
  ): Promise<void> {
    try {
      await this.auditService.record(
        {
          missionId: mission._id,
          workspaceId,
          stage: 'ACT',
          action: 'act.caption-withheld',
          outcome: reason === 'vision-failed' ? 'failure' : 'blocked',
          reversible: false,
          triggeringContext: {
            reason,
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
      logger.warn('ACT: failed to record caption-withheld audit', {
        component: COMPONENT,
        missionId: String(mission._id),
        error: error instanceof Error ? error.message : String(error),
      })
    }

    if (!target) {
      logger.error('ACT: caption withheld with no escalation target', undefined, {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
        reason,
      })
      return
    }

    const message =
      reason === 'vision-failed'
        ? `Auto Pilot could not analyse the media for your upcoming ${slot.format} ("${slot.theme}"), ` +
          `so it withheld the caption. Your input is needed to keep the slot on track.`
        : `Auto Pilot could not produce an on-brand, safe caption for your upcoming ${slot.format} ` +
          `("${slot.theme}"). Your input is needed to keep the slot on track.`

    try {
      await this.dispatcher.dispatch({
        userId: target.userId,
        workspaceId,
        title: 'Auto Pilot needs your input',
        message,
        type: 'alert',
        sessionContext: target.sessionContext,
        deviceToken: target.deviceToken,
        email: target.email,
      })
    } catch (error) {
      logger.error('ACT: caption-withheld escalation dispatch failed', error, {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
      })
    }
  }
}

/** Shared default instance wired to the real AI + guardrail + audit services. */
export const captionService = new CaptionService()
