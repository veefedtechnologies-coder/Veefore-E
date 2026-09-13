/**
 * Auto Pilot — main router (`/api/v1/autopilot`).
 *
 * The single Auto Pilot router mounted in `server/routes/v1/index.ts`. It owns
 * the Mission lifecycle + Operating-Loop control-plane endpoints and composes
 * the self-contained sub-routers that landed in earlier tasks:
 *
 *   • Mission CRUD + lifecycle + slots + activity + budget + undo (this file)
 *   • `mediaRouter`    — Media_Pool endpoints            (Task 7.2)
 *   • `approvalRouter` — Approval_Card lifecycle endpoints (Task 13.2)
 *   • `briefRouter`    — Content_Brief delivery endpoint  (Task 10.3)
 *
 * Every route is protected by `requireAuth`; workspace/account ownership is
 * enforced inside {@link AutoPilotController}. The composed sub-routers keep
 * their own `requireAuth` guards, so mounting them here does not change their
 * protection. Endpoint paths match the design's REST API table.
 *
 * Satisfies Requirements: 1.1, 1.5, 1.6, 1.7, 1.8, 3.5, 14.5, 16.1
 */

import { Router } from 'express'
import { requireAuth } from '../../../middleware/require-auth'
import { requireFeature, requireSubscription } from '../../../middleware/entitlement.middleware'
import { autoPilotController } from '../controllers/autopilot.controller'
import { mediaRouter } from './media.routes'
import { approvalRouter } from './approval.routes'
import { briefRouter } from './brief.routes'
import { setupRouter } from './setup.routes'

const autopilotRouter = Router()

// ── PLAN ENFORCEMENT (Auto Pilot = Pro+) ─────────────────────────────────────
// Auto Pilot is the autonomous mission engine (multi-step journeys, smart logic,
// advanced automation insights). It maps to the Pro-tier `multiStepJourneys`
// feature. This router-level guard runs BEFORE every Auto Pilot route/sub-router
// below, so a downgraded user is blocked (403 with upgrade hint) from creating,
// activating, viewing, or approving missions — their data is preserved, access
// is gated. Enterprise bypasses automatically inside requireFeature.
autopilotRouter.use(requireAuth, requireSubscription(), requireFeature('multiStepJourneys'))

// ── Missions CRUD ────────────────────────────────────────────────────────────

// Create a Mission in draft (R1.1).
autopilotRouter.post(
  '/missions',
  requireAuth,
  autoPilotController.createMission.bind(autoPilotController),
)

// List a workspace's missions (R16.1).
autopilotRouter.get(
  '/missions',
  requireAuth,
  autoPilotController.listMissions.bind(autoPilotController),
)

// Mission detail + progress + strategy (R16.4).
autopilotRouter.get(
  '/missions/:id',
  requireAuth,
  autoPilotController.getMission.bind(autoPilotController),
)

// Update operating mode / guardrails; applies to subsequent actions (R1.8, R13.4).
autopilotRouter.patch(
  '/missions/:id',
  requireAuth,
  autoPilotController.updateMission.bind(autoPilotController),
)

// Remove a Mission (+ stop its loop).
autopilotRouter.delete(
  '/missions/:id',
  requireAuth,
  autoPilotController.deleteMission.bind(autoPilotController),
)

// ── Lifecycle ────────────────────────────────────────────────────────────────

// draft/paused → active; starts the repeatable Operating-Loop job (R3).
autopilotRouter.post(
  '/missions/:id/activate',
  requireAuth,
  autoPilotController.activateMission.bind(autoPilotController),
)

// active → paused; removes the loop job so no new action starts ≤60s (R3.5, R3.6).
autopilotRouter.post(
  '/missions/:id/pause',
  requireAuth,
  autoPilotController.pauseMission.bind(autoPilotController),
)

// paused → active; re-registers the loop job (R3.5).
autopilotRouter.post(
  '/missions/:id/resume',
  requireAuth,
  autoPilotController.resumeMission.bind(autoPilotController),
)

// ── Plan / activity / budget ─────────────────────────────────────────────────

// Upcoming Content_Plan slots (R2.5).
autopilotRouter.get(
  '/missions/:id/slots',
  requireAuth,
  autoPilotController.listSlots.bind(autoPilotController),
)

// Pending Approval_Cards — count + contents for Mission Control (R16.4).
autopilotRouter.get(
  '/missions/:id/approvals',
  requireAuth,
  autoPilotController.listApprovals.bind(autoPilotController),
)

// Operating-Loop activity log (audit) (R16.4, R17).
autopilotRouter.get(
  '/missions/:id/activity',
  requireAuth,
  autoPilotController.listActivity.bind(autoPilotController),
)

// Auto Pilot engagement automations (comment / DM / comment-to-DM) for the UI.
autopilotRouter.get(
  '/missions/:id/automations',
  requireAuth,
  autoPilotController.listAutomations.bind(autoPilotController),
)

// Raise Credit_Budget / approve continued spend (R14.5).
autopilotRouter.post(
  '/missions/:id/budget',
  requireAuth,
  autoPilotController.raiseBudget.bind(autoPilotController),
)

// Reverse a reversible autonomous action (R13.6, R17.2).
autopilotRouter.post(
  '/actions/:auditId/undo',
  requireAuth,
  autoPilotController.undoAction.bind(autoPilotController),
)

// ── Composed sub-routers ─────────────────────────────────────────────────────
// Media_Pool (Task 7.2), Approval_Card lifecycle (Task 13.2), and Content_Brief
// delivery (Task 10.3) surfaces. Each carries its own `requireAuth` and ownership
// checks and defines paths under the same `/api/v1/autopilot` base (e.g.
// /missions/:id/media, /approvals/:id/…, /briefs/:id/deliver).
autopilotRouter.use(mediaRouter)
autopilotRouter.use(approvalRouter)
autopilotRouter.use(briefRouter)
autopilotRouter.use(setupRouter)

export { autopilotRouter }
export default autopilotRouter
