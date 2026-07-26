/**
 * Auto Pilot — AutoPilotAuditRecord MongoDB model
 * (collection `autopilot_audit_records`).
 *
 * Every mission-level action (publish, generate, schedule, reschedule,
 * substitute, guardrail block, …) is persisted here with its triggering
 * context, outcome, reversibility metadata, pre-execution state, and reversal
 * op so reversible actions can be undone (design "Data Models" · R13.5, R17).
 * Engagement-automation execution (comment/DM replies) stays with the existing
 * AuditTrailService and is not duplicated here.
 *
 * Queried per mission and per workspace for the activity log; append-only, so
 * only a `createdAt` timestamp is tracked.
 *
 * Satisfies Requirements: 13, 17
 */

import mongoose, { Schema, type Document } from 'mongoose'

export type LoopStage =
  | 'SENSE'
  | 'THINK'
  | 'PLAN'
  | 'GATE'
  | 'ACT'
  | 'MEASURE'
  | 'LEARN'

export type AuditOutcome = 'success' | 'failure' | 'blocked' | 'deferred'

export interface IAutoPilotAuditRecord extends Document {
  missionId: mongoose.Types.ObjectId
  workspaceId: unknown
  stage: LoopStage
  action: string
  triggeringContext: Record<string, unknown>
  outcome: AuditOutcome
  reversible: boolean
  preExecutionState?: Record<string, unknown>
  reversalOp?: Record<string, unknown>
  reversedAt?: Date
  createdAt: Date
}

const AutoPilotAuditRecordSchema = new Schema<IAutoPilotAuditRecord>(
  {
    missionId: { type: Schema.Types.ObjectId, ref: 'AutoPilotMission', required: true, index: true },
    workspaceId: { type: Schema.Types.Mixed, required: true, index: true },
    stage: {
      type: String,
      enum: ['SENSE', 'THINK', 'PLAN', 'GATE', 'ACT', 'MEASURE', 'LEARN'],
      required: true,
    },
    action: { type: String, required: true },
    // R17.1: the context that triggered the action.
    triggeringContext: { type: Schema.Types.Mixed, default: {} },
    outcome: {
      type: String,
      enum: ['success', 'failure', 'blocked', 'deferred'],
      required: true,
    },
    // R17.1: whether the action can be reversed.
    reversible: { type: Boolean, required: true, default: false },
    // R13.5: captured state for reversal.
    preExecutionState: { type: Schema.Types.Mixed, required: false },
    reversalOp: { type: Schema.Types.Mixed, required: false },
    reversedAt: { type: Date, required: false },
  },
  // Append-only audit log: track creation time only.
  { timestamps: { createdAt: true, updatedAt: false } }
)

// Activity-log read pattern: a mission's records newest-first.
AutoPilotAuditRecordSchema.index({ missionId: 1, createdAt: -1 }, { background: true })
AutoPilotAuditRecordSchema.index({ workspaceId: 1, createdAt: -1 }, { background: true })

export const AutoPilotAuditRecordModel =
  (mongoose.models.AutoPilotAuditRecord as mongoose.Model<IAutoPilotAuditRecord>) ||
  mongoose.model<IAutoPilotAuditRecord>('AutoPilotAuditRecord', AutoPilotAuditRecordSchema)
