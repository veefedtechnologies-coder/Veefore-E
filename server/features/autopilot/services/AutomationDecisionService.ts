/**
 * Auto Pilot — AutomationDecisionService (the "acts like a human" component).
 *
 * Because Auto Pilot authored the caption/CTA for a Content_Slot, it already
 * knows whether the post drives a response and, if so, the trigger keyword — no
 * regex guessing. After a slot's caption is finalized, this service runs **one**
 * LLM call (`generateJSON`, ≤30s · R10.1) that reasons over the caption + CTA and
 * returns a structured {@link AutomationDecision}: whether the post needs an
 * Engagement_Automation and, if so, exactly one type from
 * {comment-only, dm-only, comment-to-dm} plus the derived keyword and reply/DM
 * text (design "AutomationDecisionService" table · R10).
 *
 * Like every other Auto Pilot stage this is an **orchestrator**, not a
 * re-implementation: the decision is produced by the existing
 * `aiServiceManager.generateJSON`, tagged for credit/usage attribution via
 * `withAIFeature('autopilot.automation', { userId, workspaceId }, …)` (design
 * table · R14.2). The LLM transport is injected as a port (with the real
 * singleton as the default) so the 30s bound, the failure path, and the
 * exactly-one-type guarantee are fully unit- and property-testable without a
 * network or a real provider.
 *
 * ── Decision rules (LLM-guided, enumerated for testability) ──────────────────
 * | Caption CTA pattern                                   | Decision              |
 * |-------------------------------------------------------|-----------------------|
 * | No response-driving CTA                               | no automation (R10.5) |
 * | "comment X and I'll DM you the link/guide"            | comment-to-dm (R10.4) |
 * | "DM me X for …"                                       | dm-only               |
 * | "tag a friend / comment your thoughts"                | comment-only          |
 * | LLM failure/timeout OR keyword not derivable          | no automation (R10.7) |
 *
 * ── Default to no-automation (R10.5 / R10.7, Property 7) ─────────────────────
 * This is the load-bearing safety guarantee. `decide` **never fabricates** an
 * automation: it returns `needsAutomation:true` only when the LLM says the post
 * needs one AND a valid type with its required fields (a derivable trigger
 * keyword for keyword-driven types) is present. On an LLM throw, a timeout, an
 * unparseable/invalid payload, an unknown type, or a missing keyword it defaults
 * to `{ needsAutomation:false }` and leaves the Content_Slot state untouched
 * (R10.7). This is exactly **Property 7 — exactly one automation type**: when the
 * returned decision needs automation, exactly one type is selected; otherwise no
 * automation is attached (R10.2, R10.5).
 *
 * The 30-second bound (R10.1) is enforced the same way THINK enforces its 300s
 * bound: the LLM call is raced against a timer and its `AbortSignal` is triggered
 * when the timer wins, so the loop is never left hanging on a slow provider.
 *
 * `draftRule` (mapping a decision → an `AutomationRule` draft) is intentionally
 * left to Task 12.2; this file implements `decide`.
 *
 * Satisfies Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7 (Property 7)
 */

import { logger } from '../../../config/logger'
import { aiServiceManager, type UserAIPreferences } from '../../../services/AIServiceManager'
import { withAIFeature } from '../../../services/aiUsageTracker'
import type { ContentFormat } from '../db/models'

const COMPONENT = 'autopilot.AutomationDecisionService'

/** The AI-feature label used to attribute Automation_Decision credit spend (R14.2). */
export const AUTOMATION_AI_FEATURE = 'autopilot.automation'

/** R10.1: the Automation_Decision must be produced within 30 seconds. */
export const AUTOMATION_TIMEOUT_MS = 30_000

/** The three Engagement_Automation types; exactly one is chosen when needed (R10.2). */
export const AUTOMATION_TYPES = ['comment-only', 'dm-only', 'comment-to-dm'] as const

/** The type of Engagement_Automation an {@link AutomationDecision} selects (R10.2). */
export type AutomationType = (typeof AUTOMATION_TYPES)[number]

/**
 * The `AutomationRule.type` values the existing automation stack understands
 * (`automation-system.ts`, `automationWorker`, the automation routes). Auto
 * Pilot's decision types map 1:1 onto these underscored variants so a drafted
 * rule is indistinguishable from a user-authored one to `TriggerEngine`.
 */
export const RULE_TYPE_BY_DECISION: Record<AutomationType, 'comment_dm' | 'dm_only' | 'comment_only'> = {
  'comment-to-dm': 'comment_dm',
  'dm-only': 'dm_only',
  'comment-only': 'comment_only',
}

/** An interactive button attached to the drafted DM (matches the AutomationRule schema). */
export interface AutomationDmButton {
  label: string
  url?: string
}

/** The v1 platform for autonomous execution (R18.6). */
export const AUTOPILOT_PLATFORM = 'instagram'

/**
 * A button in the shape the existing automation stack persists and sends. The
 * frontend and `automation-system.ts` use `{ type:'web_url', text, url }`
 * (only rendered when both `text` and `url` are present), so Auto Pilot's
 * `{ label, url }` decision buttons are normalised to that shape here.
 */
export interface RuleDmButton {
  type: 'web_url'
  text: string
  url?: string
}

/**
 * The `action` block of an `AutomationRule`, exactly as `TriggerEngine` reads it
 * (`action.responses` for public comment replies, `action.dmResponses` for DM
 * bodies, `action.dmButtons` for interactive buttons).
 */
export interface RuleAction {
  /** Public comment reply templates (comment-only / comment-to-dm). */
  responses: string[]
  /** DM body templates (dm-only / comment-to-dm). */
  dmResponses: string[]
  /** Interactive DM buttons (comment-to-dm / dm-only). */
  dmButtons: RuleDmButton[]
}

/**
 * A drafted `AutomationRule` (design "AutomationDecisionService" · R10.6). This is
 * the persistable data shape consumed by `automationRuleRepository` and matched
 * by the existing `TriggerEngine`/`automationWorker` — **never activated here**:
 * `isActive` is always `false` until go-live (Task 15 / R11.1, R11.2).
 *
 * Keyword matching mirrors the user-authored path: keywords live top-level (and
 * in `trigger.keywords`) and `matchMode` is `'contains'` for keyword-driven
 * rules, `'any'` for keyword-less comment-only engagement replies — both shapes
 * `TriggerEngine.evaluate` already understands.
 */
export interface AutomationRuleDraft {
  /** Human-readable rule name (schema-required). */
  name: string
  /** Workspace the rule is scoped to (schema-required). */
  workspaceId: string
  /** Short rationale from the decision, surfaced for narration/audit. */
  description: string
  /** Always `false` until go-live (R11.1/R11.2). */
  isActive: false
  /** The automation stack's rule type (`comment_dm` | `dm_only` | `comment_only`). */
  type: 'comment_dm' | 'dm_only' | 'comment_only'
  /** v1 platform (`instagram`). */
  platform: string
  /** Marks this as a post-engagement automation. */
  postInteraction: true
  /** Trigger keywords (empty for keyword-less comment-only). */
  keywords: string[]
  /** Keyword match strategy TriggerEngine honours. */
  matchMode: 'contains' | 'any'
  /** Trigger config (keywords + matchMode) — TriggerEngine reads either source. */
  trigger: { type: 'comment'; keywords: string[]; matchMode: 'contains' | 'any'; negativeKeywords: string[] }
  /** The action executed on match: comment reply, DM, buttons. */
  action: RuleAction
  /** Id of the originating Content_Slot, for traceability/linking. */
  slotId?: string
}

/**
 * The structured decision produced by one LLM call (design `AutomationDecision`).
 *
 * Invariant (Property 7): when `needsAutomation` is `false`, `type` and all the
 * automation payload fields are absent; when `needsAutomation` is `true`, exactly
 * one {@link AutomationType} is set with the fields its type requires.
 */
export interface AutomationDecision {
  /** Whether the post needs an Engagement_Automation (R10.1). */
  needsAutomation: boolean
  /** Exactly one automation type, present iff `needsAutomation` (R10.2). */
  type?: AutomationType
  /** Trigger keyword derived from the CTA, for keyword-driven types (R10.3). */
  triggerKeyword?: string
  /** Public comment reply text (comment-only / comment-to-dm). */
  commentReply?: string
  /** Direct message body — the content named in the CTA (R10.4). */
  dmMessage?: string
  /** Optional interactive DM buttons. */
  dmButtons?: AutomationDmButton[]
  /** Human-readable justification for narration / audit. */
  reason: string
}

/**
 * The minimal shape of a Mission the decision needs. Accepting a structural type
 * rather than the Mongoose document keeps the stage decoupled and testable.
 */
export interface AutomationDecisionMissionInput {
  /** Mission id — for logging/attribution. */
  _id: unknown
  /** Workspace the mission is bound to; used for credit attribution (R14.2). */
  workspaceId: unknown
  /** Account local language; the reply/DM text is authored in it (R9), else English. */
  localLanguage?: string
}

/** The minimal shape of the Content_Slot the decision is made for. */
export interface AutomationDecisionSlotInput {
  /** Persisted `ContentSlot._id`. */
  _id: unknown
  /** Content format — passed to the model for context. */
  format: ContentFormat
  /** Strategy theme assigned to the slot — passed to the model for context. */
  theme?: string
}

/** Per-call options for {@link AutomationDecisionService.decide}. */
export interface DecideOptions {
  /** User to attribute the AI spend to via `withAIFeature` (R14.2). */
  userId?: string
  /** Override the 30s deadline (R10.1). Defaults to {@link AUTOMATION_TIMEOUT_MS}. */
  timeoutMs?: number
}

/**
 * LLM transport port. Defaults to `aiServiceManager.generateJSON`, which honours
 * the `signal` used to enforce the 30s bound (R10.1).
 */
export interface AutomationJSONGenerator {
  generateJSON(
    prompt: string,
    preferences?: UserAIPreferences,
    options?: { signal?: AbortSignal },
  ): Promise<any>
}

/** Tunable dependencies for the Automation_Decision. */
export interface AutomationDecisionServiceOptions {
  /** LLM transport (defaults to the shared `aiServiceManager`). */
  generator?: AutomationJSONGenerator
  /** The 30s bound (R10.1); overridable for tests. Defaults to {@link AUTOMATION_TIMEOUT_MS}. */
  timeoutMs?: number
}

const defaultGenerator: AutomationJSONGenerator = {
  generateJSON: (prompt, preferences, options) =>
    aiServiceManager.generateJSON(prompt, preferences ?? {}, options ?? {}),
}

/** A non-empty, trimmed string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Error thrown internally when the LLM does not respond within the bound (R10.1). */
class AutomationDecisionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`automation decision exceeded ${timeoutMs}ms bound`)
    this.name = 'AutomationDecisionTimeoutError'
  }
}

/** The safe default decision: attach no Engagement_Automation (R10.5 / R10.7). */
function noAutomation(reason: string): AutomationDecision {
  return { needsAutomation: false, reason }
}

/**
 * Makes the human-like Automation_Decision for a finalized caption via one
 * bounded LLM call, defaulting to no-automation on any failure or when a genuine
 * CTA/keyword cannot be established (R10, Property 7).
 */
export class AutomationDecisionService {
  private readonly generator: AutomationJSONGenerator
  private readonly timeoutMs: number

  constructor(options: AutomationDecisionServiceOptions = {}) {
    this.generator = options.generator ?? defaultGenerator
    this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? AUTOMATION_TIMEOUT_MS))
  }

  /**
   * Decide whether a Content_Slot's finalized caption warrants an
   * Engagement_Automation and, if so, which type + keyword + reply/DM (R10).
   *
   * Runs one `generateJSON` call under `withAIFeature('autopilot.automation', …)`
   * bounded to 30s (R10.1). The result is normalised so that:
   *   - `needsAutomation:true` is returned only with a valid single type (R10.2)
   *     and the fields that type requires — including a derivable trigger keyword
   *     for keyword-driven types (R10.3/R10.4);
   *   - on an LLM throw, a timeout, an invalid/unparseable payload, an unknown
   *     type, or a missing keyword, it defaults to `{ needsAutomation:false }`
   *     (R10.5/R10.7).
   *
   * Never throws: any failure resolves to the safe no-automation default so the
   * Operating Loop keeps running and the slot state is preserved (R10.7).
   */
  async decide(
    mission: AutomationDecisionMissionInput,
    slot: AutomationDecisionSlotInput,
    caption: string,
    options: DecideOptions = {},
  ): Promise<AutomationDecision> {
    // No caption text → nothing to reason about → no automation (R10.5).
    if (!isNonEmptyString(caption)) {
      return noAutomation('no caption text to reason over')
    }

    const workspaceId = String(mission.workspaceId)
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? this.timeoutMs))

    let raw: unknown
    try {
      const prompt = this.buildPrompt(mission, slot, caption)
      // R14.2: attribute the spend to the mission's workspace/user.
      raw = await withAIFeature(
        AUTOMATION_AI_FEATURE,
        { userId: options.userId, workspaceId },
        () =>
          this.withTimeout(
            (signal) => this.generator.generateJSON(prompt, this.preferences(mission), { signal }),
            timeoutMs,
          ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // R10.7: LLM failure/timeout → default to no automation, preserve slot state.
      logger.warn('AUTOMATION: decision failed — defaulting to no automation', {
        component: COMPONENT,
        missionId: String(mission._id),
        slotId: String(slot._id),
        error: message,
      })
      return noAutomation(`decision failed: ${message}`)
    }

    const decision = this.parseDecision(raw)

    logger.info('AUTOMATION: made automation decision', {
      component: COMPONENT,
      missionId: String(mission._id),
      slotId: String(slot._id),
      needsAutomation: decision.needsAutomation,
      type: decision.type,
    })

    return decision
  }

  /**
   * Map an {@link AutomationDecision} onto a drafted {@link AutomationRuleDraft}
   * compatible with the existing `TriggerEngine`/`automationWorker` stack (R10.6).
   *
   * This is a **pure mapping** (no I/O): it does not persist anything and never
   * activates a rule — `isActive` is fixed to `false` so go-live stays gated by
   * the automation lifecycle (Task 15 / R11.1, R11.2). Persistence and linking to
   * the slot (`ContentSlot.automationDraftId`) happen in the ACT/lifecycle stages.
   *
   * When the decision does not need automation (R10.5/R10.7), there is nothing to
   * draft and it returns `null` — the caller attaches no Engagement_Automation.
   *
   * The per-type mapping mirrors the user-authored builder exactly:
   *   - `comment-to-dm` → `comment_dm`: `responses:[commentReply]`,
   *     `dmResponses:[dmMessage]`, `dmButtons` (R10.4);
   *   - `dm-only` → `dm_only`: `responses:[]`, `dmResponses:[dmMessage]`, `dmButtons`;
   *   - `comment-only` → `comment_only`: `responses:[commentReply]`,
   *     `dmResponses:[]`, `dmButtons:[]`.
   *
   * The derived trigger keyword (R10.3) is placed top-level and in `trigger` with
   * `matchMode:'contains'`; a keyword-less `comment-only` engagement reply uses
   * `matchMode:'any'` so it still fires — both are shapes `TriggerEngine` reads.
   */
  draftRule(
    mission: AutomationDecisionMissionInput,
    slot: AutomationDecisionSlotInput,
    decision: AutomationDecision,
  ): AutomationRuleDraft | null {
    // Nothing to draft when the post does not need automation (R10.5/R10.7).
    if (!decision.needsAutomation || !decision.type) {
      return null
    }

    const type = RULE_TYPE_BY_DECISION[decision.type]
    const keyword = isNonEmptyString(decision.triggerKeyword) ? decision.triggerKeyword.trim() : undefined
    const keywords = keyword ? [keyword] : []
    // Keyword-driven rules match on `contains`; a keyword-less comment-only
    // engagement reply matches `any` so it still triggers (TriggerEngine).
    const matchMode: 'contains' | 'any' = keywords.length > 0 ? 'contains' : 'any'
    const action = this.buildRuleAction(decision)

    return {
      name: this.buildRuleName(decision, keyword),
      workspaceId: String(mission.workspaceId),
      description: decision.reason,
      isActive: false,
      type,
      platform: AUTOPILOT_PLATFORM,
      postInteraction: true,
      keywords,
      matchMode,
      trigger: { type: 'comment', keywords, matchMode, negativeKeywords: [] },
      action,
      slotId: slot._id != null ? String(slot._id) : undefined,
    }
  }

  /**
   * Build the `action` block per automation type, matching what `TriggerEngine`
   * reads (`responses` / `dmResponses` / `dmButtons`) and the user-authored
   * builder's per-type field population.
   */
  private buildRuleAction(decision: AutomationDecision): RuleAction {
    const commentReply = isNonEmptyString(decision.commentReply) ? decision.commentReply.trim() : undefined
    const dmMessage = isNonEmptyString(decision.dmMessage) ? decision.dmMessage.trim() : undefined
    const dmButtons = this.toRuleButtons(decision.dmButtons)

    switch (decision.type) {
      case 'comment-to-dm':
        return {
          responses: commentReply ? [commentReply] : [],
          dmResponses: dmMessage ? [dmMessage] : [],
          dmButtons,
        }
      case 'dm-only':
        return {
          responses: [],
          dmResponses: dmMessage ? [dmMessage] : [],
          dmButtons,
        }
      case 'comment-only':
      default:
        return {
          responses: commentReply ? [commentReply] : [],
          dmResponses: [],
          dmButtons: [],
        }
    }
  }

  /**
   * Normalise decision buttons (`{ label, url }`) into the `{ type:'web_url',
   * text, url }` shape the automation stack persists and renders.
   */
  private toRuleButtons(buttons?: AutomationDmButton[]): RuleDmButton[] {
    if (!Array.isArray(buttons)) return []
    const out: RuleDmButton[] = []
    for (const button of buttons) {
      if (!button || !isNonEmptyString(button.label)) continue
      out.push({
        type: 'web_url',
        text: button.label.trim(),
        ...(isNonEmptyString(button.url) ? { url: button.url.trim() } : {}),
      })
    }
    return out
  }

  /** A concise, human-readable draft rule name for the activity log / UI. */
  private buildRuleName(decision: AutomationDecision, keyword?: string): string {
    const base = `Auto Pilot: ${decision.type}`
    return keyword ? `${base} (${keyword})` : base
  }

  /**
   * Validate + normalise the raw LLM payload into an {@link AutomationDecision},
   * enforcing Property 7. Any shortfall — not an object, `needsAutomation` not
   * truthy, an unknown/absent type, or a type whose required fields (a keyword
   * for keyword-driven types, a DM body, a comment reply) are missing — collapses
   * to the safe no-automation default (R10.5 / R10.7).
   */
  private parseDecision(raw: unknown): AutomationDecision {
    if (!raw || typeof raw !== 'object') {
      return noAutomation('decision response was not an object')
    }
    const obj = raw as Record<string, unknown>
    const reason = isNonEmptyString(obj.reason) ? obj.reason.trim() : 'automation decision'

    // The model must explicitly say the post needs automation (R10.1).
    if (obj.needsAutomation !== true) {
      return noAutomation(reason)
    }

    // Exactly one known type must be selected (R10.2). Unknown/absent → none.
    const type = AUTOMATION_TYPES.includes(obj.type as AutomationType)
      ? (obj.type as AutomationType)
      : undefined
    if (!type) {
      return noAutomation('no valid automation type was selected')
    }

    const keyword = isNonEmptyString(obj.triggerKeyword) ? obj.triggerKeyword.trim() : undefined
    const commentReply = isNonEmptyString(obj.commentReply) ? obj.commentReply.trim() : undefined
    const dmMessage = isNonEmptyString(obj.dmMessage) ? obj.dmMessage.trim() : undefined
    const dmButtons = this.parseButtons(obj.dmButtons)

    // Each type's required fields. A keyword-driven type with no derivable
    // keyword collapses to no automation (R10.3/R10.7).
    switch (type) {
      case 'comment-to-dm': {
        // R10.4: derived keyword + public comment reply + DM with the named content.
        if (!keyword || !dmMessage) {
          return noAutomation('comment-to-dm requires a trigger keyword and a DM message')
        }
        return {
          needsAutomation: true,
          type,
          triggerKeyword: keyword,
          commentReply: commentReply ?? `Just sent it your way! 📩`,
          dmMessage,
          ...(dmButtons.length > 0 ? { dmButtons } : {}),
          reason,
        }
      }
      case 'dm-only': {
        // "DM me X for …" → keyword-driven DM reply (R10.3).
        if (!keyword || !dmMessage) {
          return noAutomation('dm-only requires a trigger keyword and a DM message')
        }
        return {
          needsAutomation: true,
          type,
          triggerKeyword: keyword,
          dmMessage,
          ...(dmButtons.length > 0 ? { dmButtons } : {}),
          reason,
        }
      }
      case 'comment-only': {
        // Engagement reply ("tag a friend / comment your thoughts"): a public
        // comment reply is required; a keyword is optional.
        if (!commentReply) {
          return noAutomation('comment-only requires a public comment reply')
        }
        return {
          needsAutomation: true,
          type,
          ...(keyword ? { triggerKeyword: keyword } : {}),
          commentReply,
          reason,
        }
      }
      default:
        // Unreachable given the guard above, but keeps the default safe.
        return noAutomation('unhandled automation type')
    }
  }

  /** Normalise the optional DM buttons into `{ label, url? }` entries. */
  private parseButtons(value: unknown): AutomationDmButton[] {
    if (!Array.isArray(value)) return []
    const out: AutomationDmButton[] = []
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue
      const b = entry as Record<string, unknown>
      if (!isNonEmptyString(b.label)) continue
      out.push({
        label: b.label.trim(),
        ...(isNonEmptyString(b.url) ? { url: b.url.trim() } : {}),
      })
    }
    return out
  }

  /**
   * Run the LLM call with a hard deadline (R10.1). Races the operation against a
   * timer; when the timer wins, the operation's `AbortSignal` is triggered so the
   * provider call can cancel, and an {@link AutomationDecisionTimeoutError}
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
        reject(new AutomationDecisionTimeoutError(timeoutMs))
      }, timeoutMs)
    })

    try {
      return await Promise.race([op(controller.signal), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Map the Mission's local language onto the generation preferences so the
   * public reply + DM text are authored in it (R9); English applies by default.
   */
  private preferences(mission: AutomationDecisionMissionInput): UserAIPreferences {
    const preferences: UserAIPreferences = {}
    if (isNonEmptyString(mission.localLanguage)) {
      preferences.multilingual = mission.localLanguage
    }
    return preferences
  }

  /**
   * Build the decision prompt: reason like a human social manager over the
   * finalized caption/CTA, decide whether the post needs engagement automation,
   * and — only when it genuinely does — select exactly one type and derive the
   * trigger keyword from the caption's own words (R10.2/R10.3/R10.4). Requests a
   * strict JSON shape and instructs the model to default to no automation when in
   * doubt (R10.5/R10.7).
   */
  private buildPrompt(
    mission: AutomationDecisionMissionInput,
    slot: AutomationDecisionSlotInput,
    caption: string,
  ): string {
    const language = isNonEmptyString(mission.localLanguage) ? mission.localLanguage : 'English'
    return [
      'You are the engagement-automation brain for an autonomous Instagram growth agent.',
      'You wrote the caption below, so you know its call-to-action (CTA) exactly.',
      'Decide, like a thoughtful human social manager, whether this post NEEDS an',
      'engagement automation. Only add automation when the caption drives a concrete',
      'response (comment/DM a keyword, DM for something, or invites public replies).',
      'If there is no response-driving CTA, DO NOT invent one — return needsAutomation:false.',
      '',
      `POST FORMAT: ${slot.format}`,
      slot.theme ? `THEME: ${slot.theme}` : '',
      `OUTPUT LANGUAGE for reply and DM text: ${language}`,
      '',
      'CAPTION:',
      caption,
      '',
      'Automation types (choose EXACTLY ONE only when automation is needed):',
      '- "comment-to-dm": caption says "comment X and I\'ll DM you the link/guide".',
      '    Derive keyword X from the caption; include a public commentReply and a',
      '    dmMessage containing the content named in the CTA.',
      '- "dm-only": caption says "DM me X for …". Derive keyword X; include dmMessage.',
      '- "comment-only": caption invites public replies ("tag a friend / comment your',
      '    thoughts"). Include a friendly commentReply; keyword is optional.',
      '',
      'Rules:',
      '- If no response-driving CTA exists, return { "needsAutomation": false, "reason": "…" }.',
      '- If a keyword-driven CTA exists but you cannot derive the keyword, return no automation.',
      '- Derive the trigger keyword verbatim from the caption; never guess.',
      '',
      'Respond with ONLY a JSON object of this exact shape:',
      '{',
      '  "needsAutomation": boolean,',
      '  "type": "comment-only" | "dm-only" | "comment-to-dm",   // omit when needsAutomation is false',
      '  "triggerKeyword": string,     // required for dm-only and comment-to-dm',
      '  "commentReply": string,       // public reply for comment-only and comment-to-dm',
      '  "dmMessage": string,          // DM body for dm-only and comment-to-dm',
      '  "dmButtons": [{ "label": string, "url": string }],  // optional',
      '  "reason": string              // short justification',
      '}',
    ]
      .filter((line) => line !== '')
      .join('\n')
  }
}

/** Shared default instance wired to the real AI service. */
export const automationDecisionService = new AutomationDecisionService()
