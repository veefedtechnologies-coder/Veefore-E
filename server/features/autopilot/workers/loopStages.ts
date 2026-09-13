/**
 * Auto Pilot — default Operating-Loop stage assembly.
 *
 * {@link AutoPilotOrchestrator} is a pure *composer*: it runs an injected list of
 * {@link LoopStageStep}s in canonical order but knows nothing about the concrete
 * stage services. Assembling those steps — wrapping the real stage services and
 * threading each stage's output to the next — is the wiring the orchestrator left
 * to the loop worker (see `AutoPilotOrchestrator` file header · Task 17.2).
 *
 * This module builds the default {@link LoopStageStep}[] from the shared stage
 * singletons whose data-access dependencies are available as ready-wired
 * services:
 *
 *   SENSE  → `senseService.sense(mission)`               (analytics + trend research)
 *   THINK  → `strategyService.deriveStrategy(mission, sense)` (LLM strategy, persisted)
 *   PLAN   → `plannerService.plan(mission, strategy)`    (produce/refresh Content_Slots)
 *   MEASURE→ `measureService.measure(mission)`           (record goal-metric progress)
 *   LEARN  → `learnService.learn(mission, measure)`      (update strategy memory)
 *
 * The stages compose through the per-iteration {@link LoopContext.shared} bag:
 * SENSE publishes its result for THINK, THINK publishes the derived Strategy for
 * PLAN, and MEASURE publishes its result for LEARN. Each wrapped service is
 * itself failure-tolerant (it records an Audit_Record and returns a degraded
 * result rather than throwing), so a missing input on one tick simply yields a
 * reduced result and the loop recovers on the next tick.
 *
 * The GATE and ACT stages are intentionally not part of this default assembly:
 * they operate on per-slot generated content items (captioned media + drafted
 * automations produced by the content-generation pipeline of Tasks 11–14), which
 * are not derivable from a single stage-service call. The orchestrator skips any
 * stage with no registered step, so their absence leaves the SENSE→…→LEARN
 * cadence running; they are added to this assembly once that per-slot pipeline is
 * composed. Callers may also inject additional/replacement steps via
 * {@link buildDefaultLoopStages}'s `extraStages` to override this default.
 */

import { logger } from '../../../config/logger'
import { missionRepository, type MissionRepository } from '../db/repositories'
import type { LoopStageStep, LoopContext } from '../services/AutoPilotOrchestrator'
import { mediaPoolService } from '../services/MediaPoolService'
import { cachedDescription, visionGroundingService } from '../services/VisionGroundingService'
import { loadWorkspaceAIPreferences } from '../services/MissionAIPreferences'
import type { MediaInventoryItem } from '../services/stages'
import { buildGateActStage } from './gateActStage'
import {
  senseService,
  strategyService,
  plannerService,
  learnService,
  SenseService,
  StrategyService,
  PlannerService,
  MeasureService,
  LearnService,
  slotMetricsReader,
  type SenseResult,
  type Strategy,
  type MeasureResult,
} from '../services/stages'

const COMPONENT = 'autopilot.loopStages'

/**
 * Max pool items THINK vision-analyzes for the planning inventory per tick.
 * Bounds first-plan cost; descriptions are cached so later ticks are free.
 */
const THINK_VISION_INVENTORY_LIMIT = 12

/** Keys the default stages use to thread data through {@link LoopContext.shared}. */
export const SHARED_KEYS = {
  sense: 'sense.result',
  strategy: 'think.strategy',
  measure: 'measure.result',
} as const

/** Injectable dependencies for {@link buildDefaultLoopStages} (defaults to the singletons). */
export interface DefaultLoopStagesDeps {
  sense?: Pick<SenseService, 'sense'>
  strategy?: Pick<StrategyService, 'deriveStrategy'>
  planner?: Pick<PlannerService, 'plan'>
  measure?: Pick<MeasureService, 'measure'>
  learn?: Pick<LearnService, 'learn'>
  /** Persists the THINK strategy output (defaults to `missionRepository`). */
  missionStore?: Pick<MissionRepository, 'updateStrategy'>
  /** Extra/replacement stage steps appended after the defaults (e.g. GATE/ACT). */
  extraStages?: LoopStageStep[]
}

/**
 * Assemble the default Operating-Loop {@link LoopStageStep}[] wrapping the real
 * stage services. See the module header for the composition contract.
 */
export function buildDefaultLoopStages(deps: DefaultLoopStagesDeps = {}): LoopStageStep[] {
  const sense = deps.sense ?? senseService
  const strategy = deps.strategy ?? strategyService
  const planner = deps.planner ?? plannerService
  // MEASURE with a real per-post metrics reader wired in, so LEARN gets genuine
  // per-slot performance (reach/engagement/likes…) and THINK can bias toward the
  // formats/themes that actually work — closing the improve-over-time loop.
  const measure = deps.measure ?? new MeasureService({ slotPerformanceReader: slotMetricsReader })
  const learn = deps.learn ?? learnService
  const missionStore = deps.missionStore ?? missionRepository

  const senseStep: LoopStageStep = {
    stage: 'SENSE',
    async run(ctx: LoopContext) {
      const result = await sense.sense(ctx.mission as any)
      ctx.shared.set(SHARED_KEYS.sense, result)
      return { escalations: result.escalated ? 1 : 0 }
    },
  }

  const thinkStep: LoopStageStep = {
    stage: 'THINK',
    async run(ctx: LoopContext) {
      const senseResult = (ctx.shared.get(SHARED_KEYS.sense) as SenseResult | undefined) ?? {
        reducedInputs: [],
        analyticsFailureStreak: 0,
        escalated: false,
      }
      // Load the workspace's configured AI settings ONCE per tick (model, BYO
      // keys, persona, creativity, content-safety, memory) so THINK's strategy
      // call and the vision inventory below honor the same "AI Models" settings
      // the rest of the app's AI features do.
      const workspaceId = (ctx.mission as { workspaceId?: unknown }).workspaceId
      const workspaceAIPreferences = await loadWorkspaceAIPreferences(workspaceId)

      // Ground the strategy in the media the creator actually has: summarise the
      // mission's available pool (VISION descriptions + user intent) so THINK
      // proposes themes/formats it can actually produce, not generic ideas.
      // Vision-analyzes items that aren't cached yet (bounded), so planning is
      // media-aware from the first tick; results are cached for later stages.
      try {
        const pool = await mediaPoolService.listAvailableByMission(workspaceId, ctx.missionId)
        const batch = pool.slice(0, THINK_VISION_INVENTORY_LIMIT)
        // Ensure a vision description for each item (cached after first analysis).
        for (const item of batch) {
          if (!cachedDescription(item as unknown as { visionAnalysis?: Record<string, unknown> })) {
            await visionGroundingService.ensureDescription(
              item as unknown as Parameters<typeof visionGroundingService.ensureDescription>[0],
              workspaceId,
              workspaceAIPreferences,
            )
          }
        }
        const inventory: MediaInventoryItem[] = batch.map((item) => {
          const description = cachedDescription(item as unknown as { visionAnalysis?: Record<string, unknown> })
          const intent = (item as { userIntent?: string }).userIntent
          return {
            mediaType: (item as { mediaType?: string }).mediaType,
            ...(description ? { description } : {}),
            ...(intent ? { intent } : {}),
          }
        })
        ;(ctx.mission as { mediaInventory?: MediaInventoryItem[] }).mediaInventory = inventory
      } catch (error) {
        logger.warn('THINK: failed to gather media inventory — continuing without it', {
          component: COMPONENT,
          missionId: ctx.missionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      ;(ctx.mission as { workspaceAIPreferences?: unknown }).workspaceAIPreferences = workspaceAIPreferences

      // Load the last 15 agent memory entries so THINK knows what was done
      // recently and avoids repeating themes/actions already executed.
      try {
        const agentMemory = await missionRepository.getAgentMemory(ctx.missionId, 15)
        if (agentMemory.length > 0) {
          ;(ctx.mission as { agentMemory?: unknown }).agentMemory = agentMemory
        }
      } catch {
        /* best-effort — strategy works without memory */
      }

      const outcome = await strategy.deriveStrategy(ctx.mission as any, senseResult)
      if (outcome.status === 'ok') {
        ctx.shared.set(SHARED_KEYS.strategy, outcome.strategy)
        // Persist the freshest strategy so a restart resumes from it (R2.6).
        try {
          await missionStore.updateStrategy(ctx.missionId, outcome.strategy as unknown as Record<string, unknown>)
        } catch (error) {
          logger.warn('THINK: failed to persist strategy; continuing with in-memory copy', {
            component: COMPONENT,
            missionId: ctx.missionId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return {}
    },
  }

  const planStep: LoopStageStep = {
    stage: 'PLAN',
    async run(ctx: LoopContext) {
      // Prefer the strategy THINK just derived; fall back to the persisted one.
      const derived = ctx.shared.get(SHARED_KEYS.strategy) as Strategy | undefined
      const persisted = ctx.mission.strategy as unknown as Strategy | undefined
      const strategyToPlan = derived ?? persisted
      if (!strategyToPlan) {
        // No strategy this tick (THINK asked to retry next iteration) — nothing
        // to plan against; recover on the next tick.
        return {}
      }
      await planner.plan(ctx.mission as any, strategyToPlan, { now: ctx.now })
      return {}
    },
  }

  const measureStep: LoopStageStep = {
    stage: 'MEASURE',
    async run(ctx: LoopContext) {
      const result = await measure.measure(ctx.mission as any, { now: ctx.now })
      ctx.shared.set(SHARED_KEYS.measure, result)

      // Goal completion (R3): once the measured goal-metric value reaches the
      // target, the mission is done — mark it `completed` and remove its
      // repeatable loop job so Auto Pilot stops working on it. Until then the
      // loop keeps running: PLAN refills the calendar and GATE/ACT keep posting,
      // driving the account toward the goal.
      const target = (ctx.mission as any)?.goal?.targetValue
      if (
        result.value != null &&
        typeof target === 'number' &&
        target > 0 &&
        result.value >= target
      ) {
        try {
          await missionRepository.updateStatus(ctx.missionId, 'completed')
          const { AutopilotLoopQueueManager } = await import('../queues/autopilotLoopQueue')
          await AutopilotLoopQueueManager.removeMission(ctx.missionId)
          logger.info('MEASURE: goal reached — mission completed, loop stopped', {
            component: COMPONENT,
            missionId: ctx.missionId,
            metric: result.metric,
            value: result.value,
            target,
          })
        } catch (error) {
          logger.warn('MEASURE: goal reached but failed to complete/stop mission', {
            component: COMPONENT,
            missionId: ctx.missionId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      return result.value != null ? { progressValue: result.value } : {}
    },
  }

  const learnStep: LoopStageStep = {
    stage: 'LEARN',
    async run(ctx: LoopContext) {
      const measureResult = ctx.shared.get(SHARED_KEYS.measure) as MeasureResult | undefined
      if (!measureResult) return {}
      await learn.learn(ctx.mission as any, measureResult)
      return {}
    },
  }

  // GATE→ACT: draft captions for planned slots, route them through the
  // approval gate (copilot → Approval_Cards; autopilot → auto-execute within
  // guardrails), and schedule auto-executed slots for publishing. Runs after
  // PLAN so it operates on the slots PLAN just produced, and before MEASURE.
  const gateActStep = buildGateActStage()

  return [
    senseStep,
    thinkStep,
    planStep,
    gateActStep,
    measureStep,
    learnStep,
    ...(deps.extraStages ?? []),
  ]
}
