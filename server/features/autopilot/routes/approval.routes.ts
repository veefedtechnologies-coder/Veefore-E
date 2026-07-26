/**
 * Auto Pilot — Approval_Card lifecycle routes.
 *
 * Defines the approval endpoints from the design's REST API table. These are
 * mounted under `/api/v1/autopilot` by the main Auto Pilot router (Task 18.1),
 * which composes this sub-router — keeping the approval surface self-contained:
 *
 *   • POST /approvals/:id/approve → approve the card                 (R4.6)
 *   • POST /approvals/:id/edit    → edit + re-validate vs guardrails  (R4.3, R4.4)
 *   • POST /approvals/:id/reject  → reject (reschedule slot if any)   (R4.5, R5.3, R11.7)
 *
 * Every route is protected by `requireAuth`; workspace ownership is enforced
 * inside the controller via the approval's mission workspace. The publish-time
 * expiry path (R4.7) is driven by a scheduled sweep, not an interactive route.
 *
 * Satisfies Requirements: 4.3, 4.4, 4.5, 4.6, 5.3, 11.7
 */

import { Router } from 'express'
import { requireAuth } from '../../../middleware/require-auth'
import { approvalController } from '../controllers/approval.controller'

const approvalRouter = Router()

// Approve a pending card so its item may execute (R4.6).
approvalRouter.post(
  '/approvals/:id/approve',
  requireAuth,
  approvalController.approve.bind(approvalController),
)

// Edit + re-validate the item against the mission guardrails (R4.3, R4.4).
approvalRouter.post(
  '/approvals/:id/edit',
  requireAuth,
  approvalController.edit.bind(approvalController),
)

// Reject the proposal; reschedule the slot when it is a Content_Slot (R4.5).
approvalRouter.post(
  '/approvals/:id/reject',
  requireAuth,
  approvalController.reject.bind(approvalController),
)

export { approvalRouter }
export default approvalRouter
