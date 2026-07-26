/**
 * Auto Pilot — Mongoose models barrel.
 *
 * Re-exports the six Auto Pilot models plus their document interfaces and
 * enum-like union types (Task 2.1):
 *   AutoPilotMissionModel, ContentSlotModel, MediaPoolItemModel,
 *   ContentBriefModel, ApprovalModel, AutoPilotAuditRecordModel.
 */

export {
  AutoPilotMissionModel,
  type IAutoPilotMission,
  type IMissionGoal,
  type IMissionGuardrails,
  type IMissionProgressPoint,
  type MissionMetric,
  type OperatingMode,
  type ContentSourcePreference,
  type MissionStatus,
  type FrequencyPer,
} from './AutoPilotMissionModel'

export {
  ContentSlotModel,
  type IContentSlot,
  type IContentSlotSource,
  type ContentFormat,
  type ContentSourceKind,
  type ContentSlotStatus,
  type FallbackResolution,
} from './ContentSlotModel'

export {
  MediaPoolItemModel,
  type IMediaPoolItem,
  type MediaOrigin,
  type MediaType,
} from './MediaPoolItemModel'

export {
  ContentBriefModel,
  type IContentBrief,
  type ContentBriefStatus,
} from './ContentBriefModel'

export {
  ApprovalModel,
  type IApproval,
  type ApprovalItemType,
  type ApprovalStatus,
} from './ApprovalModel'

export {
  AutoPilotAuditRecordModel,
  type IAutoPilotAuditRecord,
  type LoopStage,
  type AuditOutcome,
} from './AutoPilotAuditRecordModel'
