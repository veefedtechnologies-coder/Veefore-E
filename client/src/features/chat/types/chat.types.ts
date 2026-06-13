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
  tokensUsed: number
  createdAt: Date | string
}

export type StreamingContent = {
  [messageId: number]: string
}

export interface WebSocketMessage {
  type: 'status' | 'userMessage' | 'aiMessageStart' | 'chunk' | 'complete' | 'error'
  messageId?: number
  content?: string
  status?: string
  message?: ChatMessage
  timestamp?: number
  error?: string
}
