/**
 * Auto Pilot — controllers barrel.
 *
 * Exposes the Media_Pool controller (Task 7.2), the Approval_Card lifecycle
 * controller (Task 13.2), and the Mission lifecycle controller (Task 18.1).
 */
export { MediaController, mediaController } from './media.controller'
export { ApprovalController, approvalController } from './approval.controller'
export { AutoPilotController, autoPilotController } from './autopilot.controller'
export type { LoopScheduler, AuditLogReader } from './autopilot.controller'
export { BriefController, briefController, type BriefWorkspaceReader } from './brief.controller'
