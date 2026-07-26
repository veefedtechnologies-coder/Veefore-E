/**
 * Auto Pilot — MeasureService (MEASURE stage of the Operating Loop).
 *
 * MEASURE is the penultimate stage of every Operating-Loop iteration. After ACT
 * has published/scheduled the planned work, MEASURE records how the Mission is
 * tracking toward its Goal so THINK/LEARN can revise the strategy next tick
 * (design "Stage responsibilities" · R3.4):
 *
 *   • it reads the account's **current goal-metric value** — the numeric value
 *     of the Mission's target metric (`followers` | `engagement` | `reach`) —
 *     from the existing analytics performance summary
 *     (`AnalyticsService.getPerformanceSummary`, the same source SENSE reads);
 *     and
 *   • it collects **per-slot performance** for the Mission's published slots so
 *     the downstream LEARN stage can correlate formats/themes with outcomes.
 *
 * The goal-metric value is appended to the Mission's `progress` history via
 * `MissionRepository.appendProgress` (a `{ at, value }` point — the shape the
 * Mission model persists). The richer per-slot performance is returned to the
 * caller (LEARN consumes it) rather than persisted on the mission, keeping the
 * progress history compact and matching the model schema.
 *
 * MeasureService is deliberately an **orchestrator**, not a re-implementation:
 * it composes the analytics service, the slot repository, and (optionally) a
 * per-post metrics reader — all injected as ports with real singletons as
 * defaults — so its extraction, recording, and degradation logic is fully
 * unit-testable without a database or network.
 *
 * ── Graceful degradation (loop must never crash) ────────────────────────────
 * A single MEASURE iteration that cannot read analytics must not stop the loop.
 * When analytics is unavailable (throws, returns no summary, or yields no value
 * for the goal metric), MEASURE records the failure in an Audit_Record, skips
 * appending a progress point (there is no value to record), and returns
 * `recorded: false` with whatever per-slot performance it could gather. It never
 * throws to the caller.
 *
 * Satisfies Requirements: 3.4
 */

import { logger } from '../../../../config/logger'
import { analyticsService } from '../../../../services/AnalyticsService'
import {
  contentSlotRepository,
  type ContentSlotRepository,
} from '../../db/repositories/ContentSlotRepository'
import {
  missionRepository,
  type MissionRepository,
} from '../../db/repositories/MissionRepository'
import type {
  ContentFormat,
  ContentSlotStatus,
  IContentSlot,
  IMissionProgressPoint,
  MissionMetric,
} from '../../db/models'
import {
  AutoPilotAuditService,
  autoPilotAuditService,
  type AuditEscalationTarget,
} from '../AutoPilotAuditService'
import type { PerformanceSummary } from './SenseService'

const COMPONENT = 'autopilot.MeasureService'

/** Default analytics look-back window (days) MEASURE reads each iteration. */
export const DEFAULT_MEASURE_ANALYTICS_DAYS = 30

/** The slot status whose members MEASURE reports per-slot performance for. */
export const MEASURED_SLOT_STATUS: ContentSlotStatus = 'published'

/**
 * Read port for the account's current analytics. Defaults to the existing
 * `AnalyticsService.getPerformanceSummary`, the same source SENSE uses. Kept
 * structural so the MEASURE logic stays decoupled and trivially testable.
 */
export interface MeasureAnalyticsReader {
  getPerformanceSummary(workspaceId: string, days: number): Promise<PerformanceSummary>
}

/** Read port for the Mission's slots (published slots drive per-slot metrics). */
export interface MeasureSlotStore {
  findByMissionAndStatus(missionId: string, status: ContentSlotStatus): Promise<IContentSlot[]>
}

/** Write port for appending a MEASURE progress point to the Mission history. */
export interface MeasureProgressStore {
  appendProgress(missionId: string, point: IMissionProgressPoint): Promise<unknown>
}

/** Per-post performance metrics for a single published slot (all optional). */
export interface SlotMetrics {
  reach?: number
  engagement?: number
  likes?: number
  comments?: number
  shares?: number
  views?: number
}

/**
 * Optional read port for per-post metrics. No per-post analytics reader is wired
 * at the MEASURE layer yet, so it defaults to unconfigured: per-slot entries then
 * carry the slot's metadata (format, theme, schedule, linked content) with
 * `metrics` omitted. A later task can inject a real reader without changing the
 * MEASURE contract.
 */
export interface SlotPerformanceReader {
  /** Resolve metrics for a published slot, or `null` when none are available. */
  read(slot: IContentSlot): Promise<SlotMetrics | null>
}

/**
 * The minimal shape of a Mission MEASURE needs. Accepting a structural type
 * rather than the full Mongoose document keeps the stage decoupled from
 * persistence and unit-testable with plain objects.
 */
export interface MeasureMissionInput {
  /** Mission id — scopes the progress point, slot query, and Audit_Records. */
  _id: unknown
  /** Workspace the mission (and its analytics) is bound to (R1.4). */
  workspaceId: unknown
  /** The Goal whose target metric MEASURE records progress toward (R3.4). */
  goal: { metric: MissionMetric }
}

/** Per-call options for one MEASURE run. */
export interface MeasureOptions {
  /** Injectable clock (epoch ms) so the progress-point time is deterministic. */
  now?: number
  /** Analytics look-back window in days. Defaults to {@link DEFAULT_MEASURE_ANALYTICS_DAYS}. */
  analyticsDays?: number
  /** Who to notify if MEASURE cannot record its Audit_Record (passed through). */
  escalationTarget?: AuditEscalationTarget
}

/** Per-slot performance snapshot MEASURE returns for the LEARN stage. */
export interface SlotPerformance {
  /** The Content_Slot id. */
  slotId: string
  /** The slot's content format. */
  format: ContentFormat
  /** The slot's content theme. */
  theme: string
  /** The slot's scheduled publish time. */
  scheduledAt: Date
  /** The linked `ContentModel` execution record, when the slot reached ACT. */
  contentId?: string
  /** Per-post metrics, when a {@link SlotPerformanceReader} supplied them. */
  metrics?: SlotMetrics
}

/** The result of one MEASURE run. */
export interface MeasureResult {
  /** The Goal's target metric this run measured. */
  metric: MissionMetric
  /** The current goal-metric value, when analytics was available. */
  value?: number
  /** The time the measurement was taken (matches the recorded progress point). */
  at: Date
  /** `true` when a progress point was appended to the Mission history (R3.4). */
  recorded: boolean
  /** Per-slot performance for the Mission's published slots (for LEARN). */
  perSlot: SlotPerformance[]
  /** `true` when the current goal-metric value could be read from analytics. */
  analyticsAvailable: boolean
}

/** Tunable dependencies for the MEASURE stage. */
export interface MeasureServiceOptions {
  /** Analytics read transport (defaults to the shared `analyticsService`). */
  analyticsReader?: MeasureAnalyticsReader
  /** Slot read transport (defaults to the shared `contentSlotRepository`). */
  slotStore?: MeasureSlotStore
  /** Progress append transport (defaults to the shared `missionRepository`). */
  progressStore?: MeasureProgressStore
  /** Optional per-post metrics reader (defaults to none). */
  slotPerformanceReader?: SlotPerformanceReader
  /** Audit transport for failure records (defaults to the shared service). */
  auditService?: Pick<AutoPilotAuditService, 'record'>
}

const defaultAnalyticsReader: MeasureAnalyticsReader = {
  getPerformanceSummary: (workspaceId, days) =>
    analyticsService.getPerformanceSummary(workspaceId, days),
}

/** Return the first argument that is a finite number, else `null`. */
function firstFinite(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/**
 * Extract the numeric value of the Mission's goal metric from an analytics
 * performance summary. Prefers the top-level metric fields the summary exposes
 * and falls back to the equivalent `overview.*` aggregate. Returns `null` when
 * no usable value is present so the caller can degrade rather than record a
 * meaningless progress point.
 */
export function extractGoalMetricValue(
  summary: PerformanceSummary | null | undefined,
  metric: MissionMetric,
): number | null {
  if (summary == null) return null
  const s = summary as unknown as {
    followers?: number
    reach?: number
    engagement?: number
    overview?: {
      latestFollowers?: number
      totalFollowers?: number
      totalReach?: number
      avgEngagement?: number
    }
  }
  switch (metric) {
    case 'followers':
      return firstFinite(s.followers, s.overview?.latestFollowers, s.overview?.totalFollowers)
    case 'reach':
      return firstFinite(s.reach, s.overview?.totalReach)
    case 'engagement':
      return firstFinite(s.engagement, s.overview?.avgEngagement)
    default:
      return null
  }
}

/**
 * MEASURE stage — records the current goal-metric value into the Mission's
 * progress history and collects per-slot performance for LEARN (R3.4).
 */
export class MeasureService {
  private readonly analyticsReader: MeasureAnalyticsReader
  private readonly slotStore: MeasureSlotStore
  private readonly progressStore: MeasureProgressStore
  private readonly slotPerformanceReader?: SlotPerformanceReader
  private readonly auditService: Pick<AutoPilotAuditService, 'record'>

  constructor(options: MeasureServiceOptions = {}) {
    this.analyticsReader = options.analyticsReader ?? defaultAnalyticsReader
    this.slotStore = options.slotStore ?? (contentSlotRepository as ContentSlotRepository)
    this.progressStore = options.progressStore ?? (missionRepository as MissionRepository)
    this.slotPerformanceReader = options.slotPerformanceReader
    this.auditService = options.auditService ?? autoPilotAuditService
  }

  /**
   * Run the MEASURE stage for a Mission (R3.4).
   *
   * Collects per-slot performance for the Mission's published slots, reads the
   * current goal-metric value from analytics, and — when a value is available —
   * appends a `{ at, value }` progress point to the Mission history. Degrades
   * gracefully (records an Audit_Record, skips the progress point) when
   * analytics is unavailable, and never throws so the loop keeps running.
   */
  async measure(mission: MeasureMissionInput, options: MeasureOptions = {}): Promise<MeasureResult> {
    const at = new Date(options.now ?? Date.now())
    const analyticsDays = options.analyticsDays ?? DEFAULT_MEASURE_ANALYTICS_DAYS
    const workspaceId = String(mission.workspaceId)
    const missionId = String(mission._id)
    const metric = mission.goal.metric

    // Per-slot performance is gathered regardless of the analytics read so LEARN
    // still has slot-level signal even on a degraded iteration.
    const perSlot = await this.collectSlotPerformance(mission, missionId)

    // Read the current goal-metric value from the analytics performance summary.
    let value: number | null = null
    try {
      const summary = await this.analyticsReader.getPerformanceSummary(workspaceId, analyticsDays)
      if (summary == null) throw new Error('analytics returned no summary')
      value = extractGoalMetricValue(summary, metric)
      if (value == null) throw new Error(`analytics summary has no '${metric}' value`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('MEASURE: goal-metric value unavailable — skipping progress point', {
        component: COMPONENT,
        missionId,
        workspaceId,
        metric,
        error: message,
      })
      await this.recordFailure(
        mission,
        workspaceId,
        'measure.metric-unavailable',
        { metric, detail: message },
        options.escalationTarget,
      )
      return { metric, at, recorded: false, perSlot, analyticsAvailable: false }
    }

    // R3.4: append the current goal-metric value to the Mission progress history.
    let recorded = false
    try {
      await this.progressStore.appendProgress(missionId, { at, value })
      recorded = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('MEASURE: failed to append progress point', {
        component: COMPONENT,
        missionId,
        metric,
        value,
        error: message,
      })
      await this.recordFailure(
        mission,
        workspaceId,
        'measure.progress-record-failed',
        { metric, value, detail: message },
        options.escalationTarget,
      )
    }

    return { metric, value, at, recorded, perSlot, analyticsAvailable: true }
  }

  /**
   * Collect per-slot performance for the Mission's published slots. Each entry
   * carries the slot's metadata and — when a {@link SlotPerformanceReader} is
   * configured — its per-post metrics. Best-effort: a failure to read slots (or
   * a single slot's metrics) degrades to fewer/none entries rather than
   * stopping MEASURE.
   */
  private async collectSlotPerformance(
    mission: MeasureMissionInput,
    missionId: string,
  ): Promise<SlotPerformance[]> {
    let slots: IContentSlot[]
    try {
      slots = await this.slotStore.findByMissionAndStatus(missionId, MEASURED_SLOT_STATUS)
    } catch (error) {
      logger.warn('MEASURE: failed to read published slots — no per-slot performance', {
        component: COMPONENT,
        missionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }

    const performances: SlotPerformance[] = []
    for (const slot of slots) {
      const entry: SlotPerformance = {
        slotId: String((slot as { _id?: unknown })._id ?? ''),
        format: slot.format,
        theme: slot.theme,
        scheduledAt: slot.scheduledAt,
      }
      if (slot.contentId != null) entry.contentId = String(slot.contentId)

      if (this.slotPerformanceReader) {
        try {
          const metrics = await this.slotPerformanceReader.read(slot)
          if (metrics) entry.metrics = metrics
        } catch (error) {
          logger.warn('MEASURE: per-slot metrics read failed — omitting metrics', {
            component: COMPONENT,
            missionId,
            slotId: entry.slotId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      performances.push(entry)
    }
    return performances
  }

  /**
   * Record a MEASURE failure in an Audit_Record (best-effort). The audit service
   * already retries + escalates on a write failure, and MEASURE swallows any
   * residual error so recording a failure never itself crashes the loop.
   */
  private async recordFailure(
    mission: MeasureMissionInput,
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
          stage: 'MEASURE',
          action,
          outcome: 'failure',
          reversible: false,
          triggeringContext: context,
        },
        escalationTarget,
      )
    } catch (error) {
      logger.warn('MEASURE: failed to record failure audit', {
        component: COMPONENT,
        missionId: String(mission._id),
        action,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Shared default instance wired to the real analytics + slot/mission repos. */
export const measureService = new MeasureService()
