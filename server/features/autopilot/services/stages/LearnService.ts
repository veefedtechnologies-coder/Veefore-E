/**
 * Auto Pilot — LearnService (LEARN stage of the Operating Loop).
 *
 * LEARN is the final stage of every Operating-Loop iteration. After MEASURE has
 * recorded the current goal-metric value and gathered per-slot performance, LEARN
 * distils that measured performance into a compact **insight** and appends it to
 * the Mission's `strategyMemory`, which feeds the next THINK stage (design "Stage
 * responsibilities" · R2.6):
 *
 *   > `LearnService.learn(mission, measures)` updates the Mission's
 *   > `strategyMemory` (e.g. "reels +40% reach; carousels flat") which feeds the
 *   > next THINK. **Pure function over measured results → stored insights.**
 *
 * The derivation is a **pure, deterministic function over its inputs**
 * ({@link deriveInsights}) — no LLM, no clock, no I/O. It aggregates the
 * per-slot performance from a {@link MeasureResult} by content format and theme,
 * ranks them by the metric aligned with the Mission's Goal, and produces a
 * structured insight (which format/theme performed best, plus a human-readable
 * summary). `learn()` then persists that insight via an injected store
 * (`MissionRepository.appendStrategyMemory`).
 *
 * LearnService is deliberately an **orchestrator + pure core**, matching the
 * other stage services (SenseService/MeasureService): dependencies are injected
 * as ports with the real singletons as defaults, the persistence path degrades
 * gracefully (records an Audit_Record, never throws), and the loop keeps running
 * even when the strategy-memory write fails.
 *
 * ── Graceful degradation ────────────────────────────────────────────────────
 * A single LEARN iteration that cannot persist its insight must not stop the
 * loop. When there is no per-slot signal to learn from, LEARN records nothing
 * and returns `learned: false`. When the store write fails, LEARN records the
 * failure in an Audit_Record and returns `learned: false` with the derived
 * insight still attached. It never throws to the caller.
 *
 * Satisfies Requirements: 2.6
 */

import { logger } from '../../../../config/logger'
import {
  missionRepository,
  type MissionRepository,
} from '../../db/repositories/MissionRepository'
import type { ContentFormat, MissionMetric } from '../../db/models'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
  type AuditEscalationTarget,
} from '../AutoPilotAuditService'
import type { MeasureResult, SlotMetrics, SlotPerformance } from './MeasureService'

const COMPONENT = 'autopilot.LearnService'

/** The insight schema version, stamped on every derived insight for forward-compat. */
export const LEARN_INSIGHT_VERSION = 1

/**
 * The subset of a {@link MeasureResult} LEARN derives insights from. A full
 * `MeasureResult` is assignable to this, but accepting the narrower shape keeps
 * {@link deriveInsights} decoupled and trivially testable with plain objects.
 */
export interface DerivableMeasureResult {
  /** The Goal's target metric this measurement tracked. */
  metric: MissionMetric
  /** The current goal-metric value, when analytics was available. */
  value?: number
  /** The time the measurement was taken. */
  at: Date
  /** Per-slot performance for the Mission's published slots. */
  perSlot: SlotPerformance[]
}

/** Aggregated performance for a single content format across measured slots. */
export interface FormatInsight {
  /** The content format. */
  format: ContentFormat
  /** Number of measured slots (with a usable goal-aligned score) of this format. */
  samples: number
  /** Average goal-aligned score across the samples (rounded to 2 dp). */
  avgScore: number
  /** Average reach across the samples, when reach metrics were present. */
  avgReach?: number
  /** Average engagement across the samples, when engagement metrics were present. */
  avgEngagement?: number
}

/** Aggregated performance for a single content theme across measured slots. */
export interface ThemeInsight {
  /** The content theme. */
  theme: string
  /** Number of measured slots (with a usable goal-aligned score) of this theme. */
  samples: number
  /** Average goal-aligned score across the samples (rounded to 2 dp). */
  avgScore: number
}

/**
 * A structured LEARN insight appended to `Mission.strategyMemory`. Deterministic
 * over the {@link DerivableMeasureResult} it was derived from.
 */
export interface StrategyInsight {
  /** Insight schema version. */
  version: number
  /** The Goal metric the ranking is aligned to. */
  metric: MissionMetric
  /** The per-slot metric field the score was read from (goal-aligned). */
  scoredBy: keyof SlotMetrics
  /** ISO timestamp of the measurement this insight was derived from. */
  measuredAt: string
  /** The current goal-metric value at measurement time, when available. */
  goalValue?: number
  /** Number of measured slots that contributed a usable score. */
  sampleSize: number
  /** Per-format aggregates, ranked best-first (then by format name). */
  byFormat: FormatInsight[]
  /** Per-theme aggregates, ranked best-first (then by theme name). */
  byTheme: ThemeInsight[]
  /** The best-performing format, when at least one format had a score. */
  bestFormat?: FormatInsight
  /** The best-performing theme, when at least one theme had a score. */
  bestTheme?: ThemeInsight
  /** Human-readable one-line summary (e.g. "reel led on engagement…"). */
  summary: string
}

/** Per-call options for one LEARN run. */
export interface LearnOptions {
  /** Who to notify if LEARN cannot record its failure Audit_Record (passed through). */
  escalationTarget?: AuditEscalationTarget
}

/** The result of one LEARN run. */
export interface LearnResult {
  /** `true` when an insight was derived and appended to `strategyMemory` (R2.6). */
  learned: boolean
  /** The derived insight, or `null` when there was no per-slot signal to learn from. */
  insight: StrategyInsight | null
}

/**
 * The minimal shape of a Mission LEARN needs. Accepting a structural type rather
 * than the full Mongoose document keeps the stage decoupled from persistence and
 * unit-testable with plain objects.
 */
export interface LearnMissionInput {
  /** Mission id — scopes the strategy-memory append and Audit_Records. */
  _id: unknown
  /** Workspace the mission is bound to (R1.4). */
  workspaceId: unknown
}

/**
 * Write port for appending a LEARN insight to the Mission's strategy memory.
 * Defaults to the shared `MissionRepository.appendStrategyMemory`.
 */
export interface StrategyMemoryStore {
  appendStrategyMemory(
    missionId: string,
    insight: Record<string, unknown>,
  ): Promise<unknown>
}

/** Tunable dependencies for the LEARN stage. */
export interface LearnServiceOptions {
  /** Strategy-memory append transport (defaults to the shared `missionRepository`). */
  memoryStore?: StrategyMemoryStore
  /** Audit transport for failure records (defaults to the shared service). */
  auditService?: Pick<AutoPilotAuditService, 'record'>
}

/**
 * Map the Mission's Goal metric to the per-slot metric field LEARN ranks by.
 * `reach`/`engagement` map directly; `followers` (which has no per-post analog)
 * uses engagement as the closest per-post growth proxy.
 */
export function scoreFieldForMetric(metric: MissionMetric): keyof SlotMetrics {
  switch (metric) {
    case 'reach':
      return 'reach'
    case 'engagement':
      return 'engagement'
    case 'followers':
      return 'engagement'
    default:
      return 'engagement'
  }
}

/** Round to 2 decimal places (stable, avoids float noise in stored insights). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Return the value when it is a finite number, else `null`. */
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Mean of a non-empty numeric list, rounded to 2 dp. */
function mean(values: number[]): number {
  const sum = values.reduce((a, b) => a + b, 0)
  return round2(sum / values.length)
}

interface Bucket {
  scores: number[]
  reach: number[]
  engagement: number[]
}

function newBucket(): Bucket {
  return { scores: [], reach: [], engagement: [] }
}

/**
 * Derive a {@link StrategyInsight} from a MEASURE result — a **pure,
 * deterministic function** over its input (R2.6). No LLM, no clock, no I/O:
 * the same `measureResult` always yields an identical insight.
 *
 * It aggregates per-slot performance by format and theme, ranks each group by
 * the goal-aligned score (see {@link scoreFieldForMetric}), and produces the
 * best-performing format/theme plus a one-line summary. Ordering is fully
 * deterministic: groups are sorted by average score descending, ties broken by
 * name ascending.
 *
 * Returns `null` when no measured slot carries a usable goal-aligned score —
 * there is nothing to learn about format/theme performance in that case.
 */
export function deriveInsights(
  measureResult: DerivableMeasureResult,
): StrategyInsight | null {
  const metric = measureResult.metric
  const scoredBy = scoreFieldForMetric(metric)

  const byFormatBuckets = new Map<ContentFormat, Bucket>()
  const byThemeBuckets = new Map<string, Bucket>()
  let sampleSize = 0

  for (const slot of measureResult.perSlot) {
    const metrics = slot.metrics
    if (!metrics) continue
    const score = finite(metrics[scoredBy])
    if (score == null) continue

    sampleSize += 1

    const fmt = byFormatBuckets.get(slot.format) ?? newBucket()
    fmt.scores.push(score)
    const r = finite(metrics.reach)
    if (r != null) fmt.reach.push(r)
    const e = finite(metrics.engagement)
    if (e != null) fmt.engagement.push(e)
    byFormatBuckets.set(slot.format, fmt)

    const thm = byThemeBuckets.get(slot.theme) ?? newBucket()
    thm.scores.push(score)
    byThemeBuckets.set(slot.theme, thm)
  }

  // No usable per-slot signal → nothing to learn from this iteration.
  if (sampleSize === 0) return null

  const byFormat: FormatInsight[] = Array.from(byFormatBuckets.entries())
    .map(([format, bucket]) => {
      const insight: FormatInsight = {
        format,
        samples: bucket.scores.length,
        avgScore: mean(bucket.scores),
      }
      if (bucket.reach.length > 0) insight.avgReach = mean(bucket.reach)
      if (bucket.engagement.length > 0) insight.avgEngagement = mean(bucket.engagement)
      return insight
    })
    .sort((a, b) => b.avgScore - a.avgScore || a.format.localeCompare(b.format))

  const byTheme: ThemeInsight[] = Array.from(byThemeBuckets.entries())
    .map(([theme, bucket]) => ({
      theme,
      samples: bucket.scores.length,
      avgScore: mean(bucket.scores),
    }))
    .sort((a, b) => b.avgScore - a.avgScore || a.theme.localeCompare(b.theme))

  const bestFormat = byFormat[0]
  const bestTheme = byTheme[0]

  const insight: StrategyInsight = {
    version: LEARN_INSIGHT_VERSION,
    metric,
    scoredBy,
    measuredAt: measureResult.at.toISOString(),
    sampleSize,
    byFormat,
    byTheme,
    bestFormat,
    bestTheme,
    summary: buildSummary(scoredBy, sampleSize, byFormat, bestTheme),
  }
  const goalValue = finite(measureResult.value)
  if (goalValue != null) insight.goalValue = goalValue
  return insight
}

/** Build a deterministic, human-readable one-line summary of the insight. */
function buildSummary(
  scoredBy: keyof SlotMetrics,
  sampleSize: number,
  byFormat: FormatInsight[],
  bestTheme?: ThemeInsight,
): string {
  const posts = sampleSize === 1 ? '1 post' : `${sampleSize} posts`
  if (byFormat.length === 0) return `No measurable ${scoredBy} signal across ${posts}.`

  const best = byFormat[0]
  const parts = [`${best.format} led on ${scoredBy} (avg ${best.avgScore} over ${posts})`]

  const runnerUp = byFormat[1]
  if (runnerUp) parts.push(`${runnerUp.format} next (avg ${runnerUp.avgScore})`)
  if (bestTheme) parts.push(`top theme "${bestTheme.theme}" (avg ${bestTheme.avgScore})`)

  return parts.join('; ') + '.'
}

/**
 * LEARN stage — derives a strategy insight from a MEASURE result and appends it
 * to the Mission's strategy memory, which feeds the next THINK (R2.6).
 */
export class LearnService {
  private readonly memoryStore: StrategyMemoryStore
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>

  constructor(options: LearnServiceOptions = {}) {
    this.memoryStore = options.memoryStore ?? (missionRepository as MissionRepository)
    this.auditService = options.auditService ?? autoPilotAuditService
  }

  /**
   * Run the LEARN stage for a Mission (R2.6).
   *
   * Derives an insight from the MEASURE result via the pure {@link deriveInsights}
   * function and, when there is a signal to learn from, appends it to the
   * Mission's `strategyMemory`. Degrades gracefully — records an Audit_Record and
   * returns `learned:false` when there is nothing to learn or the store write
   * fails — and never throws so the loop keeps running.
   */
  async learn(
    mission: LearnMissionInput,
    measureResult: DerivableMeasureResult,
    options: LearnOptions = {},
  ): Promise<LearnResult> {
    const missionId = String(mission._id)
    const workspaceId = String(mission.workspaceId)

    const insight = deriveInsights(measureResult)
    if (insight == null) {
      logger.info('LEARN: no per-slot signal to learn from — skipping strategy-memory update', {
        component: COMPONENT,
        missionId,
        metric: measureResult.metric,
      })
      return { learned: false, insight: null }
    }

    try {
      await this.memoryStore.appendStrategyMemory(
        missionId,
        insight as unknown as Record<string, unknown>,
      )
      logger.info('LEARN: appended strategy-memory insight', {
        component: COMPONENT,
        missionId,
        metric: insight.metric,
        sampleSize: insight.sampleSize,
        bestFormat: insight.bestFormat?.format,
      })
      return { learned: true, insight }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('LEARN: failed to append strategy-memory insight', {
        component: COMPONENT,
        missionId,
        metric: insight.metric,
        error: message,
      })
      await this.recordFailure(
        mission,
        workspaceId,
        'learn.memory-record-failed',
        { metric: insight.metric, sampleSize: insight.sampleSize, detail: message },
        options.escalationTarget,
      )
      return { learned: false, insight }
    }
  }

  /**
   * Record a LEARN failure in an Audit_Record (best-effort). The audit service
   * already retries + escalates on a write failure, and LEARN swallows any
   * residual error so recording a failure never itself crashes the loop.
   */
  private async recordFailure(
    mission: LearnMissionInput,
    workspaceId: string,
    action: string,
    context: Record<string, unknown>,
    escalationTarget?: AuditEscalationTarget,
  ): Promise<void> {
    try {
      await this.auditService.record(
        {
          missionId: mission._id,
          workspaceId,
          stage: 'LEARN',
          action,
          outcome: 'failure',
          reversible: false,
          triggeringContext: context,
        },
        escalationTarget,
      )
    } catch (error) {
      logger.warn('LEARN: failed to record failure audit', {
        component: COMPONENT,
        missionId: String(mission._id),
        action,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Shared default instance wired to the real mission repository + audit service. */
export const learnService = new LearnService()
