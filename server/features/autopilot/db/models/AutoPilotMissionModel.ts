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

/**
 * The only platform Auto Pilot executes autonomously in v1 (R18.6/R18.7). The
 * Mission model may *represent* other platforms for future extension, but
 * autonomous execution is limited to Instagram — activation of a non-Instagram
 * mission is declined at the controller and side-effecting loop stages are
 * suppressed defensively in the orchestrator.
 */
export const SUPPORTED_EXECUTION_PLATFORM = 'instagram'

/**
 * The platforms Auto Pilot can execute autonomously. Instagram was the v1
 * platform; Facebook Pages are now supported too (publishing rides
 * `FacebookProvider.publish`, and the loop's SENSE/PLAN/GATE/ACT/MEASURE stages
 * are platform-agnostic). Other platforms remain representable in the Mission
 * model for future extension but are not yet executed.
 */
export const SUPPORTED_EXECUTION_PLATFORMS = ['instagram', 'facebook'] as const

/**
 * True when `platform` is the v1 autonomously-executable platform (Instagram).
 * Comparison is case-insensitive and trims surrounding whitespace. A
 * missing/empty platform is treated as Instagram since the model defaults to it
 * (R18.6): the mission is representable for any platform, but only Instagram is
 * executed.
 */
export function isInstagramPlatform(platform?: string | null): boolean {
  if (platform == null) return true
  const normalized = platform.trim().toLowerCase()
  return normalized === '' || normalized === SUPPORTED_EXECUTION_PLATFORM
}

/**
 * True when Auto Pilot can autonomously execute a mission on `platform`
 * (currently Instagram or Facebook). Case-insensitive and whitespace-trimmed; a
 * missing/empty platform defaults to Instagram (the model default). Non-executed
 * platforms return false so activation is declined and side-effecting loop
 * stages are suppressed.
 */
export function isSupportedExecutionPlatform(platform?: string | null): boolean {
  if (platform == null) return true
  const normalized = platform.trim().toLowerCase()
  return normalized === '' || (SUPPORTED_EXECUTION_PLATFORMS as readonly string[]).includes(normalized)
}

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
  /**
   * Consecutive Operating-Loop iterations in which a required backing service was
   * unreachable (R18.4/R18.5). Incremented on each outage tick, reset to 0 on a
   * successful iteration. When it reaches the escalation threshold (3), the loop
   * pauses the Mission and surfaces the failure without discarding state.
   */
  consecutiveOutageStreak: number
  /**
   * Persistent memory log for the Auto Pilot agent — stores a compact history of
   * key autonomous decisions, published posts, and user instructions so the loop
   * can reference past context across restarts and build on prior actions rather
   * than repeating itself. Each entry is a timestamped summary (role + content).
   *
   * This is the Auto Pilot's equivalent of VeeGPT's chat memory: it lets the
   * agent know what it has already done, what worked, what the user asked, and
   * what was approved/rejected, so it can make better decisions on every tick.
   * Capped at the last 100 entries to bound document size.
   */
  agentMemory: Array<{
    role: 'agent' | 'user' | 'system'
    content: string
    at: Date
    type?: 'published' | 'automation' | 'decision' | 'instruction' | 'approval' | 'rejection'
  }>
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
    // LEARN insights are arbitrary JSON objects. Mongoose's generic typings do
    // not reconcile an array of `Mixed` against a typed `Record<string,unknown>[]`
    // field, so the element type is declared as a Mixed subdocument option — the
    // supported way to model "array of arbitrary objects" that also type-checks.
    strategyMemory: { type: [{ type: Schema.Types.Mixed }], default: [] },
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
    // R18.4/R18.5: consecutive backing-service outage iterations (see interface).
    consecutiveOutageStreak: { type: Number, default: 0, min: 0 },
    // Agent memory: persistent log of key autopilot decisions, published posts,
    // and user instructions. Lets the agent know what it already did and build
    // on prior context across restarts (the autopilot's "long-term memory").
    // Capped at 100 entries at the application layer (see MissionRepository).
    agentMemory: {
      type: [
        new Schema(
          {
            role: { type: String, enum: ['agent', 'user', 'system'], required: true },
            content: { type: String, required: true },
            at: { type: Date, required: true, default: () => new Date() },
            type: {
              type: String,
              enum: ['published', 'automation', 'decision', 'instruction', 'approval', 'rejection'],
              required: false,
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
)

// Loop scheduler queries active missions per workspace/account.
AutoPilotMissionSchema.index({ workspaceId: 1, status: 1 }, { background: true })
AutoPilotMissionSchema.index({ workspaceId: 1, accountId: 1 }, { background: true })

export const AutoPilotMissionModel =
  (mongoose.models.AutoPilotMission as mongoose.Model<IAutoPilotMission>) ||
  mongoose.model<IAutoPilotMission>('AutoPilotMission', AutoPilotMissionSchema)
