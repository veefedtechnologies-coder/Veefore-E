/**
 * Auto Pilot — routes barrel.
 *
 * Exposes the main `/api/v1/autopilot` router (Task 18.1) and the
 * self-contained sub-routers it composes:
 *   • `autopilotRouter` — Mission lifecycle + composed sub-routers (Task 18.1)
 *   • `mediaRouter`    — Media_Pool endpoints (Task 7.2)
 *   • `approvalRouter` — Approval_Card lifecycle endpoints (Task 13.2)
 *   • `briefRouter`    — Content_Brief delivery endpoint (Task 10.3)
 */
export { autopilotRouter } from './autopilot.routes'
export { default as autopilotRoutes } from './autopilot.routes'
export { mediaRouter } from './media.routes'
export { default as mediaRoutes } from './media.routes'
export { approvalRouter } from './approval.routes'
export { default as approvalRoutes } from './approval.routes'
export { briefRouter } from './brief.routes'
export { default as briefRoutes } from './brief.routes'
