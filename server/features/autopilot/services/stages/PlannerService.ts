/**
 * Auto Pilot — PlannerService (PLAN stage of the Operating Loop).
 *
 * PLAN is the third stage of every Operating-Loop iteration. It consumes the
 * {@link Strategy} produced by THINK and turns its themes + posting cadence into
 * a concrete, forward-looking **Content_Plan**: a set of {@link IContentSlot}
 * documents, each a scheduled post covering a horizon of **at least 7 days**
 * ahead (design "Stage responsibilities" · R2.5). Every slot's scheduled time is
 * kept **within the Mission's posting-frequency cap** (R2.7, R13.2 — Property 2).
 *
 * Like every Auto Pilot stage, PlannerService is an **orchestrator**: it composes
 * the pure PLAN helpers rather than reinventing them —
 *
 *   • {@link GuardrailService.wouldExceedFrequencyCap} decides whether a
 *     candidate slot time can be admitted without breaching the rolling-window
 *     cap. Because every admitted slot is checked against all already-scheduled
 *     slots plus the ones admitted so far, the produced plan provably respects
 *     the cap for any cadence — including cadences that ask for more posts than
 *     the cap permits (the excess candidates are simply not admitted). This is
 *     Property 2 (frequency cap never exceeded).
 *
 *   • {@link ContentSourceResolver} assigns each slot's Content_Source
 *     (`pool` | `user-brief` | `ai-generated`) per the Mission's
 *     `contentSourcePreference` (task 9.1).
 *
 *   • {@link LeadTimeEstimator} computes the Lead_Time for any slot whose source
 *     is a `user-brief`, so PLAN can set `briefSendAt = scheduledAt − leadTime`
 *     (task 3.1) — the time the just-in-time Content_Brief must be sent so the
 *     user has time to create the media before the publish slot (R7.2).
 *
 * ── Refresh, not duplicate ──────────────────────────────────────────────────
 * `plan` is **idempotent across iterations**: it reads the Mission's existing
 * slots, counts the ones already covering the horizon, and only creates enough
 * new slots to fill the plan up to the cadence target. Re-running PLAN on a
 * Mission that is already fully planned creates nothing. Cancelled/failed slots
 * do not count toward coverage and their times are ignored by the cap check.
 *
 * All I/O (reading existing slots, reading the Media_Pool, creating slots) is
 * behind injected ports (defaulting to the shared repository/services), so the
 * scheduling + cap + brief-timing logic is fully unit- and property-testable
 * without a database.
 *
 * Satisfies Requirements: 2.5, 2.7, 13.2 (Property 2)
 */

import { logger } from '../../../../config/logger'
import type {
  ContentFormat,
  ContentSlotStatus,
  IContentSlot,
} from '../../db/models'
import type { ContentSourcePreference } from '../../db/models/AutoPilotMissionModel'
import { ContentSlotRepository, contentSlotRepository } from '../../db/repositories'
import {
  ContentSourceResolver,
  contentSourceResolver,
  type ContentSource,
  type ResolverPoolItem,
} from '../ContentSourceResolver'
import {
  LeadTimeEstimator,
  leadTimeEstimator,
  type ContentComplexity,
} from '../LeadTimeEstimator'
import { GuardrailService, guardrailService, type GuardrailMissionInput } from '../GuardrailService'
import { MediaPoolService, mediaPoolService } from '../MediaPoolService'
import type { Strategy } from './StrategyService'

const COMPONENT = 'autopilot.PlannerService'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** R2.5: the plan must cover a scheduling horizon of at least 7 days ahead. */
export const MIN_PLANNING_HORIZON_DAYS = 7

/**
 * Hard upper bound on the number of slots PLAN will create in a single run, so a
 * pathological cadence (e.g. "50 posts per day") can never generate an unbounded
 * candidate list. The frequency cap normally binds well below this.
 */
export const MAX_SLOTS_PER_PLAN = 500

/**
 * Default rotation of content formats PLAN cycles through when the Strategy does
 * not pin a format per theme. Kept as data (not embedded in logic) so it can be
 * tuned; a reel-forward mix reflects Instagram growth guidance.
 */
export const DEFAULT_FORMAT_ROTATION: readonly ContentFormat[] = ['reel', 'photo', 'carousel']

/**
 * Content-creation complexity per format, feeding {@link LeadTimeEstimator} for
 * user-brief slots. A reel is the most involved to shoot, a photo/story the
 * least. Data, not branching logic, so it can be tuned independently.
 */
export const FORMAT_COMPLEXITY: Record<ContentFormat, ContentComplexity> = {
  photo: 'low',
  story: 'low',
  carousel: 'med',
  reel: 'high',
}

/** Slot statuses that occupy the schedule (count toward coverage + the cap). */
export const ACTIVE_SLOT_STATUSES: readonly ContentSlotStatus[] = [
  'planned',
  'brief-sent',
  'awaiting-approval',
  'ready',
  'scheduled',
  'published',
  'rescheduled',
]

/**
 * The minimal shape of a Mission the planner reads. Accepting a structural type
 * rather than the Mongoose document keeps PLAN decoupled from persistence and
 * unit-testable with plain objects.
 */
export interface PlannerMissionInput {
  /** Mission id — scopes the slots read/created. */
  _id: unknown
  /** Workspace the mission is bound to; scopes the pool + persisted slots. */
  workspaceId: unknown
  /** Drives {@link ContentSourceResolver} preference order (task 9.1). */
  contentSourcePreference: ContentSourcePreference
  /** The posting-frequency cap the plan must respect (R2.7, R13.2). */
  guardrails: {
    postingFrequency: { count: number; per: 'day' | 'week'; windowMs: number }
    bannedTopics?: string[]
  }
}

/** One planned Content_Slot as returned by {@link PlannerService.plan} (design). */
export interface PlannedSlot {
  /** Persisted `ContentSlot._id` (string). */
  slotId: string
  /** Scheduled publish time (within the frequency cap, R2.7). */
  scheduledAt: Date
  /** Content format for the slot. */
  format: ContentFormat
  /** Strategy theme assigned to the slot. */
  theme: string
  /** Resolved Content_Source (pool | user-brief | ai-generated). */
  source: ContentSource
  /**
   * When `source.kind === 'user-brief'`, the time the just-in-time Content_Brief
   * must be sent: `scheduledAt − leadTime` (R7.2). Absent for non-brief sources.
   */
  briefSendAt?: Date
}

/** The result of one PLAN run. */
export interface PlanResult {
  /** The newly created slots this run (empty when the plan was already full). */
  planned: PlannedSlot[]
  /** Count of pre-existing active slots already covering the horizon. */
  existingActiveInHorizon: number
  /** The end of the scheduling horizon considered (≥ now + 7 days, R2.5). */
  horizonEnd: Date
}

/** Per-call options for {@link PlannerService.plan}. */
export interface PlanOptions {
  /** Injectable "current time" (ms) for deterministic tests. Defaults to `Date.now()`. */
  now?: number
  /** Planning horizon in days (≥ 7, R2.5). Defaults to {@link MIN_PLANNING_HORIZON_DAYS}. */
  horizonDays?: number
  /** Minimum spacing (ms) between slots to avoid stacking on an existing time. Default 1 min. */
  minSpacingMs?: number
}

/**
 * Write/read port for Content_Slots. `ContentSlotRepository` satisfies it; a fake
 * lets the scheduling + cap logic be verified without a database.
 */
export interface PlannerSlotStore {
  /** All slots for a mission (planner refresh), earliest scheduled first. */
  findByMission(missionId: string): Promise<IContentSlot[]>
  /** Persist a new slot; resolves to the created document (carrying `_id`). */
  create(doc: Partial<IContentSlot>): Promise<IContentSlot>
}

/** Reads the workspace Media_Pool once per plan (so the resolver can match it). */
export interface PlannerPoolReader {
  listAvailable(workspaceId: unknown): Promise<ResolverPoolItem[]>
}

/** Tunable dependencies for the PLAN stage. */
export interface PlannerServiceOptions {
  /** Slot persistence (defaults to the shared `contentSlotRepository`). */
  slotStore?: PlannerSlotStore
  /** Source resolver (defaults to the shared `contentSourceResolver`). */
  resolver?: Pick<ContentSourceResolver, 'resolve'>
  /** Lead-time estimator (defaults to the shared `leadTimeEstimator`). */
  leadTimeEstimator?: Pick<LeadTimeEstimator, 'estimate'>
  /** Guardrail cap check (defaults to the shared `guardrailService`). */
  guardrailService?: Pick<GuardrailService, 'wouldExceedFrequencyCap'>
  /** Media-pool reader (defaults to the shared `mediaPoolService`). */
  poolReader?: PlannerPoolReader
}

/** Coerce a `Date | number` to epoch milliseconds. */
function toMs(t: Date | number): number {
  return t instanceof Date ? t.getTime() : t
}

/**
 * PLAN stage — turns a Strategy into a cap-respecting Content_Plan of
 * Content_Slots covering ≥7 days, assigning each slot's source and computing the
 * brief send time for user-brief slots (R2.5, R2.7, R7.2).
 */
export class PlannerService {
  private readonly slotStore: PlannerSlotStore
  private readonly resolver: Pick<ContentSourceResolver, 'resolve'>
  private readonly leadTime: Pick<LeadTimeEstimator, 'estimate'>
  private readonly guardrail: Pick<GuardrailService, 'wouldExceedFrequencyCap'>
  private readonly poolReader: PlannerPoolReader

  constructor(options: PlannerServiceOptions = {}) {
    this.slotStore = options.slotStore ?? (contentSlotRepository as unknown as PlannerSlotStore)
    this.resolver = options.resolver ?? contentSourceResolver
    this.leadTime = options.leadTimeEstimator ?? leadTimeEstimator
    this.guardrail = options.guardrailService ?? guardrailService
    this.poolReader = options.poolReader ?? mediaPoolService
  }

  /**
   * Produce (or refresh) the Content_Plan for a Mission (R2.5, R2.7).
   *
   * Steps:
   *   1. Read the Mission's existing slots; the active ones occupy the schedule
   *      (their times feed the cap check; the ones in-horizon count as coverage).
   *   2. Compute the cadence target for the horizon, clamped to what the
   *      frequency cap can actually admit and to {@link MAX_SLOTS_PER_PLAN}.
   *   3. Generate evenly-spaced candidate times across the horizon and admit each
   *      only when {@link GuardrailService.wouldExceedFrequencyCap} is false —
   *      guaranteeing the produced plan never exceeds the cap (Property 2).
   *   4. For each admitted slot, assign a theme + format, resolve its source, and
   *      for user-brief slots compute `briefSendAt = scheduledAt − leadTime`.
   *   5. Persist the new slots and return them.
   *
   * Never creates more than needed to reach the cadence target, so re-running on
   * a fully-planned Mission is a no-op.
   */
  async plan(
    mission: PlannerMissionInput,
    strategy: Strategy,
    options: PlanOptions = {},
  ): Promise<PlanResult> {
    const now = options.now ?? Date.now()
    const horizonDays = Math.max(MIN_PLANNING_HORIZON_DAYS, Math.floor(options.horizonDays ?? MIN_PLANNING_HORIZON_DAYS))
    const horizonMs = horizonDays * DAY_MS
    const horizonEndMs = now + horizonMs
    const minSpacingMs = Math.max(0, options.minSpacingMs ?? MINUTE_MS)
    const missionId = String(mission._id)

    const capMission: GuardrailMissionInput = { guardrails: mission.guardrails }
    const { count: cap, windowMs } = mission.guardrails.postingFrequency

    // 1. Existing slots: active ones occupy the schedule.
    const existing = await this.readExisting(missionId)
    const activeTimes: number[] = []
    let existingActiveInHorizon = 0
    for (const slot of existing) {
      if (!ACTIVE_SLOT_STATUSES.includes(slot.status)) continue
      const at = toMs(slot.scheduledAt)
      activeTimes.push(at)
      if (at > now && at <= horizonEndMs) existingActiveInHorizon++
    }

    // 2. Cadence target for the horizon, clamped by the cap's capacity.
    const cadenceTarget = this.cadenceTarget(strategy, horizonDays)
    const capCapacity = this.capCapacity(cap, windowMs, horizonMs)
    const target = Math.min(cadenceTarget, capCapacity, MAX_SLOTS_PER_PLAN)
    const needed = Math.max(0, target - existingActiveInHorizon)

    if (needed === 0) {
      logger.info('PLAN: content plan already covers the horizon; nothing to add', {
        component: COMPONENT,
        missionId,
        existingActiveInHorizon,
        target,
        horizonDays,
      })
      return { planned: [], existingActiveInHorizon, horizonEnd: new Date(horizonEndMs) }
    }

    // 3. Candidate times, evenly spaced across the horizon.
    const candidates = this.candidateTimes(now, horizonMs, target)

    // Read the pool once so the resolver can match every slot without N reads.
    const pool = await this.readPool(mission.workspaceId)

    const admittedTimes: number[] = [...activeTimes]
    const planned: PlannedSlot[] = []
    let themeIdx = 0
    let formatIdx = 0

    for (const candidate of candidates) {
      if (planned.length >= needed) break

      // Skip a candidate that stacks on an already-occupied time.
      if (admittedTimes.some((t) => Math.abs(t - candidate) < minSpacingMs)) continue

      // Property 2: only admit when the cap is not exceeded.
      if (this.guardrail.wouldExceedFrequencyCap(capMission, candidate, admittedTimes)) continue

      const theme = this.pickTheme(strategy, themeIdx++)
      const format = this.pickFormat(formatIdx++)
      const scheduledAt = new Date(candidate)

      const source = await this.resolver.resolve(mission, { format }, pool)
      const briefSendAt =
        source.kind === 'user-brief'
          ? new Date(candidate - this.leadTime.estimate(format, FORMAT_COMPLEXITY[format]))
          : undefined

      const created = await this.slotStore.create({
        missionId: mission._id as IContentSlot['missionId'],
        workspaceId: mission.workspaceId,
        scheduledAt,
        format,
        theme,
        source: this.toSlotSource(source),
        status: 'planned',
      } as Partial<IContentSlot>)

      admittedTimes.push(candidate)
      planned.push({
        slotId: String((created as { _id?: unknown })._id ?? ''),
        scheduledAt,
        format,
        theme,
        source,
        ...(briefSendAt ? { briefSendAt } : {}),
      })
    }

    logger.info('PLAN: produced content plan', {
      component: COMPONENT,
      missionId,
      created: planned.length,
      existingActiveInHorizon,
      target,
      horizonDays,
    })

    return { planned, existingActiveInHorizon, horizonEnd: new Date(horizonEndMs) }
  }

  /** Read existing slots, degrading to an empty plan on a read failure. */
  private async readExisting(missionId: string): Promise<IContentSlot[]> {
    try {
      return await this.slotStore.findByMission(missionId)
    } catch (error) {
      logger.warn('PLAN: failed to read existing slots; planning from empty', {
        component: COMPONENT,
        missionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /** Read the available Media_Pool once, degrading to an empty pool on failure. */
  private async readPool(workspaceId: unknown): Promise<ResolverPoolItem[]> {
    try {
      return await this.poolReader.listAvailable(workspaceId)
    } catch (error) {
      logger.warn('PLAN: failed to read media pool; resolving without pool', {
        component: COMPONENT,
        workspaceId: String(workspaceId),
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * Number of posts the Strategy cadence asks for over the horizon. A `day`
   * cadence scales by the number of days; a `week` cadence scales by weeks. At
   * least 1 whenever the cadence count is positive so a valid Strategy always
   * yields a plan.
   */
  private cadenceTarget(strategy: Strategy, horizonDays: number): number {
    const count = Math.max(0, Math.floor(strategy.cadence?.count ?? 0))
    if (count === 0) return 0
    const target =
      strategy.cadence.postsPer === 'day'
        ? count * horizonDays
        : Math.ceil((count * horizonDays) / 7)
    return Math.max(1, target)
  }

  /**
   * Maximum number of new actions the rolling-window cap can admit across the
   * horizon: `cap` per window, over `ceil(horizon / window)` windows, plus one
   * cap's worth of headroom for a partial trailing window. Keeps the candidate
   * list bounded when the cadence exceeds the cap.
   */
  private capCapacity(cap: number, windowMs: number, horizonMs: number): number {
    if (!(cap > 0)) return 0
    if (!(windowMs > 0)) return cap
    return cap * Math.ceil(horizonMs / windowMs) + cap
  }

  /**
   * `target` candidate times spread evenly across `(now, now + horizonMs)`,
   * centred within each even sub-interval so none lands exactly on `now` or the
   * horizon edge. Deterministic given `now`, so tests are reproducible.
   */
  private candidateTimes(now: number, horizonMs: number, target: number): number[] {
    if (target <= 0) return []
    const interval = horizonMs / target
    const times: number[] = []
    for (let i = 0; i < target; i++) {
      times.push(Math.round(now + interval * (i + 0.5)))
    }
    return times
  }

  /** Round-robin a Strategy theme; falls back to a generic theme if none given. */
  private pickTheme(strategy: Strategy, index: number): string {
    const themes = strategy.themes && strategy.themes.length > 0 ? strategy.themes : ['general']
    return themes[index % themes.length]
  }

  /** Round-robin the default format rotation. */
  private pickFormat(index: number): ContentFormat {
    return DEFAULT_FORMAT_ROTATION[index % DEFAULT_FORMAT_ROTATION.length]
  }

  /** Map a resolved {@link ContentSource} to the persisted slot `source` shape. */
  private toSlotSource(source: ContentSource): IContentSlot['source'] {
    if (source.kind === 'pool') {
      return {
        kind: 'pool',
        mediaPoolItemId: source.mediaPoolItemId as unknown as IContentSlot['source']['mediaPoolItemId'],
      }
    }
    return { kind: source.kind }
  }
}

/** Shared default instance wired to the real repository + PLAN helpers. */
export const plannerService = new PlannerService()
