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
  tokensUsed: number
  createdAt: Date | string
}

export type StreamingContent = {
  [messageId: number]: string
}

export interface WebSocketMessage {
  type: 'status' | 'userMessage' | 'aiMessageStart' | 'chunk' | 'complete' | 'error' | 'toolCall' | 'listCard' | 'editCard' | 'infoCard'
  messageId?: number
  content?: string
  status?: string
  message?: ChatMessage
  timestamp?: number
  error?: string
  finalContent?: string
  conversationId?: number
  /** schedule_post tool-call result (a post plan) — present on `toolCall`. */
  plan?: any
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
  name?: string
}
