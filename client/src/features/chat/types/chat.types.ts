/**
 * Chat Feature Type Definitions
 * Extracted from VeeGPT.tsx for better type safety and reusability
 */

export type ChatConversation = {
  id: number
  userId: string
  workspaceId: string
  title: string
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

export type ChatMessage = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  attachments?: { name?: string; mimeType: string }[]
  /** Inline post-confirm card (from a schedule_post tool call), if any. */
  postCard?: { plan: any; mediaUrls?: string[]; status?: 'idle' | 'working' | 'done' | 'error'; resultText?: string }
  /** Read-only list of posts to render as cards. */
  listCard?: { kind: string; title?: string; items: any[] }
  /** Edit-confirmation cards (reschedule/cancel/caption/delete/duplicate). */
  editCards?: Array<{ id?: string; action: string; contentId: string; title?: string; post?: any; current?: any; proposed?: any; status?: 'idle' | 'working' | 'done' | 'error'; resultText?: string }>
  /** Info/assist cards (captions, hashtags, insight, recommendations, best_time, trends). */
  infoCards?: Array<{ id?: string; kind: string; title?: string; [key: string]: any }>
  /** Transient LIVE image-generation card shown WHILE the image is being
   *  generated/edited (before the final image arrives). Cleared on finalize. */
  liveImageCard?: { kind: 'image'; status: string; operation?: string; subject?: string } | null
  /** Transient LIVE video-editor card shown WHILE the server ingests/probes the
   *  attached video (before the final video_editor card with projectId/sourceId
   *  arrives). Cleared on finalize. */
  liveVideoEditorCard?: {
    kind: 'video_editor'
    status: string
    subject?: string
    /** Stage-derived phase streamed by the server-driven edit turn. */
    phase?: string
    /** Integer progress percentage (0..100), stage-derived. */
    percent?: number
    /** Planned steps, emitted once planning completes. `limitation` is set only
     *  for a step the planner marked `unavailable`. */
    plan?: Array<{
      kind: string
      type: string
      status: string
      label: string
      limitation?: string
    }>
    /** Index into the SAME `plan` array of the step the server is working on.
     *  The card derives BOTH its checklist current-row highlight AND the overlay's
     *  "Step N of M" counter from it, so the two surfaces cannot disagree.
     *  Absent means nothing is executing yet, or the turn is over. */
    activeStepIndex?: number
  } | null
  /** Auto Pilot card (Approval_Card / Content_Brief) pushed into the mission's
   *  Auto Pilot conversation by the Operating Loop (R16.2/R16.3). The `kind`
   *  discriminates the client renderer (`approval` | `content-brief`). */
  autopilotCard?: { kind: string; [key: string]: any }
  /** Persisted model "thinking"/reasoning summary, rehydrated from history so the
   *  collapsible Thoughts panel survives refresh and a stop/abort. */
  reasoning?: string
  /** True when this assistant reply is a retryable provider error. */
  retryable?: boolean
  /** How this assistant turn ended when it did NOT complete normally:
   *  'failed'  → the model/provider errored (persisted so it survives refresh).
   *  'stopped' → the user hit Stop before it finished.
   *  Absent/undefined means a normal, complete response. */
  deliveryStatus?: 'failed' | 'stopped'
  tokensUsed: number
  createdAt: Date | string
}

export type StreamingContent = {
  [messageId: number]: string
}

/** A single live deep-research progress event (from the server SSE stream). */
export interface ResearchProgressEvent {
  kind: 'planning' | 'searching' | 'reading' | 'subtopic' | 'writing' | 'done'
  label: string
  detail?: string
  queries?: string[]
  newSources?: Array<{ title: string; url: string; domain: string; favicon?: string }>
  sourceCount?: number
}

/** Accumulated deep-research progress for one assistant message — drives the
 *  ChatGPT/Claude-style live research banner. */
export interface ResearchProgressState {
  active: boolean
  phase: ResearchProgressEvent['kind']
  steps: Array<{ kind: string; label: string; detail?: string; queries?: string[]; count?: number }>
  sources: Array<{ title: string; url: string; domain: string; favicon?: string }>
  sourceCount: number
  searchCount: number
}

export interface WebSocketMessage {
  type: 'status' | 'userMessage' | 'aiMessageStart' | 'chunk' | 'complete' | 'error' | 'toolCall' | 'listCard' | 'editCard' | 'infoCard' | 'imageProgress' | 'videoEditorProgress' | 'reasoning' | 'researchProgress' | 'modelNotice'
  messageId?: number
  content?: string
  /** Live deep-research progress payload (present on `researchProgress`). */
  progress?: ResearchProgressEvent
  /** Incremental reasoning/thinking text (present on `reasoning` events). */
  delta?: string
  status?: string
  message?: ChatMessage
  timestamp?: number
  error?: string
  finalContent?: string
  conversationId?: number
  /** schedule_post tool-call result (a post plan) — present on `toolCall`.
   *  ALSO the video-editor plan checklist on `videoEditorProgress`. */
  plan?: any
  /** Index into the `videoEditorProgress` plan array of the step being worked on. */
  activeStepIndex?: number
  /** Persisted post-confirm card — may arrive on `complete`. */
  postCard?: { plan: any; mediaUrls?: string[]; status?: 'idle' | 'working' | 'done' | 'error'; resultText?: string }
  /** Read-only list of posts to render as cards. */
  listCard?: { kind: string; title?: string; items: any[] }
  /** Edit-confirmation card (reschedule/cancel/update caption). */
  editCard?: { action: string; contentId: string; title?: string; current?: any; proposed?: any; status?: 'idle' | 'working' | 'done' | 'error'; resultText?: string }
  /** Multiple edit-confirmation cards (multi-tool turn). */
  editCards?: Array<{ id?: string; action: string; contentId: string; title?: string; post?: any; current?: any; proposed?: any; status?: 'idle' | 'working' | 'done' | 'error'; resultText?: string }>
  /** Info/assist card (captions/hashtags/insight/recommendations/best_time/trends). */
  infoCard?: { id?: string; kind: string; title?: string; [key: string]: any }
  /** Multiple info/assist cards (multi-tool turn). */
  infoCards?: Array<{ id?: string; kind: string; title?: string; [key: string]: any }>
  /** True when the assistant message is a retryable provider error. */
  retryable?: boolean
  /** Non-normal completion state carried on `complete`/`error` events. */
  deliveryStatus?: 'failed' | 'stopped'
  name?: string
}
