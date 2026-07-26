/**
 * Auto Pilot — CreditBudgetService.
 *
 * A Mission carries a Credit_Budget: the maximum AI credit spend the user has
 * authorised for that mission (R13.1, R14). The CreditBudgetService is the one
 * place that reasons about that budget:
 *
 *   • `projectCost` (this file) — the PURE, side-effect-free projection of how
 *     many credits a planned Content_Plan will consume *before* anything runs.
 *     R14.1 requires Auto Pilot to present this projected numeric credit cost to
 *     the user and withhold execution until they approve it. Because it is pure,
 *     it is unit-testable without a database, clock, or network.
 *
 *   • `canSpend` / `consumed` (this file) — the I/O methods that read the credits
 *     already consumed by the mission from the credit/usage tracking that every
 *     `withAIFeature`-wrapped Auto Pilot AI call settles into, and gate an AI
 *     operation against the remaining budget (R14.2/14.3/14.4/14.7). See the
 *     "Reading a mission's consumed credits" note on `ConsumedCreditsReader`.
 *
 * ── How a planned item maps to AI operations ────────────────────────────────
 * Each planned Content_Slot drives a small, fixed set of AI operations during
 * ACT, and every autopilot AI call is tagged `autopilot.<stage>` and metered by
 * the platform credit model (`CREDIT_MODEL` in `plan-config.ts`). The projected
 * cost of a slot is therefore the sum of the credit cost of the operations that
 * slot will trigger:
 *
 *   • caption generation  — every slot gets a vision-grounded caption (R8).
 *   • hashtag generation  — every slot gets hashtags (R8.4).
 *   • media generation    — only when the slot's source is `ai-generated`:
 *                             a reel costs a video generation; every other
 *                             format costs an image generation.
 *   • brief generation    — only when the slot's source is `user-brief`:
 *                             Auto Pilot authors a Content_Brief (R7.1).
 *   • a slot sourced from the existing media `pool` adds no generation cost
 *     beyond caption + hashtags.
 *
 * The projection is deliberately conservative: it uses each operation's
 * pre-call **reservation ceiling** from `CREDIT_MODEL` (the same upper-bound the
 * metering service reserves before generation), so the projected cost never
 * under-states what execution could reserve. Real settled spend is usually
 * lower, but the user approves against a safe upper bound.
 *
 * Satisfies Requirements: 14.1, 14.2, 14.3, 14.4, 14.7 (Property 4)
 */

import mongoose from 'mongoose'
import { CREDIT_MODEL } from '../../../config/plan-config'
import type { ContentFormat, ContentSourceKind } from '../db/models/ContentSlotModel'

/**
 * Per-operation credit cost table for Auto Pilot content generation. Kept as
 * data (not embedded in branching logic) so the projection stays in sync with
 * the platform credit model and can be overridden in tests.
 *
 * Values default to the corresponding `CREDIT_MODEL` reservation ceilings.
 */
export interface AutoPilotCostTable {
  /** Cost of generating one caption for a slot. */
  caption: number
  /** Cost of generating hashtags for a slot. */
  hashtags: number
  /** Cost of generating one AI image (photo / carousel / story). */
  imageGeneration: number
  /** Cost of generating one AI video (reel). */
  videoGeneration: number
  /** Cost of authoring one Content_Brief (user-brief slots). */
  brief: number
}

/**
 * Default cost table, derived from the platform credit model so a change to
 * `CREDIT_MODEL` flows through to Auto Pilot projections automatically.
 *   caption   ← captionGeneration ceiling
 *   hashtags  ← hashtagGeneration ceiling
 *   image     ← imageGeneration ceiling
 *   video     ← videoScript ceiling
 *   brief     ← aiContentPlan ceiling
 */
export const DEFAULT_AUTOPILOT_COST_TABLE: AutoPilotCostTable = {
  caption: CREDIT_MODEL.captionGeneration.ceiling,
  hashtags: CREDIT_MODEL.hashtagGeneration.ceiling,
  imageGeneration: CREDIT_MODEL.imageGeneration.ceiling,
  videoGeneration: CREDIT_MODEL.videoScript.ceiling,
  brief: CREDIT_MODEL.aiContentPlan.ceiling,
}

/**
 * The minimal shape of a planned item this projection needs. Accepting a
 * structural type (rather than the full `PlannedSlot` / `ContentSlot` document)
 * keeps the logic decoupled and trivially testable, and lets both the planner's
 * in-memory slots and persisted `ContentSlot` documents be projected as-is.
 */
export interface ProjectableItem {
  format: ContentFormat
  source: { kind: ContentSourceKind }
}

/** Round a credit amount to the platform's 2-decimal credit precision. */
function roundCredits(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * The minimal shape of a Mission the budget gate needs. Accepting a structural
 * type (rather than the full Mongoose document) keeps the gate logic decoupled
 * from the persistence layer and trivially testable.
 */
export interface BudgetMissionInput {
  /** Mission id — used only for scoping/diagnostics by a reader. */
  _id?: unknown
  /** Workspace the mission (and therefore its AI spend) is bound to. */
  workspaceId: unknown
  /** When the mission was created; the reader attributes spend from here on. */
  createdAt?: Date
  guardrails: {
    /** Maximum AI credit spend authorised for the mission (R14.6). */
    creditBudget: number
  }
}

/**
 * Raised when the credit/usage tracking cannot report a Mission's consumed
 * credits (R14.7). Callers translate this into a withhold + Escalation +
 * User_Input_Notification; `canSpend` translates it into `false` (withhold
 * without spend).
 */
export class CreditTrackingUnavailableError extends Error {
  constructor(message = 'Credit usage tracking could not report consumed credits') {
    super(message)
    this.name = 'CreditTrackingUnavailableError'
  }
}

/**
 * ── Reading a mission's consumed credits ─────────────────────────────────────
 * Port that reports how many credits a Mission has consumed so far. It returns
 * the credit figure, or `null` when the credit/usage tracking cannot report it
 * (R14.7 — tracking unavailable). Isolating the read behind a port keeps the
 * budget-ceiling *logic* (`consumed` / `canSpend`, and Property 4) pure and
 * fully testable, while the actual data source lives in a thin adapter.
 *
 * Every Auto Pilot AI call is wrapped in
 * `withAIFeature('autopilot.<stage>', { userId, workspaceId }, …)`, and those
 * calls settle their real credit charge through the platform credit-metering
 * service (R14.2). The default adapter therefore reads the authoritative
 * consumed-credit figure the credit/usage system reports — the settled
 * credit-transaction ledger — scoped to the mission's workspace and lifetime.
 */
export interface ConsumedCreditsReader {
  /**
   * Credits consumed by the mission so far, or `null` if the credit/usage
   * tracking is unavailable (R14.7). May reject; the service treats a rejection
   * the same as an unavailable read.
   */
  read(mission: BudgetMissionInput): Promise<number | null>
}

/**
 * Default `ConsumedCreditsReader`: sums the `credits` of the settled AI
 * credit-transactions the platform metering service recorded for the mission's
 * workspace since the mission was created. This is the actual consumption the
 * credit/usage system reports (the Credit_Budget glossary definition), into
 * which every `withAIFeature`-wrapped Auto Pilot AI call settles (R14.2).
 *
 * Scoping is by `workspaceId` + mission lifetime because a Mission is bound 1:1
 * to a workspace/account (R1.4) and is the autonomous credit consumer over that
 * span. The estimate is conservative: including any concurrent manual spend in
 * the same workspace only tightens the ceiling, so Property 4 (never exceed the
 * budget) is preserved.
 *
 * Best-effort and null-safe: if the ledger model is not registered or the query
 * fails, it returns `null` so the caller withholds the operation (R14.7) rather
 * than proceeding blind.
 */
export const aiCreditTransactionConsumedReader: ConsumedCreditsReader = {
  async read(mission: BudgetMissionInput): Promise<number | null> {
    const model = mongoose.models.AICreditTransaction as
      | mongoose.Model<Record<string, unknown>>
      | undefined
    if (!model) return null

    try {
      const match: Record<string, unknown> = {
        workspaceId: String(mission.workspaceId),
        status: 'settled',
      }
      if (mission.createdAt instanceof Date) {
        match.createdAt = { $gte: mission.createdAt }
      }

      const [row] = await model.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$credits' } } },
      ])

      const total = row?.total
      if (typeof total !== 'number' || !Number.isFinite(total)) return 0
      return roundCredits(Math.max(0, total))
    } catch {
      // Tracking unavailable → let the caller withhold (R14.7).
      return null
    }
  },
}

/**
 * Credit budget reasoning for a Mission.
 *
 * Implements both the pure projection (`projectCost` / `projectSlotCost`) and
 * the I/O-backed budget gate (`consumed` / `canSpend`, R14.2/14.3/14.4/14.7).
 * The gate reads consumed credits through an injectable {@link ConsumedCreditsReader}
 * so the ceiling logic stays pure and testable.
 */
export class CreditBudgetService {
  constructor(
    private readonly costTable: AutoPilotCostTable = DEFAULT_AUTOPILOT_COST_TABLE,
    private readonly consumedReader: ConsumedCreditsReader = aiCreditTransactionConsumedReader,
  ) {}

  /**
   * Projected credit cost of a single planned item.
   *
   * Every slot incurs a caption + hashtags. `ai-generated` slots add a media
   * generation cost (video for reels, image otherwise); `user-brief` slots add
   * a brief-authoring cost; `pool` slots add nothing further.
   */
  projectSlotCost(item: ProjectableItem): number {
    let cost = this.costTable.caption + this.costTable.hashtags

    switch (item.source.kind) {
      case 'ai-generated':
        cost +=
          item.format === 'reel'
            ? this.costTable.videoGeneration
            : this.costTable.imageGeneration
        break
      case 'user-brief':
        cost += this.costTable.brief
        break
      case 'pool':
        // Existing media: no generation cost beyond caption + hashtags.
        break
    }

    return roundCredits(cost)
  }

  /**
   * R14.1: the total projected credit cost of a Content_Plan — the sum of the
   * projected cost of every planned item. An empty plan projects to 0.
   *
   * Pure over its input; the result is a numeric credit value suitable for
   * presenting to the user for approval before execution.
   */
  projectCost(plannedItems: ProjectableItem[]): number {
    const total = plannedItems.reduce((sum, item) => sum + this.projectSlotCost(item), 0)
    return roundCredits(total)
  }

  /**
   * R14.3/14.4: the credits the Mission has consumed so far, as reported by the
   * credit/usage tracking (into which every `withAIFeature`-wrapped Auto Pilot
   * AI call settles, R14.2).
   *
   * Reads through the injected {@link ConsumedCreditsReader}. If the tracking
   * cannot report a figure — the reader returns `null`/rejects, or reports a
   * non-finite/negative value — this throws {@link CreditTrackingUnavailableError}
   * so the caller can withhold + escalate (R14.7). A successful read is rounded
   * to the platform's 2-decimal credit precision.
   */
  async consumed(mission: BudgetMissionInput): Promise<number> {
    let value: number | null
    try {
      value = await this.consumedReader.read(mission)
    } catch (error) {
      throw new CreditTrackingUnavailableError(
        `Credit usage tracking failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    if (value == null || !Number.isFinite(value) || value < 0) {
      throw new CreditTrackingUnavailableError()
    }

    return roundCredits(value)
  }

  /**
   * R14.3/14.4/14.7: may the Mission spend `estimatedCost` more credits?
   *
   * Returns `true` only when the Mission's already-consumed credits plus this
   * operation's projected cost stay within (≤) the Credit_Budget, so the sum of
   * consumed credits can never cross the budget (Property 4). The operation that
   * would push consumption past the budget is withheld (`false`) without any
   * spend (R14.4).
   *
   * Withholds (`false`) — never proceeding blind — when:
   *   • the projected cost cannot be computed (non-finite/negative) — R14.7; or
   *   • the credit/usage tracking cannot report consumed credits — R14.7; or
   *   • the mission's Credit_Budget is missing/invalid.
   *
   * This method does not itself create the Escalation or User_Input_Notification
   * that R14.4/14.7 require; the GATE/ACT caller does that on a `false` result.
   */
  async canSpend(mission: BudgetMissionInput, estimatedCost: number): Promise<boolean> {
    // R14.7: a projected cost that cannot be computed → withhold without spend.
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) return false

    const budget = mission.guardrails?.creditBudget
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0) return false

    let consumed: number
    try {
      consumed = await this.consumed(mission)
    } catch {
      // R14.7: tracking unavailable → withhold without spend.
      return false
    }

    return roundCredits(consumed + estimatedCost) <= budget
  }
}

/** Shared default instance for callers that do not need a custom cost table. */
export const creditBudgetService = new CreditBudgetService()
