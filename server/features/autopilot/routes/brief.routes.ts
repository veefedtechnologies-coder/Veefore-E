/**
 * Auto Pilot — Content_Brief delivery routes.
 *
 * Defines the brief-delivery endpoint from the design's REST API table. Mounted
 * under `/api/v1/autopilot` by the main Auto Pilot router (Task 18.1), which
 * composes this sub-router — keeping the brief surface self-contained:
 *
 *   • POST /briefs/:id/deliver → attach delivered media to the brief's slot (R7.8)
 *
 * The route is protected by `requireAuth`; workspace ownership is enforced inside
 * the controller via the brief's workspace.
 *
 * Satisfies Requirements: 7.8
 */

import { Router } from 'express'
import { requireAuth } from '../../../middleware/require-auth'
import { briefController } from '../controllers/brief.controller'

const briefRouter = Router()

// Attach delivered media to a Content_Brief's slot (R7.8).
briefRouter.post(
  '/briefs/:id/deliver',
  requireAuth,
  briefController.deliver.bind(briefController),
)

export { briefRouter }
export default briefRouter
