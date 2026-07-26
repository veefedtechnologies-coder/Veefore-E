/**
 * Auto Pilot — AutoPilotMission MongoDB model (collection `autopilot_missions`).
 *
 * A Mission is the user-defined growth goal bound 1:1 to a workspace and one
 * connected account (design "Data Models" · R1.4). It carries the goal, niche,
 * brand voice, operating mode, content-source preference, guardrails, the
 * latest THINK strategy, LEARN memory, and MEASURE progress history.
 *
 * All queries are `workspaceId`-scoped, so `workspaceId` is indexed. Active
 * missions are polled by the Operating Loop, so `status` is indexed too.
 *
 * Satisfies Requirements: 1, 2, 13, 14
 */

import mongoose, { Schema, type Document } from 'mongoose'

export type MissionMetric = 'followers' | 'engagement' | 'reach'
export type OperatingMode = 'copilot' | 'autopilot'
export type ContentSourcePreference = 'user-first' | 'ai-first'
export type MissionStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed'
export type FrequencyPer = 'day' | 'week'

export interface IMissionGoal {
  metric: MissionMetric
  targetValue: number
  targetDate?: Date
  startValue: number
}

export interface IMissionGuardrails {
  bannedTopics: string[]
  postingFrequency: { count: number; per: FrequencyPer; windowMs: number }
  creditBudget: number
  approvalRequiredActions: string[]
}

export interface IMissionProgressPoint {
  at: Date
  value: number
}

export interface IAutoPilotMission extends Document {
  workspaceId: unknown
  accountId: string
  platform: string
  goal: IMissionGoal
  niche: string
  brandVoice: string
  localLanguage?: string
  operatingMode: OperatingMode
  contentSourcePreference: ContentSourcePreference
  guardrails: IMissionGuardrails
  strategy?: Record<string, unknown>
  strategyMemory: Record<string, unknown>[]
  progress: IMissionProgressPoint[]
  status: MissionStatus
  lastIterationAt?: Date
  createdAt: Date
  updatedAt: Date
}

const MissionGoalSchema = new Schema<IMissionGoal>(
  {
    metric: { type: String, enum: ['followers', 'engagement', 'reach'], required: true },
    // R1.2: target value bounded 1..100,000,000.
    targetValue: { type: Number, required: true, min: 1, max: 100_000_000 },
    // R1.4: must be a future date (enforced at activation in the controller).
    targetDate: { type: Date, required: false },
    startValue: { type: Number, default: 0 },
  },
  { _id: false }
)

const MissionGuardrailsSchema = new Schema<IMissionGuardrails>(
  {
    bannedTopics: { type: [String], default: [] },
    postingFrequency: {
      count: { type: Number, default: 1, min: 1 },
      per: { type: String, enum: ['day', 'week'], default: 'week' },
      windowMs: { type: Number, default: 7 * 24 * 60 * 60 * 1000 },
    },
    // R14.6: credit budget bounded 1..1,000,000.
    creditBudget: { type: Number, required: true, min: 1, max: 1_000_000 },
    approvalRequiredActions: { type: [String], default: [] },
  },
  { _id: false }
)

const AutoPilotMissionSchema = new Schema<IAutoPilotMission>(
  {
    // Bound 1:1 with a connected account; every read is workspace-scoped (R1.4).
    workspaceId: { type: Schema.Types.Mixed, required: true, index: true },
    accountId: { type: String, required: true },
    // 'instagram' in v1; model allows other platforms (R18.6).
    platform: { type: String, required: true, default: 'instagram' },
    goal: { type: MissionGoalSchema, required: true },
    niche: { type: String, required: true, minlength: 1, maxlength: 100 },
    brandVoice: { type: String, required: true, minlength: 1, maxlength: 2000 },
    localLanguage: { type: String, required: false },
    operatingMode: { type: String, enum: ['copilot', 'autopilot'], required: true },
    contentSourcePreference: {
      type: String,
      enum: ['user-first', 'ai-first'],
      required: true,
      default: 'user-first',
    },
    guardrails: { type: MissionGuardrailsSchema, required: true },
    strategy: { type: Schema.Types.Mixed, required: false },
    strategyMemory: { type: [Schema.Types.Mixed], default: [] },
    progress: {
      type: [
        new Schema<IMissionProgressPoint>(
          { at: { type: Date, required: true }, value: { type: Number, required: true } },
          { _id: false }
        ),
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed', 'failed'],
      required: true,
      default: 'draft',
      index: true,
    },
    lastIterationAt: { type: Date, required: false },
  },
  { timestamps: true }
)

// Loop scheduler queries active missions per workspace/account.
AutoPilotMissionSchema.index({ workspaceId: 1, status: 1 }, { background: true })
AutoPilotMissionSchema.index({ workspaceId: 1, accountId: 1 }, { background: true })

export const AutoPilotMissionModel =
  (mongoose.models.AutoPilotMission as mongoose.Model<IAutoPilotMission>) ||
  mongoose.model<IAutoPilotMission>('AutoPilotMission', AutoPilotMissionSchema)
