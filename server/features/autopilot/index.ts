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
 * Scaffolding note (Task 1): `registerAutoPilot` is intentionally a no-op for
 * now. It is wired into `server/index.ts` so the startup path is in place, but
 * it mounts nothing until the routes and queues land in later tasks. This keeps
 * the server booting cleanly before any endpoints exist.
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
  // No-op scaffold. Routes and queue/worker initialization are wired in by
  // Tasks 17–18. Referencing `_app` intentionally deferred until then.
  logger.info('[autopilot] registerAutoPilot invoked (no-op scaffold)', {
    module: 'autopilot',
    action: 'register',
  })
}
