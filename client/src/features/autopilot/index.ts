/**
 * Auto Pilot client feature module.
 *
 * Public exports for the VeeGPT Auto Pilot feature.
 */

export { AutoPilotPage } from './pages/AutoPilotPage'
export { AutoPilotChat } from './components/AutoPilotChat'
export { MissionSetupWizard } from './components/MissionSetupWizard'
export { MissionControlDashboard } from './components/MissionControlDashboard'
export { GoalProgressWidget } from './components/GoalProgressWidget'
export { PendingApprovalsWidget } from './components/PendingApprovalsWidget'
export { ActivityLog } from './components/ActivityLog'
export { ApprovalCard } from './components/ApprovalCard'
export type { ApprovalCardData } from './components/ApprovalCard'
export { ContentBriefCard } from './components/ContentBriefCard'
export type { ContentBriefCardData } from './components/ContentBriefCard'
export { MediaPoolPanel } from './components/MediaPoolPanel'
export { MediaUploadCard } from './components/MediaUploadCard'
export { MissionSetupForm } from './components/MissionSetupForm'
export { useAutoPilotRealtime } from './hooks/useAutoPilotRealtime'
export * from './components/missionControl'
export * from './components/missionForm'
export * from './api/autopilotApi'
