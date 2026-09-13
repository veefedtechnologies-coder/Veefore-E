/**
 * Auto Pilot client API.
 *
 * Thin wrappers over the `/api/v1/autopilot/*` REST surface (Task 18.1) using
 * the repo's shared {@link apiRequest} helper (auth + refresh + JSON handling).
 * Kept separate from the React components so the network shape is reusable by
 * hooks and unit-testable in isolation.
 *
 * Requirements: 1.1, 16.1
 */

import { apiRequest } from '@/lib/queryClient'
import type { CreateMissionPayload } from '../components/missionForm'

const BASE = '/api/v1/autopilot'

/** A mission as serialized by the server controller. */
export interface Mission {
  id: string
  workspaceId: string | null
  accountId: string
  platform: string
  goal: {
    metric: string
    targetValue: number
    targetDate?: string | null
    startValue?: number
  }
  niche: string
  brandVoice: string
  localLanguage: string | null
  operatingMode: 'copilot' | 'autopilot'
  contentSourcePreference: 'user-first' | 'ai-first'
  guardrails: {
    bannedTopics: string[]
    postingFrequency: { count: number; per: string; windowMs?: number }
    creditBudget: number
    approvalRequiredActions: string[]
  }
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed'
  createdAt: string | null
  updatedAt: string | null
}

/** A single MEASURE-stage progress point in the mission history. */
export interface ProgressPoint {
  at: string | null
  value: number
}

/** A mission with the extra detail fields the control dashboard renders. */
export interface MissionDetail extends Mission {
  strategy: Record<string, unknown> | null
  strategyMemory: unknown[]
  progress: ProgressPoint[]
  lastIterationAt: string | null
}

/** A planned Content_Slot as serialized by the server controller. */
export interface ContentSlot {
  id: string
  missionId: string | null
  workspaceId: string | null
  scheduledAt: string | null
  format: string
  theme: string | null
  source: string
  caption: string | null
  hashtags: string[]
  mediaUrls: string[]
  contentId: string | null
  status: string
  fallbackResolution: string | null
}

/** An Auto Pilot engagement automation (comment / DM / comment-to-DM). */
export interface MissionAutomation {
  id: string
  kind: 'comment-only' | 'dm-only' | 'comment-to-dm'
  keyword: string | null
  commentReply: string | null
  dmMessage: string | null
  isActive: boolean
  createdAt: string | null
}

/** An Operating-Loop activity (audit) record. */
export interface ActivityRecord {
  id: string
  missionId: string | null
  stage: string
  action: string
  triggeringContext: Record<string, unknown>
  outcome: string
  reversible: boolean
  reversedAt: string | null
  createdAt: string | null
}

/** A pending Approval_Card awaiting a human decision. */
export interface PendingApproval {
  id: string
  missionId: string | null
  workspaceId: string | null
  itemType: 'content-slot' | 'caption' | 'automation' | 'plan' | 'budget'
  itemRef: string | null
  chatMessageId: number | null
  status: string
  editedPayload: Record<string, unknown> | null
  expiresAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface CreateMissionResponse {
  success: boolean
  mission: Mission
}

interface ListMissionsResponse {
  success: boolean
  missions: Mission[]
}

interface MissionResponse {
  success: boolean
  mission: MissionDetail
}

interface ListSlotsResponse {
  success: boolean
  slots: ContentSlot[]
}

interface ListActivityResponse {
  success: boolean
  activity: ActivityRecord[]
}

interface ListApprovalsResponse {
  success: boolean
  count: number
  approvals: PendingApproval[]
}

/** Create a Mission (draft). POST /api/v1/autopilot/missions (R1.1). */
export async function createMission(payload: CreateMissionPayload): Promise<Mission> {
  const res: CreateMissionResponse = await apiRequest(`${BASE}/missions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.mission
}

/** List a workspace's missions. GET /api/v1/autopilot/missions (R16.1). */
export async function listMissions(workspaceId: string): Promise<Mission[]> {
  const res: ListMissionsResponse = await apiRequest(
    `${BASE}/missions?workspaceId=${encodeURIComponent(workspaceId)}`,
  )
  return res.missions ?? []
}

/** Mission detail + progress + strategy. GET /missions/:id (R16.4). */
export async function getMission(missionId: string): Promise<MissionDetail> {
  const res: MissionResponse = await apiRequest(`${BASE}/missions/${encodeURIComponent(missionId)}`)
  return res.mission
}

/** Upcoming Content_Plan slots. GET /missions/:id/slots (R2.5). */
export async function listSlots(missionId: string): Promise<ContentSlot[]> {
  const res: ListSlotsResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/slots`,
  )
  return res.slots ?? []
}

/** Operating-Loop activity log (newest-first). GET /missions/:id/activity (R16.4). */
export async function listActivity(missionId: string, limit = 50): Promise<ActivityRecord[]> {
  const res: ListActivityResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/activity?limit=${encodeURIComponent(limit)}`,
  )
  return res.activity ?? []
}

interface ListAutomationsResponse {
  success: boolean
  automations: MissionAutomation[]
}

/** The mission's Auto Pilot engagement automations. GET /missions/:id/automations. */
export async function listAutomations(missionId: string): Promise<MissionAutomation[]> {
  const res: ListAutomationsResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/automations`,
  )
  return res.automations ?? []
}

/** Pending Approval_Cards (count + contents). GET /missions/:id/approvals (R16.4). */
export async function listApprovals(missionId: string): Promise<PendingApproval[]> {
  const res: ListApprovalsResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/approvals`,
  )
  return res.approvals ?? []
}

/** Activate a draft/paused mission (starts the Operating Loop). R3. */
export async function activateMission(missionId: string): Promise<MissionDetail> {
  const res: MissionResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/activate`,
    { method: 'POST' },
  )
  return res.mission
}

/** Pause an active mission (stops new iterations). R3.5, R3.6. */
export async function pauseMission(missionId: string): Promise<MissionDetail> {
  const res: MissionResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/pause`,
    { method: 'POST' },
  )
  return res.mission
}

/** Resume a paused mission (restarts the Operating Loop). R3.5. */
export async function resumeMission(missionId: string): Promise<MissionDetail> {
  const res: MissionResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/resume`,
    { method: 'POST' },
  )
  return res.mission
}

/* -------------------------------------------------------------------------- */
/* Approval_Card lifecycle (Task 13.2 endpoints)                              */
/* -------------------------------------------------------------------------- */

/** An approval as serialized by the approval controller after a decision. */
export interface ApprovalRecord {
  id: string
  missionId: string | null
  workspaceId: string | null
  itemType: 'content-slot' | 'caption' | 'automation' | 'plan' | 'budget'
  itemRef: string | null
  status: 'pending' | 'approved' | 'edited' | 'rejected' | 'expired'
  editedPayload: Record<string, unknown> | null
  decidedAt: string | null
  expiresAt: string | null
}

interface ApprovalMutationResponse {
  success: boolean
  approval: ApprovalRecord
  slotResolution?: string | null
}

/**
 * Optional re-validation facts the server evaluates when applying an edit
 * (frequency-cap / credit-budget inputs, an already-detected brand-voice
 * violation, and the guardrail action type). All fields are optional — the
 * server only re-checks what it is given (R4.3/R4.4).
 */
export interface ApprovalEditRevalidation {
  at?: string | number
  existingActionTimes?: (string | number)[]
  credits?: { consumed: number; estimatedCost: number }
  brandVoiceViolation?: string | null
  type?: string
}

/** Approve a pending Approval_Card so its item may execute. POST /approvals/:id/approve (R4.6). */
export async function approveApproval(approvalId: string): Promise<ApprovalRecord> {
  const res: ApprovalMutationResponse = await apiRequest(
    `${BASE}/approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: 'POST' },
  )
  return res.approval
}

/**
 * Apply the user's edits after re-validating them against the mission
 * guardrails. POST /approvals/:id/edit (R4.3, R4.4). Edits that introduce a
 * banned topic or exceed a guardrail bound are rejected by the server (HTTP
 * 422) — {@link apiRequest} surfaces that as a thrown error the caller shows.
 */
export async function editApproval(
  approvalId: string,
  editedPayload: Record<string, unknown>,
  revalidation?: ApprovalEditRevalidation,
): Promise<ApprovalRecord> {
  const res: ApprovalMutationResponse = await apiRequest(
    `${BASE}/approvals/${encodeURIComponent(approvalId)}/edit`,
    {
      method: 'POST',
      body: JSON.stringify({ editedPayload, ...(revalidation ? { revalidation } : {}) }),
    },
  )
  return res.approval
}

/** The outcome of rejecting an Approval_Card (with any slot resolution). */
export interface RejectApprovalResult {
  approval: ApprovalRecord
  slotResolution: string | null
}

/** Reject an Approval_Card. POST /approvals/:id/reject (R4.5, R5.3, R11.7). */
export async function rejectApproval(approvalId: string): Promise<RejectApprovalResult> {
  const res: ApprovalMutationResponse = await apiRequest(
    `${BASE}/approvals/${encodeURIComponent(approvalId)}/reject`,
    { method: 'POST' },
  )
  return { approval: res.approval, slotResolution: res.slotResolution ?? null }
}

/* -------------------------------------------------------------------------- */
/* Media Pool (Task 7.2 endpoints)                                            */
/* -------------------------------------------------------------------------- */

/** A Media_Pool item as serialized by the media controller. */
export interface MediaPoolItem {
  id: string
  workspaceId: string | null
  missionId: string | null
  origin: string
  mediaUrl: string
  mediaType: 'image' | 'video'
  format: string | null
  sizeBytes: number
  userIntent: string | null
  userKeyword: string | null
  available: boolean
  usedInSlots: string[]
  createdAt: string | null
  updatedAt: string | null
}

interface UploadMediaResponse {
  success: boolean
  item: MediaPoolItem
}

interface ListMediaResponse {
  success: boolean
  items: MediaPoolItem[]
}

interface DeleteMediaResponse {
  success: boolean
  item: MediaPoolItem | { id: string; available: boolean }
}

/**
 * Upload a media item to a mission workspace's pool. POST /missions/:id/media
 * (R6.1, R6.5). Sends the file as multipart/form-data (field `file`);
 * {@link apiRequest} lets the browser set the multipart boundary for FormData.
 */
export async function uploadMedia(
  missionId: string,
  file: File,
  meta?: { userIntent?: string; userKeyword?: string },
): Promise<MediaPoolItem> {
  const form = new FormData()
  form.append('file', file)
  if (meta?.userIntent) form.append('userIntent', meta.userIntent)
  if (meta?.userKeyword) form.append('userKeyword', meta.userKeyword)
  const res: UploadMediaResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/media`,
    { method: 'POST', body: form },
  )
  return res.item
}

/** List a mission workspace's reusable (available) pool. GET /missions/:id/media (R6). */
export async function listMedia(missionId: string): Promise<MediaPoolItem[]> {
  const res: ListMediaResponse = await apiRequest(
    `${BASE}/missions/${encodeURIComponent(missionId)}/media`,
  )
  return res.items ?? []
}

/** Remove a pool item at the user's request. DELETE /media/:itemId (R6.6). */
export async function deleteMedia(itemId: string): Promise<void> {
  await apiRequest(`${BASE}/media/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
}

/* -------------------------------------------------------------------------- */
/* Content_Brief delivery (Task 10.3 endpoint)                                */
/* -------------------------------------------------------------------------- */

/** Attach delivered media to a Content_Brief's slot. POST /briefs/:id/deliver (R7.8). */
export async function deliverBrief(
  briefId: string,
  input: { mediaPoolItemId: string },
): Promise<void> {
  await apiRequest(`${BASE}/briefs/${encodeURIComponent(briefId)}/deliver`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/* -------------------------------------------------------------------------- */
/* AI-driven mission setup (Task: conversational setup)                       */
/* -------------------------------------------------------------------------- */

/** The mission settings accumulated across the conversational setup. */
export interface SetupValues {
  goalMetric?: 'followers' | 'engagement' | 'reach'
  targetValue?: number
  targetDate?: string
  niche?: string
  brandVoice?: string
  localLanguage?: string
  operatingMode?: 'copilot' | 'autopilot'
  contentSourcePreference?: 'user-first' | 'ai-first'
  postingCount?: number
  postingPer?: 'day' | 'week'
  creditBudget?: number
  bannedTopics?: string[]
}

/** A dynamic slide-up form field the AI asked the user to fill. */
export interface SetupFieldSpec {
  key: keyof SetupValues
  label: string
  type: 'select' | 'number' | 'text' | 'textarea' | 'date' | 'tags'
  required: boolean
  options?: { label: string; value: string }[]
  placeholder?: string
  help?: string
}

/** DB-sourced analytics snapshot the AI used to ground setup. */
export interface AccountContext {
  username?: string
  platform?: string
  followers?: number
  following?: number
  posts?: number
  avgLikes?: number
  avgComments?: number
  avgReach?: number
  engagementRate?: number
  avgEngagement?: number
  accountReach?: number
  isBusiness?: boolean
  isVerified?: boolean
  biography?: string
  bestTimes?: string[]
}

export interface InterpretSetupResult {
  reply: string
  values: SetupValues
  missingRequired: (keyof SetupValues)[]
  formFields: SetupFieldSpec[]
  readyToLaunch: boolean
  accountContext: AccountContext | null
}

/**
 * Interpret one conversational setup message. The AI extracts + validates
 * mission fields, computes what's still required, and returns the dynamic form
 * spec to surface — grounded in the selected account's DB analytics.
 * POST /api/v1/autopilot/setup/interpret.
 */
export async function interpretSetup(input: {
  message: string
  currentValues?: SetupValues
  accountId?: string
  workspaceId?: string
}): Promise<InterpretSetupResult> {
  return apiRequest(`${BASE}/setup/interpret`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** A data-grounded cadence recommendation from the plan advisor. */
export interface CadenceAdvice {
  recommendedPerWeek: number
  currentPerWeek: number
  mode: 'copilot' | 'autopilot'
  rationale: string
}

export interface PlanAdvice {
  cadence: CadenceAdvice | null
  tips: string[]
}

/**
 * Review a completed plan against the account's DB analytics + goal, returning
 * a data-grounded cadence recommendation and tips. POST /setup/advise.
 */
export async function adviseSetup(input: {
  values: SetupValues
  accountId?: string
  workspaceId?: string
}): Promise<PlanAdvice> {
  return apiRequest(`${BASE}/setup/advise`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Client-side required-field list (mirrors the server) for local re-checks. */
export const REQUIRED_SETUP_FIELDS: (keyof SetupValues)[] = [
  'goalMetric',
  'targetValue',
  'niche',
  'brandVoice',
  'operatingMode',
  'contentSourcePreference',
  'postingCount',
  'postingPer',
  'creditBudget',
]
