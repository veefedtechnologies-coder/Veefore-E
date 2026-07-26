import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ChatBubbleSkeleton — placeholder for a single VeeGPT chat message bubble
 * (see `features/chat/components/ChatInterface.tsx`).
 *
 * Mirrors the real message slot: the outer `flex flex-col space-y-2` column
 * aligned `items-end` for user / `items-start` for assistant, a small header
 * line (the "You" / "Veegpt …" label), the `px-4 py-3 rounded-2xl` content
 * bubble (gray fill for user, transparent for assistant) containing a few
 * variable-width text lines, and a short timestamp line. Pure and
 * presentational — no data, no effects.
 *
 * The bubble alignment can be controlled with `role` (defaults to
 * `'assistant'`) so callers can mirror either side of a conversation.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2).
 */
export interface ChatBubbleSkeletonProps {
  /** Which side of the conversation the bubble represents. */
  role?: 'user' | 'assistant'
}

function ChatBubbleSkeletonImpl({ role = 'assistant' }: ChatBubbleSkeletonProps) {
  const isUser = role === 'user'

  return (
    <div
      data-testid="chat-bubble-skeleton"
      className={`flex flex-col space-y-2 ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div className={isUser ? 'max-w-sm w-fit' : 'max-w-4xl w-full'}>
        {/* Header line — "You" or the VeeGPT label */}
        <div
          className={`flex items-center mb-2 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
          {!isUser && (
            <Skeleton variant="avatar" className="w-4 h-4 rounded-full mr-1" />
          )}
          <Skeleton variant="text" className="h-3 w-16" />
        </div>

        {/* Content bubble — gray fill for user, transparent for assistant */}
        <div
          className={`px-4 py-3 rounded-2xl space-y-2 ${
            isUser
              ? 'bg-gray-200 dark:bg-gray-700 inline-block'
              : 'bg-transparent'
          }`}
        >
          <Skeleton variant="text" className="h-4 w-full" />
          <Skeleton variant="text" className="h-4 w-4/5" />
          <Skeleton variant="text" className="h-4 w-3/5" />
        </div>

        {/* Timestamp line */}
        <Skeleton
          variant="text"
          className={`h-3 w-12 mt-2 ${isUser ? 'ml-auto' : ''}`}
        />
      </div>
    </div>
  )
}

export const ChatBubbleSkeleton = React.memo(ChatBubbleSkeletonImpl)
ChatBubbleSkeleton.displayName = 'ChatBubbleSkeleton'
