/**
 * Auto Pilot — routes barrel.
 *
 * Exposes the sub-routers the main `/api/v1/autopilot` router composes in
 * Task 18.1:
 *   • `mediaRouter`    — Media_Pool endpoints (Task 7.2)
 *   • `approvalRouter` — Approval_Card lifecycle endpoints (Task 13.2)
 */
export { mediaRouter } from './media.routes'
export { default as mediaRoutes } from './media.routes'
export { approvalRouter } from './approval.routes'
export { default as approvalRoutes } from './approval.routes'
