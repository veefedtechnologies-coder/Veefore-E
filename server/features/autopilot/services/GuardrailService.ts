/**
 * Auto Pilot — GuardrailService (pure logic portions, no I/O).
 *
 * Guardrails are the per-Mission constraints Auto Pilot must operate within:
 * brand voice, banned topics, a posting-frequency cap, a credit budget, and the
 * set of human-approval-required actions (R13.1).
 *
 * This file implements the two **pure, side-effect-free** guardrail checks so
 * they can be unit- and property-tested without a database, clock, or network:
 *
 *   1. `wouldExceedFrequencyCap` — rolling-window frequency-cap arithmetic.
 *      The cap is "max published actions per rolling window" (R13.2). Given the
 *      timestamps of already scheduled/published actions and a candidate time,
 *      it reports whether adding the candidate would push any rolling window of
 *      length `windowMs` above the cap. (Property 2)
 *
 *   2. `findBannedTopics` / `containsBannedTopic` — banned-topic matching over a
 *      piece of content (caption or automation text). A banned topic matches on
 *      a whole-word / whole-phrase, case-insensitive, Unicode-aware basis so a
 *      topic like "cast" does not match inside "broadcast" (R13.3). (Property 3)
 *
 * On top of those pure helpers this file also implements the full
 * `check(mission, action)` (design "GuardrailService"). `check` is the single
 * guardrail gate evaluated immediately before execution (R5.1): it evaluates
 * brand voice, banned topics, the posting-frequency cap, the Credit_Budget, and
 * the human-approval-required designation, returning a structured
 * `GuardrailCheck` listing every violation.
 *
 * `check` is deliberately kept **pure and synchronous**: it does not read the
 * database, clock, or credit-usage records itself. Instead the I/O-backed caller
 * (GATE/ACT, and `CreditBudgetService.canSpend` in task 4.2) supplies the
 * already-gathered facts on the `action` — the candidate time plus the mission's
 * existing action times, the consumed-vs-estimated credit figures, and any
 * upstream brand-voice assessment. This keeps the credit-consumption I/O and the
 * usage-record reads in `CreditBudgetService` (task 4.2) while letting the
 * guardrail decision logic be verified in isolation.
 *
 * Satisfies Requirements: 5.1, 13.1, 13.2, 13.3, 13.7, 13.8 (Property 2, 3)
 */

/**
 * The subset of a Mission's guardrails these pure checks need. Accepting a
 * structural type (rather than the Mongoose document) keeps the logic decoupled
 * and trivially testable.
 */
export interface FrequencyCapGuardrail {
  /** Maximum number of actions permitted within any rolling window. */
  count: number
  /** Rolling-window length in milliseconds. */
  windowMs: number
}

export interface GuardrailMissionInput {
  /**
   * The mission's brand-voice description. Only used to annotate a brand-voice
   * violation; the compliance judgement itself is made upstream (see
   * `GuardrailAction.brandVoiceViolation`).
   */
  brandVoice?: string
  guardrails: {
    postingFrequency: FrequencyCapGuardrail
    bannedTopics: string[]
    /**
     * Maximum AI credit spend authorised for the mission (R14.6). Optional here
     * so the pure frequency/banned-topic helpers can be exercised with a minimal
     * mission; `check` only evaluates the budget when both this and
     * `action.credits` are supplied.
     */
    creditBudget?: number
    /**
     * Action types that require human approval before execution (R13.1, R13.7),
     * e.g. `['publish', 'automation']`.
     */
    approvalRequiredActions?: string[]
  }
}

/** The kinds of guardrail a planned action can violate (design). */
export type GuardrailViolationKind =
  | 'banned-topic'
  | 'frequency-cap'
  | 'credit-budget'
  | 'approval-required'
  | 'brand-voice'

/** A single guardrail violation with a human-readable explanation. */
export interface GuardrailViolation {
  kind: GuardrailViolationKind
  detail: string
}

/** The structured result of a guardrail evaluation (design). */
export interface GuardrailCheck {
  /** True iff no guardrail was violated. */
  ok: boolean
  violations: GuardrailViolation[]
}

/**
 * The facts about a planned action that `check` evaluates. The I/O-backed caller
 * gathers these (existing action times, consumed credits, brand-voice
 * assessment) and passes them in, keeping `check` pure.
 */
export interface GuardrailAction {
  /**
   * The action type, matched against `guardrails.approvalRequiredActions`, e.g.
   * `'publish'` or `'automation'`. Omit for actions that are never approval-gated.
   */
  type?: string
  /**
   * Whether the user has already approved this action. When the action type is
   * approval-required, `check` only flags an `approval-required` violation while
   * this is falsy, so a re-check after approval passes (R13.7).
   */
  approved?: boolean
  /**
   * The text content (caption / automation reply) scanned for banned topics
   * (R13.3). Omit or leave empty for actions that carry no text.
   */
  content?: string | null
  /**
   * Candidate scheduled/publish time for the frequency-cap check (R13.2). Omit
   * to skip the frequency check (e.g. for non-publishing actions).
   */
  at?: Date | number
  /**
   * Times of the mission's already scheduled/published actions, supplied by the
   * I/O caller. Combined with `at` for the rolling-window cap check.
   */
  existingActionTimes?: Array<Date | number>
  /**
   * Brand-voice assessment result from upstream (the LLM caption/automation
   * generation step, R8.2/R5.1). When the caller has determined the content
   * violates the mission's brand voice, it passes the failing detail here and
   * `check` surfaces it as a `brand-voice` violation. Left undefined/empty when
   * no brand-voice concern was raised.
   */
  brandVoiceViolation?: string | null
  /**
   * Credit-budget inputs (R13.8, R14). The caller supplies the credits already
   * consumed by the mission and the projected cost of this action; `check` flags
   * a `credit-budget` violation when `consumed + estimatedCost` would strictly
   * exceed the mission's Credit_Budget. Reading `consumed` from the
   * `withAIFeature` usage records is the caller's job (task 4.2). Omit to skip
   * the budget check.
   */
  credits?: {
    consumed: number
    estimatedCost: number
  }
}

/** Coerce a `Date | number` to epoch milliseconds. */
function toMs(t: Date | number): number {
  return t instanceof Date ? t.getTime() : t
}

/**
 * Maximum number of timestamps that fall within any rolling window of length
 * `windowMs`.
 *
 * A rolling window is treated as a half-open span of length `windowMs`: two
 * actions exactly `windowMs` apart do **not** count in the same window (so a cap
 * of N per window permits actions spaced at exactly the window length).
 *
 * Uses a right-anchored two-pointer sweep over the sorted timestamps, which is
 * O(n log n) and provably finds the densest window (the densest window can
 * always be right-anchored on one of the timestamps).
 */
export function maxCountInAnyWindow(times: Array<Date | number>, windowMs: number): number {
  if (times.length === 0) return 0
  // A non-positive window can only ever contain a single instant's actions.
  const sorted = times.map(toMs).sort((a, b) => a - b)

  let max = 0
  let left = 0
  for (let right = 0; right < sorted.length; right++) {
    // Shrink from the left until every element in [left, right] lies strictly
    // within `windowMs` of sorted[right].
    while (sorted[right] - sorted[left] >= windowMs) {
      left++
    }
    max = Math.max(max, right - left + 1)
  }
  return max
}

/**
 * Whether a set of action timestamps respects the frequency cap: no rolling
 * window of length `windowMs` contains more than `count` actions.
 */
export function scheduleRespectsCap(
  times: Array<Date | number>,
  count: number,
  windowMs: number,
): boolean {
  return maxCountInAnyWindow(times, windowMs) <= count
}

/** Escape a string for safe literal use inside a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a case-insensitive, Unicode-aware whole-word/phrase matcher for a topic.
 * Boundaries are any non letter/number/underscore character or string edge, so
 * "cast" matches "a cast of…" but not "broadcast", and multi-word phrases match
 * as a contiguous run.
 */
function buildTopicMatcher(topic: string): RegExp {
  const escaped = escapeRegExp(topic.trim())
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu')
}

export class GuardrailService {
  /**
   * The single guardrail gate evaluated immediately before execution (R5.1).
   *
   * Evaluates, in order, brand voice, banned topics, the posting-frequency cap,
   * the Credit_Budget, and the human-approval-required designation, collecting a
   * structured {@link GuardrailViolation} for each guardrail the action breaches.
   * The action passes (`ok: true`) only when no guardrail is violated.
   *
   * Pure and synchronous: every fact it needs (existing action times, consumed
   * credits, the upstream brand-voice assessment) is supplied on `action` by the
   * I/O-backed caller. Each guardrail is only evaluated when the corresponding
   * inputs are present, so a caller can check a subset (e.g. skip the frequency
   * cap for a non-publishing action by omitting `action.at`).
   *
   * @param mission Mission carrying the guardrails to enforce.
   * @param action  The gathered facts about the action being gated.
   */
  check(mission: GuardrailMissionInput, action: GuardrailAction): GuardrailCheck {
    const violations: GuardrailViolation[] = []

    // Brand voice (R5.1): the compliance judgement is made upstream (LLM); a
    // non-empty assessment string means the content is off-brand.
    if (action.brandVoiceViolation && action.brandVoiceViolation.trim()) {
      violations.push({ kind: 'brand-voice', detail: action.brandVoiceViolation.trim() })
    }

    // Banned topics (R13.3): block if the action's content includes any banned
    // topic; report each matched topic.
    const matchedTopics = this.findBannedTopics(action.content, mission.guardrails.bannedTopics ?? [])
    for (const topic of matchedTopics) {
      violations.push({
        kind: 'banned-topic',
        detail: `Content includes banned topic "${topic}".`,
      })
    }

    // Posting-frequency cap (R13.2, R5.1): only when a candidate time is given.
    if (action.at !== undefined && action.at !== null) {
      if (this.wouldExceedFrequencyCap(mission, action.at, action.existingActionTimes ?? [])) {
        const { count, windowMs } = mission.guardrails.postingFrequency
        violations.push({
          kind: 'frequency-cap',
          detail: `Action would exceed the posting-frequency cap of ${count} per ${windowMs}ms rolling window.`,
        })
      }
    }

    // Credit budget (R13.8, R14): block when consumed + estimated would strictly
    // exceed the mission's Credit_Budget. Only evaluated when both the budget and
    // the caller-supplied credit figures are present.
    if (action.credits && mission.guardrails.creditBudget !== undefined) {
      const { consumed, estimatedCost } = action.credits
      const projected = consumed + estimatedCost
      if (projected > mission.guardrails.creditBudget) {
        violations.push({
          kind: 'credit-budget',
          detail:
            `Action would raise consumed credits to ${projected}, ` +
            `exceeding the Credit_Budget of ${mission.guardrails.creditBudget}.`,
        })
      }
    }

    // Human-approval-required designation (R13.7, R5.1): withhold designated
    // actions until the user approves them.
    if (action.type && !action.approved) {
      const required = mission.guardrails.approvalRequiredActions ?? []
      if (required.includes(action.type)) {
        violations.push({
          kind: 'approval-required',
          detail: `Action "${action.type}" is designated human-approval-required and awaits approval.`,
        })
      }
    }

    return { ok: violations.length === 0, violations }
  }

  /**
   * Would scheduling/publishing an action at time `at` exceed the Mission's
   * rolling-window frequency cap (R13.2)?
   *
   * Pure over its inputs: the caller (the later I/O-backed `check()`) supplies
   * the timestamps of the Mission's already scheduled/published actions via
   * `existingActionTimes`. Returns `true` iff adding `at` would make some
   * rolling window of length `windowMs` hold more than `count` actions.
   *
   * @param mission             Mission carrying `guardrails.postingFrequency`.
   * @param at                  Candidate action time.
   * @param existingActionTimes Times of already scheduled/published actions.
   */
  wouldExceedFrequencyCap(
    mission: GuardrailMissionInput,
    at: Date | number,
    existingActionTimes: Array<Date | number> = [],
  ): boolean {
    const { count, windowMs } = mission.guardrails.postingFrequency
    const combined = [...existingActionTimes, at]
    return !scheduleRespectsCap(combined, count, windowMs)
  }

  /**
   * All banned topics from the Mission's guardrails that appear in `content`
   * (whole-word / whole-phrase, case-insensitive). Empty/blank topics are
   * ignored. Returns the matched topics in their original guardrail form.
   */
  findBannedTopics(content: string | null | undefined, bannedTopics: string[]): string[] {
    if (!content || bannedTopics.length === 0) return []
    const matched: string[] = []
    for (const topic of bannedTopics) {
      if (!topic || !topic.trim()) continue
      if (buildTopicMatcher(topic).test(content)) {
        matched.push(topic)
      }
    }
    return matched
  }

  /**
   * Whether `content` contains any banned topic from the Mission's guardrails
   * (R13.3). Convenience predicate over `findBannedTopics`.
   */
  containsBannedTopic(content: string | null | undefined, bannedTopics: string[]): boolean {
    return this.findBannedTopics(content, bannedTopics).length > 0
  }
}

/** Shared default instance for callers that do not need their own. */
export const guardrailService = new GuardrailService()
