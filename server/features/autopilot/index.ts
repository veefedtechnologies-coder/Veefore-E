/**
 * VeeGPT Auto Pilot — Public Module Entry Point
 *
 * VeeGPT Auto Pilot is an autonomous, goal-driven growth agent. It composes
 * existing Veefore services (analytics, research, aiServiceManager, the
 * AutomationRule stack, TieredJobScheduler, SimpleInstagramPublisher,
 * withAIFeature, the notification queue) into a continuous Operating Loop:
 * SENSE → THINK → PLAN → GATE → ACT → MEASURE → LEARN.
 *
 * This module is the single import surface for the feature. It:
 *  1. Re-exports the public services, models, repositories, queues, workers,
 *     controllers, routes, and ports (barrel exports below) so callers import
 *     from this one path rather than deep-linking into feature internals.
 *  2. Exposes `registerAutoPilot(app)` which must be called once during server
 *     startup to mount routes and initialize queues/workers.
 *
 * Routing note (Task 18.1): the `/api/v1/autopilot` router is mounted by
 * `mountV1Routes` in `server/routes/v1/index.ts` (the design's intended mount
 * point), so route mounting does NOT happen here. `registerAutoPilot` remains a
 * no-op reserved for lazy BullMQ queue/worker initialization, and is wired into
 * `server/index.ts` so that startup hook is in place. This keeps the server
 * booting cleanly regardless of Redis availability.
 *
 * Satisfies Requirements: 1
 */

import type { Express } from 'express'
import logger from '../../config/logger'

// ---------------------------------------------------------------------------
// Barrel re-exports — feature internals surface through this single path.
// (Empty until the corresponding tasks populate them.)
// ---------------------------------------------------------------------------

export * from './db/models'
export * from './db/repositories'
export * from './services'
export * from './services/stages'
export * from './queues'
export * from './workers'
export * from './controllers'
export * from './routes'
export * from './ports'

// ---------------------------------------------------------------------------
// Registration entry point
// ---------------------------------------------------------------------------

/**
 * Register the Auto Pilot feature with the Express application.
 *
 * Responsibilities (added incrementally by later tasks):
 *  - Mount the `/api/v1/autopilot` routes.
 *  - Lazily initialize the BullMQ queues/workers (`autopilot-loop`,
 *    `autopilot-brief`, `autopilot-publish`, `autopilot-automation`).
 *
 * Currently a no-op: it logs that Auto Pilot is registered and returns without
 * mounting anything, so wiring this into server startup cannot break the boot
 * sequence before endpoints exist.
 *
 * Safe to call once during server startup.
 */
export function registerAutoPilot(_app: Express): void {
  logger.info('[autopilot] registerAutoPilot invoked', { module: 'autopilot', action: 'register' })

  // Start the BullMQ workers + resume active missions' loops. Fully guarded and
  // async so it can never break the boot sequence, and a no-op without Redis
  // (the worker initializers return null when REDIS_URL is absent).
  void (async () => {
    try {
      const [{ getAutopilotLoopWorker }, { getAutopilotPublishWorker }, { getAutopilotBriefWorker }, { getAutopilotAutomationWorker }] =
        await Promise.all([
          import('./workers/autopilotLoopWorker'),
          import('./workers/autopilotPublishWorker'),
          import('./workers/autopilotBriefWorker'),
          import('./workers/autopilotAutomationWorker'),
        ])

      const loop = getAutopilotLoopWorker()
      const publish = getAutopilotPublishWorker()
      getAutopilotBriefWorker()
      getAutopilotAutomationWorker()

      if (!loop || !publish) {
        logger.warn('[autopilot] workers not started (Redis unavailable) — autonomous loop/publish disabled', {
          module: 'autopilot',
        })
        return
      }

      // Resume the repeatable Operating-Loop job for every ACTIVE mission, so
      // after a server restart Auto Pilot keeps sensing/planning/posting toward
      // the goal without the user having to re-activate.
      try {
        const { missionRepository } = await import('./db/repositories')
        const { AutopilotLoopQueueManager } = await import('./queues/autopilotLoopQueue')
        const active = await missionRepository.findActiveMissions()
        let resumed = 0
        for (const mission of active) {
          const ok = await AutopilotLoopQueueManager.scheduleMission({
            missionId: String(mission._id),
            workspaceId: String(mission.workspaceId),
          })
          if (ok) resumed++
        }
        logger.info('[autopilot] workers started; resumed active mission loops', {
          module: 'autopilot',
          activeMissions: active.length,
          resumed,
        })
      } catch (e) {
        logger.warn('[autopilot] failed to resume active mission loops', {
          module: 'autopilot',
          error: (e as Error).message,
        })
      }
    } catch (e) {
      logger.warn('[autopilot] worker startup failed', {
        module: 'autopilot',
        error: (e as Error).message,
      })
    }
  })()
}
